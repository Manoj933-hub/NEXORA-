import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireClinicAccess, AuthError } from '@/lib/auth/tenant';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import { UpdateClinicInputSchema } from '@/lib/validations/clinic';

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
          updatedAt: context.clinic.updatedAt,
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const originCheck = validateRequestOrigin(request);
  if (!originCheck.valid) {
    return NextResponse.json(
      { error: originCheck.reason || 'Invalid request origin' },
      { status: 403 }
    );
  }

  try {
    const { clinicId } = await params;

    // Enforce tenant isolation and verify clinic:update permission (OWNER or ADMIN)
    const context = await requireClinicAccess(request, clinicId, {
      requiredPermission: 'clinic:update',
    });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = UpdateClinicInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const updateData = parsed.data;

    const updatedClinic = await prisma.clinic.update({
      where: { id: context.clinic.id },
      data: {
        ...(updateData.name ? { name: updateData.name } : {}),
        ...(updateData.country ? { country: updateData.country } : {}),
        ...(updateData.currency ? { currency: updateData.currency } : {}),
        ...(updateData.phone !== undefined ? { phone: updateData.phone } : {}),
        ...(updateData.address !== undefined ? { address: updateData.address } : {}),
      },
    });

    return NextResponse.json(
      {
        message: 'Clinic profile updated successfully',
        clinic: {
          id: updatedClinic.id,
          name: updatedClinic.name,
          slug: updatedClinic.slug,
          country: updatedClinic.country,
          currency: updatedClinic.currency,
          phone: updatedClinic.phone,
          address: updatedClinic.address,
          isActive: updatedClinic.isActive,
          createdAt: updatedClinic.createdAt,
          updatedAt: updatedClinic.updatedAt,
        },
        membership: {
          role: context.role,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating clinic profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
