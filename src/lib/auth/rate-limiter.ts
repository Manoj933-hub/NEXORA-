import { prisma } from '@/lib/prisma';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Multi-instance database-backed rate limiter.
 * Persists attempts in PostgreSQL (auth_rate_limits table) so that rate limits
 * are enforced consistently across clustered or serverless deployments.
 */
export async function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMinutes = 15
): Promise<RateLimitResult> {
  const now = new Date();
  const windowMs = windowMinutes * 60 * 1000;
  const newResetAt = new Date(now.getTime() + windowMs);

  const existing = await prisma.authRateLimit.findUnique({
    where: { key },
  });

  if (!existing || existing.resetAt <= now) {
    return {
      allowed: true,
      remaining: maxAttempts,
      resetAt: existing ? existing.resetAt : newResetAt,
    };
  }

  if (existing.attempts >= maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - existing.attempts),
    resetAt: existing.resetAt,
  };
}

/**
 * Records a failed attempt for the specified key.
 */
export async function recordFailedAttempt(
  key: string,
  windowMinutes = 15
): Promise<void> {
  const now = new Date();
  const windowMs = windowMinutes * 60 * 1000;
  const newResetAt = new Date(now.getTime() + windowMs);

  const existing = await prisma.authRateLimit.findUnique({
    where: { key },
  });

  if (!existing || existing.resetAt <= now) {
    await prisma.authRateLimit.upsert({
      where: { key },
      create: {
        key,
        attempts: 1,
        resetAt: newResetAt,
      },
      update: {
        attempts: 1,
        resetAt: newResetAt,
      },
    });
  } else {
    await prisma.authRateLimit.update({
      where: { key },
      data: {
        attempts: { increment: 1 },
      },
    });
  }
}

/**
 * Resets/clears rate limit attempts upon successful authentication.
 */
export async function clearRateLimit(key: string): Promise<void> {
  await prisma.authRateLimit.deleteMany({
    where: { key },
  });
}

/**
 * Extracts client IP safely from standard reverse-proxy headers.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return '127.0.0.1';
}
