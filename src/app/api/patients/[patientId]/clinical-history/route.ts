import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireClinicAccess, AuthError } from '@/lib/auth/tenant';
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
    throw new AuthError('No active clinic selected in session. Please select a clinic.', 400);
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
    const resolvedParams = await params;
    const patientId = resolvedParams.patientId;

    const context = await resolveTenantContext(request, {
      requiredPermission: 'clinical:records:read',
    });

    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        clinicId: context.clinic.id,
      },
    });

    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found in active clinic' },
        { status: 404 }
      );
    }

    const [consultations, observations, diagnoses, prescriptions, auditLogs] =
      await Promise.all([
        prisma.consultation.findMany({
          where: {
            patientId,
            clinicId: context.clinic.id,
          },
          include: {
            doctor: { select: { id: true, name: true, email: true } },
            diagnoses: { where: { isCurrent: true } },
            observations: { where: { isCurrent: true } },
            prescriptions: { include: { items: true } },
            versions: { orderBy: { versionNumber: 'asc' } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.observation.findMany({
          where: {
            patientId,
            clinicId: context.clinic.id,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.diagnosis.findMany({
          where: {
            patientId,
            clinicId: context.clinic.id,
          },
          orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
        }),
        prisma.prescription.findMany({
          where: {
            patientId,
            clinicId: context.clinic.id,
          },
          include: {
            items: true,
            doctor: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.clinicalAuditLog.findMany({
          where: {
            patientId,
            clinicId: context.clinic.id,
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    return NextResponse.json({
      patient: {
        id: patient.id,
        mrn: patient.mrn,
        name: patient.name,
        gender: patient.gender,
        dateOfBirth: patient.dateOfBirth,
        bloodGroup: patient.bloodGroup,
        allergies: patient.allergies,
      },
      consultations,
      observations,
      diagnoses,
      prescriptions,
      auditLogs,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /api/patients/[patientId]/clinical-history:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
