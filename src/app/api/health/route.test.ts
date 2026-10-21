import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { prisma } from '@/lib/prisma';

// Mock the prisma client
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 and healthy status when database is connected', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ '?column?': 1 }]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.services.database.status).toBe('connected');
    expect(typeof data.services.database.latencyMs).toBe('number');
    expect(data.timestamp).toBeDefined();

    // Verify sensitive data is not leaked
    const jsonString = JSON.stringify(data);
    expect(jsonString).not.toContain('postgresql:');
    expect(jsonString).not.toContain('manojkunwar');
    expect(jsonString).not.toContain('password');
    expect(jsonString).not.toContain('5432');
  });

  it('returns 503 and degraded status when database query fails', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('Connection refused'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe('degraded');
    expect(data.services.database.status).toBe('disconnected');
    expect(data.services.database.latencyMs).toBeUndefined();

    // Verify sensitive error traces or credentials are not exposed
    const jsonString = JSON.stringify(data);
    expect(jsonString).not.toContain('Connection refused');
    expect(jsonString).not.toContain('postgresql:');
    expect(jsonString).not.toContain('password');
  });
});
