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
    // Outside Next.js runtime context (e.g. tests)
  }

  try {
    const { clinicId } = await params;
    const context = await requireClinicAccess(request, clinicId, {
      requiredPermission: 'members:read',
    });

    const memberships = await prisma.membership.findMany({
      where: {
        clinicId: context.clinic.id,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const members = memberships.map((m) => ({
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      phone: m.user.phone,
      role: m.role,
    }));

    return NextResponse.json({ members });
  } catch (error) {
    if (error instanceof Error && 'digest' in error && (error as { digest: string }).digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching clinic members:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
