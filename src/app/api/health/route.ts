import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';


export async function GET() {
  const timestamp = new Date().toISOString();
  const environment = process.env.NODE_ENV || 'development';

  try {
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - startTime;

    return NextResponse.json(
      {
        status: 'healthy',
        timestamp,
        environment,
        services: {
          database: {
            status: 'connected',
            latencyMs,
          },
        },
      },
      { status: 200 }
    );
  } catch {
    // Log error internally in server logs, never leak credentials or internal errors to client
    return NextResponse.json(
      {
        status: 'degraded',
        timestamp,
        environment,
        services: {
          database: {
            status: 'disconnected',
          },
        },
      },
      { status: 503 }
    );
  }
}
