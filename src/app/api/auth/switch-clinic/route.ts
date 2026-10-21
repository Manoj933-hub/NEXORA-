import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth/tenant';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import { SwitchClinicInputSchema } from '@/lib/validations/auth';

export async function POST(request: Request) {
  // CSRF / Origin verification
  const originCheck = validateRequestOrigin(request);
  if (!originCheck.valid) {
    return NextResponse.json(
      { error: originCheck.reason || 'Invalid request origin' },
      { status: 403 }
    );
  }

  try {
    const { user, session } = await requireAuth(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = SwitchClinicInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { clinicId } = parsed.data;

    // Verify user holds an active membership in the target clinic
    const membership = await prisma.membership.findUnique({
      where: {
        userId_clinicId: {
          userId: user.id,
          clinicId,
        },
      },
      include: {
        clinic: true,
      },
    });

    if (!membership || !membership.isActive) {
      return NextResponse.json(
        { error: 'Access denied: You do not have an active membership in this clinic' },
        { status: 403 }
      );
    }

    if (!membership.clinic.isActive) {
      return NextResponse.json(
        { error: 'Access denied: Clinic organization is inactive' },
        { status: 403 }
      );
    }

    // Update active clinic in current session
    await prisma.session.update({
      where: { id: session.id },
      data: { activeClinicId: clinicId },
    });

    return NextResponse.json(
      {
        message: 'Active clinic updated successfully',
        activeClinic: {
          id: membership.clinic.id,
          name: membership.clinic.name,
          slug: membership.clinic.slug,
          country: membership.clinic.country,
          currency: membership.clinic.currency,
          role: membership.role,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error switching clinic:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
