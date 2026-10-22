import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireClinicAccess, AuthError } from '@/lib/auth/tenant';
import type { Permission } from '@/lib/auth/permissions';
import { PrescriptionStatus, Prisma } from '@prisma/client';

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

export async function GET(request: Request) {
  try {
    await connection();
  } catch {
    // Outside Next.js runtime context (e.g. tests)
  }

  try {
    const context = await resolveTenantContext(request, {
      requiredPermission: 'clinical:records:read',
    });

    const url = new URL(request.url);
    const patientId = url.searchParams.get('patientId');
    const statusParam = url.searchParams.get('status');

    const whereClause: Prisma.PrescriptionWhereInput = {
      clinicId: context.clinic.id,
    };

    if (patientId) {
      const patient = await prisma.patient.findFirst({
        where: { id: patientId, clinicId: context.clinic.id },
      });
      if (!patient) {
        return NextResponse.json(
          { error: 'Patient not found in active clinic' },
          { status: 404 }
        );
      }
      whereClause.patientId = patientId;
    }

    if (statusParam && ['ACTIVE', 'COMPLETED', 'DISCONTINUED', 'CANCELLED'].includes(statusParam)) {
      whereClause.status = statusParam as PrescriptionStatus;
    }

    const prescriptions = await prisma.prescription.findMany({
      where: whereClause,
      include: {
        patient: {
          select: {
            id: true,
            mrn: true,
            name: true,
            gender: true,
            dateOfBirth: true,
          },
        },
        doctor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ prescriptions });
  } catch (error) {
    if (error instanceof Error && 'digest' in error && (error as { digest: string }).digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /api/prescriptions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
