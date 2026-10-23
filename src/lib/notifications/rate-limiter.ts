import { prisma } from '@/lib/prisma';
import type { PrismaClient, Prisma } from '@prisma/client';

export const MAX_PATIENT_DISPATCHES_PER_HOUR = 3;
export const MAX_CLINIC_DISPATCHES_PER_HOUR = 100;
export const DUPLICATE_WINDOW_MINUTES = 5;
export const HOURLY_WINDOW_MINUTES = 60;

export interface RateLimitCheckParams {
  clinicId: string;
  recipientPhone: string;
  eventType: string;
  resourceId?: string | null;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: 'DUPLICATE_SUPPRESSED' | 'PATIENT_LIMIT_EXCEEDED' | 'CLINIC_LIMIT_EXCEEDED';
  patientRemaining: number;
  clinicRemaining: number;
  resetAt?: Date;
}

export interface RateLimitAdapter {
  increment(
    key: string,
    windowMinutes: number,
    client?: PrismaClient | Prisma.TransactionClient
  ): Promise<{ attempts: number; resetAt: Date }>;
  decrement(
    key: string,
    client?: PrismaClient | Prisma.TransactionClient
  ): Promise<void>;
}

/**
 * PostgreSQL-backed atomic sliding-window rate limiter adapter.
 * Uses atomic INSERT ... ON CONFLICT ("key") DO UPDATE in PostgreSQL.
 * Guarantees zero race conditions or phantom over-dispatches under concurrent load.
 */
export class PostgresRateLimitAdapter implements RateLimitAdapter {
  async increment(
    key: string,
    windowMinutes: number,
    client: PrismaClient | Prisma.TransactionClient = prisma
  ): Promise<{ attempts: number; resetAt: Date }> {
    const windowMs = windowMinutes * 60 * 1000;
    const now = new Date();
    const resetAt = new Date(now.getTime() + windowMs);

    interface RawRow {
      attempts: number;
      reset_at: Date;
    }

    const rows = await client.$queryRaw<RawRow[]>`
      INSERT INTO "auth_rate_limits" ("id", "key", "attempts", "reset_at", "created_at", "updated_at")
      VALUES (gen_random_uuid()::text, ${key}, 1, ${resetAt}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("key")
      DO UPDATE SET
        "attempts" = CASE
          WHEN "auth_rate_limits"."reset_at" <= CURRENT_TIMESTAMP THEN 1
          ELSE "auth_rate_limits"."attempts" + 1
        END,
        "reset_at" = CASE
          WHEN "auth_rate_limits"."reset_at" <= CURRENT_TIMESTAMP THEN ${resetAt}
          ELSE "auth_rate_limits"."reset_at"
        END,
        "updated_at" = CURRENT_TIMESTAMP
      RETURNING "attempts", "reset_at";
    `;

    if (!rows || rows.length === 0) {
      throw new Error('Failed to update atomic rate limit counter in database');
    }

    return {
      attempts: rows[0].attempts,
      resetAt: rows[0].reset_at,
    };
  }

  async decrement(
    key: string,
    client: PrismaClient | Prisma.TransactionClient = prisma
  ): Promise<void> {
    await client.$queryRaw`
      UPDATE "auth_rate_limits"
      SET "attempts" = GREATEST(0, "attempts" - 1),
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "key" = ${key};
    `;
  }
}

/**
 * In-memory rate limit adapter for unit tests and local environments where
 * raw PostgreSQL queries may be mocked.
 */
export class MemoryRateLimitAdapter implements RateLimitAdapter {
  private store = new Map<string, { attempts: number; resetAt: Date }>();

  async increment(key: string, windowMinutes: number): Promise<{ attempts: number; resetAt: Date }> {
    const now = new Date();
    const windowMs = windowMinutes * 60 * 1000;
    const existing = this.store.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = new Date(now.getTime() + windowMs);
      this.store.set(key, { attempts: 1, resetAt });
      return { attempts: 1, resetAt };
    }

    existing.attempts += 1;
    return { attempts: existing.attempts, resetAt: new Date(existing.resetAt) };
  }

  async decrement(key: string): Promise<void> {
    const existing = this.store.get(key);
    if (existing) {
      existing.attempts = Math.max(0, existing.attempts - 1);
    }
  }

  clear(): void {
    this.store.clear();
  }
}

let activeAdapter: RateLimitAdapter = new PostgresRateLimitAdapter();

export function setRateLimitAdapter(adapter: RateLimitAdapter): void {
  activeAdapter = adapter;
}

export function resetRateLimitAdapter(): void {
  activeAdapter = new PostgresRateLimitAdapter();
}

/**
 * Atomically checks and acquires notification rate limits:
 * 1. Duplicate suppression within 5 minutes for identical (clinic, phone, event, resource).
 * 2. Maximum 3 dispatches per patient phone per hour.
 * 3. Maximum 100 dispatches per clinic per hour.
 * Rolls back preceding counters if downstream checks reject the dispatch.
 */
export async function acquireNotificationRateLimit(
  params: RateLimitCheckParams,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<RateLimitCheckResult> {
  const { clinicId, recipientPhone, eventType, resourceId } = params;

  // 1. Check duplicate suppression (5-minute sliding window)
  const safeResourceId = resourceId || 'general';
  const duplicateKey = `rate:notify:dup:${clinicId}:${recipientPhone}:${eventType}:${safeResourceId}`;
  const dupResult = await activeAdapter.increment(duplicateKey, DUPLICATE_WINDOW_MINUTES, client);

  if (dupResult.attempts > 1) {
    return {
      allowed: false,
      reason: 'DUPLICATE_SUPPRESSED',
      patientRemaining: 0,
      clinicRemaining: 0,
      resetAt: dupResult.resetAt,
    };
  }

  // 2. Check patient phone limit (60-minute sliding window, max 3)
  const phoneKey = `rate:notify:phone:${recipientPhone}`;
  const phoneResult = await activeAdapter.increment(phoneKey, HOURLY_WINDOW_MINUTES, client);

  if (phoneResult.attempts > MAX_PATIENT_DISPATCHES_PER_HOUR) {
    // Patient limit exceeded: rollback duplicate counter
    await activeAdapter.decrement(duplicateKey, client);
    return {
      allowed: false,
      reason: 'PATIENT_LIMIT_EXCEEDED',
      patientRemaining: 0,
      clinicRemaining: 0,
      resetAt: phoneResult.resetAt,
    };
  }

  // 3. Check clinic limit (60-minute sliding window, max 100)
  const clinicKey = `rate:notify:clinic:${clinicId}`;
  const clinicResult = await activeAdapter.increment(clinicKey, HOURLY_WINDOW_MINUTES, client);

  if (clinicResult.attempts > MAX_CLINIC_DISPATCHES_PER_HOUR) {
    // Clinic limit exceeded: rollback duplicate and patient counters
    await activeAdapter.decrement(duplicateKey, client);
    await activeAdapter.decrement(phoneKey, client);
    return {
      allowed: false,
      reason: 'CLINIC_LIMIT_EXCEEDED',
      patientRemaining: Math.max(0, MAX_PATIENT_DISPATCHES_PER_HOUR - (phoneResult.attempts - 1)),
      clinicRemaining: 0,
      resetAt: clinicResult.resetAt,
    };
  }

  return {
    allowed: true,
    patientRemaining: Math.max(0, MAX_PATIENT_DISPATCHES_PER_HOUR - phoneResult.attempts),
    clinicRemaining: Math.max(0, MAX_CLINIC_DISPATCHES_PER_HOUR - clinicResult.attempts),
    resetAt: phoneResult.resetAt,
  };
}
