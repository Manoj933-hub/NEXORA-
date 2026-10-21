import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireClinicAccess, AuthError } from '@/lib/auth/tenant';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  try {
    await connection();
  } catch {
    // Outside Next.js server context (e.g. unit tests)
  }

  try {
    const { clinicId } = await params;

    // Enforce tenant isolation and verify active membership
    const context = await requireClinicAccess(request, clinicId, {
      requiredPermission: 'clinic:read',
    });

    // Fetch clinic metadata and active member count
    const memberCount = await prisma.membership.count({
      where: {
        clinicId: context.clinic.id,
        isActive: true,
      },
    });

    return NextResponse.json(
      {
        clinic: {
          id: context.clinic.id,
          name: context.clinic.name,
          slug: context.clinic.slug,
          country: context.clinic.country,
          currency: context.clinic.currency,
          phone: context.clinic.phone,
          address: context.clinic.address,
          isActive: context.clinic.isActive,
          createdAt: context.clinic.createdAt,
        },
        membership: {
          role: context.role,
          isActive: context.membership.isActive,
          joinedAt: context.membership.createdAt,
        },
        stats: {
          totalActiveMembers: memberCount,
        },
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
    console.error('Error fetching clinic profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
