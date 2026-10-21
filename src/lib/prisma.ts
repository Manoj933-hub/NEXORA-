import { PrismaClient } from '@prisma/client';

/**
 * Global singleton pattern for Prisma Client in Next.js.
 * Prevents multiple instances of Prisma Client in development during HMR (Hot Module Replacement).
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
