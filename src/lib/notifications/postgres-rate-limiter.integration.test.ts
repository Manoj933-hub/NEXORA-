import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  PostgresRateLimitAdapter,
  acquireNotificationRateLimit,
  setRateLimitAdapter,
  resetRateLimitAdapter,
  MAX_PATIENT_DISPATCHES_PER_HOUR,
} from './rate-limiter';

describe('PostgresRateLimitAdapter Integration Tests (nexora_test)', () => {
  let prisma: PrismaClient;
  let postgresAdapter: PostgresRateLimitAdapter;

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL || '';

    // STRICT SAFETY GUARD: Verify we are targeting only the isolated test database
    if (!dbUrl.includes('nexora_test')) {
      throw new Error(
        `SAFETY GUARD ENFORCED: Integration tests must target isolated database "nexora_test". Aborting execution. Target was: ${dbUrl}`
      );
    }

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
    });

    postgresAdapter = new PostgresRateLimitAdapter();
    setRateLimitAdapter(postgresAdapter);

    // Clean up any residual test keys
    await prisma.$executeRaw`
      DELETE FROM "auth_rate_limits"
      WHERE "key" LIKE 'rate:test:%' OR "key" LIKE 'rate:notify:phone:+9197777%' OR "key" LIKE 'rate:notify:clinic:clinic-pg-%';
    `;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$executeRaw`
        DELETE FROM "auth_rate_limits"
        WHERE "key" LIKE 'rate:test:%' OR "key" LIKE 'rate:notify:phone:+9197777%' OR "key" LIKE 'rate:notify:clinic:clinic-pg-%';
      `;
      await prisma.$disconnect();
    }
    resetRateLimitAdapter();
  });

  it('increments a new rate-limit key to 1 and records reset_at timestamp', async () => {
    const key = `rate:test:key-1-${Date.now()}`;
    const result = await postgresAdapter.increment(key, 60, prisma);

    expect(result.attempts).toBe(1);
    expect(result.resetAt).toBeInstanceOf(Date);
    expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());

    // Verify row directly in PostgreSQL auth_rate_limits table
    interface RawCount {
      count: bigint;
      attempts: number;
    }
    const rows = await prisma.$queryRaw<RawCount[]>`
      SELECT COUNT(*)::bigint AS count, "attempts"
      FROM "auth_rate_limits"
      WHERE "key" = ${key}
      GROUP BY "attempts";
    `;
    expect(Number(rows[0].count)).toBe(1);
    expect(rows[0].attempts).toBe(1);
  });

  it('atomically increments existing key on subsequent calls within sliding window', async () => {
    const key = `rate:test:key-2-${Date.now()}`;

    const r1 = await postgresAdapter.increment(key, 60, prisma);
    expect(r1.attempts).toBe(1);

    const r2 = await postgresAdapter.increment(key, 60, prisma);
    expect(r2.attempts).toBe(2);

    const r3 = await postgresAdapter.increment(key, 60, prisma);
    expect(r3.attempts).toBe(3);
  });

  it('enforces atomic counter safety under concurrent Promise.all increments without lost updates', async () => {
    const key = `rate:test:concurrent-${Date.now()}`;
    const concurrency = 10;

    // Launch 10 simultaneous atomic PostgreSQL queries on the same key
    const promises = Array.from({ length: concurrency }, () =>
      postgresAdapter.increment(key, 60, prisma)
    );

    const results = await Promise.all(promises);
    const attemptNumbers = results.map((r) => r.attempts).sort((a, b) => a - b);

    // Each increment should return a distinct count from 1 to 10
    expect(attemptNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // Database should hold exactly attempts = 10
    interface RawResult {
      attempts: number;
    }
    const dbCheck = await prisma.$queryRaw<RawResult[]>`
      SELECT "attempts" FROM "auth_rate_limits" WHERE "key" = ${key};
    `;
    expect(dbCheck[0].attempts).toBe(concurrency);
  });

  it('resets attempts counter to 1 when reset_at timestamp is in the past', async () => {
    const key = `rate:test:expired-${Date.now()}`;

    // Seed an expired entry with attempts = 5
    const pastDate = new Date(Date.now() - 1000 * 60 * 10); // 10 minutes ago
    await prisma.$executeRaw`
      INSERT INTO "auth_rate_limits" ("id", "key", "attempts", "reset_at", "created_at", "updated_at")
      VALUES (gen_random_uuid()::text, ${key}, 5, ${pastDate}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `;

    // Next increment should detect reset_at <= CURRENT_TIMESTAMP and reset attempts to 1
    const result = await postgresAdapter.increment(key, 60, prisma);
    expect(result.attempts).toBe(1);
    expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('supports decrement for quota rollback without dropping below zero', async () => {
    const key = `rate:test:decrement-${Date.now()}`;

    await postgresAdapter.increment(key, 60, prisma); // 1
    await postgresAdapter.increment(key, 60, prisma); // 2
    await postgresAdapter.decrement(key, prisma); // 1

    interface RawResult {
      attempts: number;
    }
    const check1 = await prisma.$queryRaw<RawResult[]>`
      SELECT "attempts" FROM "auth_rate_limits" WHERE "key" = ${key};
    `;
    expect(check1[0].attempts).toBe(1);

    await postgresAdapter.decrement(key, prisma); // 0
    await postgresAdapter.decrement(key, prisma); // stays 0 (GREATEST(0, ...))

    const check2 = await prisma.$queryRaw<RawResult[]>`
      SELECT "attempts" FROM "auth_rate_limits" WHERE "key" = ${key};
    `;
    expect(check2[0].attempts).toBe(0);
  });

  it('enforces acquireNotificationRateLimit end-to-end against PostgreSQL with concurrent patient requests', async () => {
    const clinicId = `clinic-pg-${Date.now()}`;
    const recipientPhone = '+919777712345';

    // 5 concurrent requests from same patient phone
    const promises = Array.from({ length: 5 }, (_, i) =>
      acquireNotificationRateLimit(
        {
          clinicId,
          recipientPhone,
          eventType: 'APPOINTMENT_BOOKED',
          resourceId: `res-${i}`,
        },
        prisma
      )
    );

    const results = await Promise.all(promises);
    const allowed = results.filter((r) => r.allowed);
    const rejected = results.filter((r) => !r.allowed);

    // Exactly 3 allowed, exactly 2 rejected with PATIENT_LIMIT_EXCEEDED
    expect(allowed.length).toBe(MAX_PATIENT_DISPATCHES_PER_HOUR);
    expect(rejected.length).toBe(2);
    expect(rejected[0].reason).toBe('PATIENT_LIMIT_EXCEEDED');
  });
});
