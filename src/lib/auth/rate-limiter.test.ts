import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from './rate-limiter';
import { prisma } from '@/lib/prisma';

describe('Database Rate Limiter', () => {
  const testKey = 'test:rate:limit:key';

  beforeEach(async () => {
    await clearRateLimit(testKey);
  });

  afterAll(async () => {
    await clearRateLimit(testKey);
  });

  it('allows requests within maxAttempts threshold', async () => {
    const result1 = await checkRateLimit(testKey, 3, 10);
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(3);

    await recordFailedAttempt(testKey, 10);
    const result2 = await checkRateLimit(testKey, 3, 10);
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(2);
  });

  it('blocks requests once maxAttempts is reached', async () => {
    await recordFailedAttempt(testKey, 10);
    await recordFailedAttempt(testKey, 10);
    await recordFailedAttempt(testKey, 10);

    const check = await checkRateLimit(testKey, 3, 10);
    expect(check.allowed).toBe(false);
    expect(check.remaining).toBe(0);
  });

  it('clears rate limit counters upon reset', async () => {
    await recordFailedAttempt(testKey, 10);
    await recordFailedAttempt(testKey, 10);
    await recordFailedAttempt(testKey, 10);

    expect((await checkRateLimit(testKey, 3, 10)).allowed).toBe(false);

    await clearRateLimit(testKey);
    expect((await checkRateLimit(testKey, 3, 10)).allowed).toBe(true);
  });

  it('resets attempts automatically when window has expired', async () => {
    // Manually write an expired rate limit entry
    await prisma.authRateLimit.upsert({
      where: { key: testKey },
      create: {
        key: testKey,
        attempts: 10,
        resetAt: new Date(Date.now() - 5000), // 5 seconds in the past
      },
      update: {
        attempts: 10,
        resetAt: new Date(Date.now() - 5000),
      },
    });

    const check = await checkRateLimit(testKey, 5, 10);
    expect(check.allowed).toBe(true);
  });
});
