import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth/tenant';

export async function GET(request: Request) {
  try {
    await connection();
  } catch {
    // Outside Next.js server context (e.g. unit tests)
  }

  try {
    const { user, activeClinic } = await requireAuth(request);

    // Retrieve all active clinic memberships for this user
    const memberships = await prisma.membership.findMany({
      where: {
        userId: user.id,
        isActive: true,
        clinic: {
          isActive: true,
        },
      },
      include: {
        clinic: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const clinics = memberships.map((m) => ({
      id: m.clinic.id,
      name: m.clinic.name,
      slug: m.clinic.slug,
      country: m.clinic.country,
      currency: m.clinic.currency,
      role: m.role,
      joinedAt: m.createdAt,
    }));

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
        },
        activeClinic: activeClinic
          ? {
              id: activeClinic.id,
              name: activeClinic.name,
              slug: activeClinic.slug,
              country: activeClinic.country,
              currency: activeClinic.currency,
            }
          : null,
        clinics,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Error && 'digest' in error && (error as { digest: string }).digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching current user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
