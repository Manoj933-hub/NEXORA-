import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireClinicAccess, AuthError } from '@/lib/auth/tenant';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import { UpdatePatientInputSchema } from '@/lib/validations/patient';
import type { Permission } from '@/lib/auth/permissions';

async function resolveTenantContext(
  request: Request,
  options?: {
    requiredPermission?: Permission;
    explicitClinicId?: string | null;
  }
) {
  const url = new URL(request.url);
  const clinicId =
    options?.explicitClinicId ||
    url.searchParams.get('clinicId') ||
    request.headers.get('x-clinic-id');

  if (clinicId) {
    return requireClinicAccess(request, clinicId, options);
  }

  const { session } = await requireAuth(request);
  if (!session.activeClinicId) {
    throw new AuthError('No active clinic selected in session', 400);
  }

  return requireClinicAccess(request, session.activeClinicId, options);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ patientId: string }> }
) {
  try {
    await connection();
  } catch {
    // Outside Next.js runtime context (e.g. tests)
  }

  try {
    const { patientId } = await params;
    const context = await resolveTenantContext(request, {
      requiredPermission: 'patients:read',
    });

    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        clinicId: context.clinic.id,
      },
      include: {
        appointments: {
          orderBy: { startTime: 'desc' },
          take: 10,
          include: {
            doctor: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found in active clinic' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      patient: {
        id: patient.id,
        mrn: patient.mrn,
        name: patient.name,
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        phone: patient.phone,
        email: patient.email,
        address: patient.address,
        bloodGroup: patient.bloodGroup,
        emergencyContact: patient.emergencyContact,
        allergies: patient.allergies,
        notes: patient.notes,
        isActive: patient.isActive,
        createdAt: patient.createdAt,
        updatedAt: patient.updatedAt,
      },
      appointments: patient.appointments.map((a) => ({
        id: a.id,
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status,
        reason: a.reason,
        doctor: a.doctor ? { id: a.doctor.id, name: a.doctor.name } : null,
      })),
    });
  } catch (error) {
    if (error instanceof Error && 'digest' in error && (error as { digest: string }).digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching patient details:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ patientId: string }> }
) {
  const originCheck = validateRequestOrigin(request);
  if (!originCheck.valid) {
    return NextResponse.json(
      { error: originCheck.reason || 'Invalid request origin' },
      { status: 403 }
    );
  }

  try {
    const { patientId } = await params;
    const context = await resolveTenantContext(request, {
      requiredPermission: 'patients:write',
    });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = UpdatePatientInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // Verify patient belongs to this clinic
    const existingPatient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        clinicId: context.clinic.id,
      },
    });

    if (!existingPatient) {
      return NextResponse.json(
        { error: 'Patient not found or belongs to another clinic' },
        { status: 404 }
      );
    }

    const data = parsed.data;

    const updated = await prisma.patient.update({
      where: { id: patientId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.dateOfBirth !== undefined
          ? { dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null }
          : {}),
        ...(data.gender !== undefined ? { gender: data.gender } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.email !== undefined ? { email: data.email || null } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.emergencyContact !== undefined ? { emergencyContact: data.emergencyContact } : {}),
        ...(data.bloodGroup !== undefined ? { bloodGroup: data.bloodGroup } : {}),
        ...(data.allergies !== undefined ? { allergies: data.allergies } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    return NextResponse.json({
      message: 'Patient profile updated successfully',
      patient: {
        id: updated.id,
        mrn: updated.mrn,
        name: updated.name,
        dateOfBirth: updated.dateOfBirth,
        gender: updated.gender,
        phone: updated.phone,
        email: updated.email,
        address: updated.address,
        bloodGroup: updated.bloodGroup,
        emergencyContact: updated.emergencyContact,
        allergies: updated.allergies,
        notes: updated.notes,
        isActive: updated.isActive,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating patient profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
