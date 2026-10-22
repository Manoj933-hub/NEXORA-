import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireClinicAccess, AuthError } from '@/lib/auth/tenant';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import type { Permission } from '@/lib/auth/permissions';
import { recordClinicalAudit } from '@/lib/clinical/audit';
import { isValidPrescriptionStatusTransition } from '@/lib/validations/clinical';
import { PrescriptionStatus } from '@prisma/client';
import { z } from 'zod';

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

const UpdatePrescriptionSchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'DISCONTINUED', 'CANCELLED']),
  expectedVersion: z.number().int().min(1).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ prescriptionId: string }> }
) {
  try {
    await connection();
  } catch {
    // Outside Next.js runtime context (e.g. tests)
  }

  try {
    const resolvedParams = await params;
    const prescriptionId = resolvedParams.prescriptionId;

    const context = await resolveTenantContext(request, {
      requiredPermission: 'clinical:records:read',
    });

    const prescription = await prisma.prescription.findFirst({
      where: {
        id: prescriptionId,
        clinicId: context.clinic.id,
      },
      include: {
        patient: true,
        doctor: { select: { id: true, name: true, email: true } },
        items: true,
      },
    });

    if (!prescription) {
      return NextResponse.json(
        { error: 'Prescription record not found in active clinic' },
        { status: 404 }
      );
    }

    return NextResponse.json({ prescription });
  } catch (error) {
    if (error instanceof Error && 'digest' in error && (error as { digest: string }).digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /api/prescriptions/[prescriptionId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ prescriptionId: string }> }
) {
  try {
    await connection();
  } catch {
    // Outside Next.js runtime context (e.g. tests)
  }

  const originCheck = validateRequestOrigin(request);
  if (!originCheck.valid) {
    return NextResponse.json(
      { error: originCheck.reason || 'Invalid request origin' },
      { status: 403 }
    );
  }

  try {
    const resolvedParams = await params;
    const prescriptionId = resolvedParams.prescriptionId;

    const context = await resolveTenantContext(request, {
      requiredPermission: 'clinical:records:write',
    });

    const existing = await prisma.prescription.findFirst({
      where: {
        id: prescriptionId,
        clinicId: context.clinic.id,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Prescription record not found in active clinic' },
        { status: 404 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = UpdatePrescriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // 1. Concurrency Check (Optimistic Concurrency Control)
    if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
      return NextResponse.json(
        {
          error: `Prescription version conflict: current version is ${existing.version}, but client submitted version ${input.expectedVersion}. Please reload.`,
        },
        { status: 409 }
      );
    }

    // 2. Validate status transitions (reject illegal terminal status transitions)
    const targetStatus = input.status as PrescriptionStatus;
    if (!isValidPrescriptionStatusTransition(existing.status, targetStatus)) {
      return NextResponse.json(
        {
          error: `Invalid prescription status transition from ${existing.status} to ${targetStatus}. Prescriptions in terminal state (${existing.status}) cannot be changed.`,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 3. Clinic-scoped conditional update with version check
      const updateResult = await tx.prescription.updateMany({
        where: {
          id: prescriptionId,
          clinicId: context.clinic.id,
          version: existing.version,
          status: existing.status,
        },
        data: {
          status: targetStatus,
          notes: input.notes !== undefined ? input.notes : existing.notes,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        return null;
      }

      let auditAction: 'DISCONTINUE' | 'CANCEL' | 'UPDATE' = 'UPDATE';
      if (input.status === 'DISCONTINUED') auditAction = 'DISCONTINUE';
      if (input.status === 'CANCELLED') auditAction = 'CANCEL';

      await recordClinicalAudit(tx, {
        clinicId: context.clinic.id,
        patientId: existing.patientId,
        consultationId: existing.consultationId,
        actorId: context.user.id,
        actorName: context.user.name,
        actorRole: context.membership.role,
        recordType: 'PRESCRIPTION',
        recordId: prescriptionId,
        action: auditAction,
        details: `Updated prescription status to ${input.status}`,
      });

      return tx.prescription.findFirst({
        where: {
          id: prescriptionId,
          clinicId: context.clinic.id,
        },
        include: {
          patient: true,
          doctor: { select: { id: true, name: true, email: true } },
          items: true,
        },
      });
    });

    if (!updated) {
      return NextResponse.json(
        { error: 'Prescription was updated by another concurrent request. Please reload.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ prescription: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in PATCH /api/prescriptions/[prescriptionId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
