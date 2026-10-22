import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireClinicAccess, AuthError } from '@/lib/auth/tenant';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import {
  UpdateConsultationInputSchema,
  isValidConsultationStatusTransition,
  calculateBMI,
} from '@/lib/validations/clinical';
import type { Permission } from '@/lib/auth/permissions';
import { recordClinicalAudit } from '@/lib/clinical/audit';
import { ConsultationStatus, AppointmentStatus, Prisma } from '@prisma/client';

class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyError';
  }
}

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
  { params }: { params: Promise<{ consultationId: string }> }
) {
  try {
    await connection();
  } catch {
    // Outside Next.js runtime context (e.g. tests)
  }

  try {
    const resolvedParams = await params;
    const consultationId = resolvedParams.consultationId;

    const context = await resolveTenantContext(request, {
      requiredPermission: 'clinical:records:read',
    });

    const consultation = await prisma.consultation.findFirst({
      where: {
        id: consultationId,
        clinicId: context.clinic.id,
      },
      include: {
        patient: true,
        doctor: {
          select: { id: true, name: true, email: true },
        },
        appointment: true,
        observations: {
          where: { isCurrent: true },
        },
        diagnoses: {
          where: { isCurrent: true },
          orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
        },
        prescriptions: {
          include: {
            items: true,
            doctor: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        versions: {
          orderBy: { versionNumber: 'asc' },
          include: {
            doctor: { select: { id: true, name: true } },
            amendedBy: { select: { id: true, name: true } },
          },
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!consultation) {
      return NextResponse.json(
        { error: 'Consultation record not found in the active clinic' },
        { status: 404 }
      );
    }

    return NextResponse.json({ consultation });
  } catch (error) {
    if (error instanceof Error && 'digest' in error && (error as { digest: string }).digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /api/consultations/[consultationId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ consultationId: string }> }
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
    const consultationId = resolvedParams.consultationId;

    const context = await resolveTenantContext(request, {
      requiredPermission: 'clinical:records:write',
    });

    const existingConsultation = await prisma.consultation.findFirst({
      where: {
        id: consultationId,
        clinicId: context.clinic.id,
      },
      include: {
        appointment: true,
        observations: { where: { isCurrent: true } },
        diagnoses: { where: { isCurrent: true } },
        prescriptions: { include: { items: true } },
        versions: { orderBy: { versionNumber: 'asc' } },
      },
    });

    if (!existingConsultation) {
      return NextResponse.json(
        { error: 'Consultation record not found in the active clinic' },
        { status: 404 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = UpdateConsultationInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // 1. Concurrency Check (Optimistic Concurrency Control)
    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion !== existingConsultation.version
    ) {
      return NextResponse.json(
        {
          error: `Consultation version conflict: current version is ${existingConsultation.version}, but client submitted version ${input.expectedVersion}. Please reload.`,
        },
        { status: 409 }
      );
    }

    const currentStatus = existingConsultation.status;
    let targetStatus: ConsultationStatus = currentStatus;

    if (input.status) {
      targetStatus = input.status as ConsultationStatus;
      if (!isValidConsultationStatusTransition(currentStatus, targetStatus)) {
        return NextResponse.json(
          {
            error: `Invalid consultation status transition from ${currentStatus} to ${targetStatus}. Finalized or amended records cannot be reverted to draft.`,
          },
          { status: 400 }
        );
      }
    } else if (currentStatus === ConsultationStatus.FINALIZED) {
      // Modifying any fields of a finalized record automatically transitions it to AMENDED
      targetStatus = ConsultationStatus.AMENDED;
    }

    const isFinalizedOrAmended =
      currentStatus === ConsultationStatus.FINALIZED ||
      currentStatus === ConsultationStatus.AMENDED;

    // 2. Enforce explicit, validated amendment reason for finalized records
    if (isFinalizedOrAmended) {
      if (!input.amendmentReason || input.amendmentReason.trim().length < 3) {
        return NextResponse.json(
          {
            error:
              'Finalized or amended clinical consultations cannot be modified without an explicit, valid amendment reason (at least 3 characters).',
          },
          { status: 400 }
        );
      }
    }

    const now = new Date();
    const newVersion =
      targetStatus === ConsultationStatus.AMENDED
        ? existingConsultation.version + 1
        : existingConsultation.version;

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Conditional update on consultation table (atomic lock on current version)
      // This MUST be the first operation inside the transaction. If the consultation
      // has been modified concurrently, updateMany returns count: 0, immediately
      // throwing ConcurrencyError to abort the transaction and prevent any orphaned
      // snapshot, observation, diagnosis, prescription, or audit records.
      const updateResult = await tx.consultation.updateMany({
        where: {
          id: consultationId,
          clinicId: context.clinic.id,
          version: existingConsultation.version,
        },
        data: {
          subjective: input.subjective !== undefined ? input.subjective : existingConsultation.subjective,
          objective: input.objective !== undefined ? input.objective : existingConsultation.objective,
          assessment: input.assessment !== undefined ? input.assessment : existingConsultation.assessment,
          plan: input.plan !== undefined ? input.plan : existingConsultation.plan,
          status: targetStatus,
          version: newVersion,
          finalizedAt:
            targetStatus === ConsultationStatus.FINALIZED && !existingConsultation.finalizedAt
              ? now
              : existingConsultation.finalizedAt,
          amendedAt: targetStatus === ConsultationStatus.AMENDED ? now : existingConsultation.amendedAt,
          amendmentReason:
            targetStatus === ConsultationStatus.AMENDED
              ? input.amendmentReason
              : existingConsultation.amendmentReason,
        },
      });

      if (updateResult.count === 0) {
        throw new ConcurrencyError(
          'Consultation was modified by another concurrent request. Please reload.'
        );
      }

      // 2. Ensure the pre-amendment state is snapshotted as version 1 if amending a previously finalized record
      // without an existing version snapshot (e.g. legacy data).
      if (isFinalizedOrAmended && existingConsultation.versions.length === 0) {
        await tx.consultationVersion.create({
          data: {
            consultationId,
            clinicId: context.clinic.id,
            patientId: existingConsultation.patientId,
            doctorId: existingConsultation.doctorId,
            versionNumber: existingConsultation.version,
            status: ConsultationStatus.FINALIZED,
            subjective: existingConsultation.subjective,
            objective: existingConsultation.objective,
            assessment: existingConsultation.assessment,
            plan: existingConsultation.plan,
            observationsSnapshot:
              existingConsultation.observations.length > 0
                ? ((existingConsultation.observations.map((o) => ({
                    systolicBp: o.systolicBp,
                    diastolicBp: o.diastolicBp,
                    heartRate: o.heartRate,
                    temperature: o.temperature,
                    temperatureUnit: o.temperatureUnit,
                    respiratoryRate: o.respiratoryRate,
                    oxygenSaturation: o.oxygenSaturation,
                    height: o.height,
                    heightUnit: o.heightUnit,
                    weight: o.weight,
                    weightUnit: o.weightUnit,
                    bmi: o.bmi,
                    notes: o.notes,
                  })) as unknown) as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            diagnosesSnapshot:
              existingConsultation.diagnoses.length > 0
                ? ((existingConsultation.diagnoses.map((d) => ({
                    name: d.name,
                    codeSystem: d.codeSystem,
                    code: d.code,
                    type: d.type,
                    clinicalStatus: d.clinicalStatus,
                    notes: d.notes,
                  })) as unknown) as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            prescriptionsSnapshot:
              existingConsultation.prescriptions.length > 0
                ? ((existingConsultation.prescriptions.map((p) => ({
                    id: p.id,
                    status: p.status,
                    notes: p.notes,
                    items: p.items.map((item) => ({
                      id: item.id,
                      medicationName: item.medicationName,
                      strength: item.strength,
                      route: item.route,
                      frequency: item.frequency,
                      duration: item.duration,
                      quantity: item.quantity,
                      instructions: item.instructions,
                    })),
                  })) as unknown) as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            finalizedAt: existingConsultation.finalizedAt || now,
          },
        });
      }

      // 4. Observations / Vitals
      let newObservationsSnapshot: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput = Prisma.JsonNull;
      if (input.vitals !== undefined) {
        if (currentStatus === ConsultationStatus.DRAFT) {
          // In draft state, replace draft vitals
          await tx.observation.deleteMany({
            where: { consultationId },
          });
        } else {
          // In finalized/amended state: NEVER delete prior observations! Archive with isCurrent = false
          await tx.observation.updateMany({
            where: { consultationId, isCurrent: true },
            data: { isCurrent: false },
          });
        }

        if (input.vitals) {
          const v = input.vitals;
          const bmi = calculateBMI(v.height, v.heightUnit, v.weight, v.weightUnit);

          await tx.observation.create({
            data: {
              clinicId: context.clinic.id,
              patientId: existingConsultation.patientId,
              consultationId,
              version: newVersion,
              isCurrent: true,
              systolicBp: v.systolicBp ?? null,
              diastolicBp: v.diastolicBp ?? null,
              heartRate: v.heartRate ?? null,
              temperature: v.temperature ?? null,
              temperatureUnit: v.temperatureUnit || 'F',
              respiratoryRate: v.respiratoryRate ?? null,
              oxygenSaturation: v.oxygenSaturation ?? null,
              height: v.height ?? null,
              heightUnit: v.heightUnit || 'cm',
              weight: v.weight ?? null,
              weightUnit: v.weightUnit || 'kg',
              bmi,
              notes: v.notes || null,
            },
          });

          newObservationsSnapshot = [{ ...v, bmi }] as unknown as Prisma.InputJsonValue;
        }
      } else {
        newObservationsSnapshot =
          existingConsultation.observations.length > 0
            ? ((existingConsultation.observations.map((o) => ({
                systolicBp: o.systolicBp,
                diastolicBp: o.diastolicBp,
                heartRate: o.heartRate,
                temperature: o.temperature,
                temperatureUnit: o.temperatureUnit,
                respiratoryRate: o.respiratoryRate,
                oxygenSaturation: o.oxygenSaturation,
                height: o.height,
                heightUnit: o.heightUnit,
                weight: o.weight,
                weightUnit: o.weightUnit,
                bmi: o.bmi,
                notes: o.notes,
              })) as unknown) as Prisma.InputJsonValue)
            : Prisma.JsonNull;
      }

      // 5. Diagnoses
      let newDiagnosesSnapshot: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput = Prisma.JsonNull;
      if (input.diagnoses !== undefined) {
        if (currentStatus === ConsultationStatus.DRAFT) {
          await tx.diagnosis.deleteMany({
            where: { consultationId },
          });
        } else {
          // In finalized/amended state: NEVER delete prior diagnoses! Archive with isCurrent = false
          await tx.diagnosis.updateMany({
            where: { consultationId, isCurrent: true },
            data: { isCurrent: false },
          });
        }

        if (input.diagnoses && input.diagnoses.length > 0) {
          await tx.diagnosis.createMany({
            data: input.diagnoses.map((d) => ({
              clinicId: context.clinic.id,
              patientId: existingConsultation.patientId,
              consultationId,
              version: newVersion,
              isCurrent: true,
              name: d.name,
              codeSystem: d.codeSystem || null,
              code: d.code || null,
              type: d.type,
              clinicalStatus: d.clinicalStatus || 'ACTIVE',
              notes: d.notes || null,
            })),
          });
          newDiagnosesSnapshot = input.diagnoses.map((d) => ({
            name: d.name,
            codeSystem: d.codeSystem || null,
            code: d.code || null,
            type: d.type,
            clinicalStatus: d.clinicalStatus || 'ACTIVE',
            notes: d.notes || null,
          })) as unknown as Prisma.InputJsonValue;
        }
      } else {
        newDiagnosesSnapshot =
          existingConsultation.diagnoses.length > 0
            ? ((existingConsultation.diagnoses.map((d) => ({
                name: d.name,
                codeSystem: d.codeSystem,
                code: d.code,
                type: d.type,
                clinicalStatus: d.clinicalStatus,
                notes: d.notes,
              })) as unknown) as Prisma.InputJsonValue)
            : Prisma.JsonNull;
      }

      // 6. Prescriptions (Additive - never delete prior prescriptions)
      if (input.prescriptions !== undefined && input.prescriptions && input.prescriptions.length > 0) {
        for (const rx of input.prescriptions) {
          const createdRx = await tx.prescription.create({
            data: {
              clinicId: context.clinic.id,
              patientId: existingConsultation.patientId,
              consultationId,
              doctorId: context.user.id,
              status: rx.status || 'ACTIVE',
              notes: rx.notes || null,
              version: 1,
            },
          });

          await tx.prescriptionItem.createMany({
            data: rx.items.map((item) => ({
              prescriptionId: createdRx.id,
              medicationName: item.medicationName,
              strength: item.strength || null,
              route: item.route || 'ORAL',
              frequency: item.frequency,
              duration: item.duration,
              quantity: item.quantity || null,
              instructions: item.instructions || null,
            })),
          });
        }
      }

      // Query persisted prescriptions from the database to guarantee an accurate snapshot
      // with all generated database IDs, stored values, and prescription items
      const persistedPrescriptions = await tx.prescription.findMany({
        where: {
          consultationId,
          clinicId: context.clinic.id,
        },
        include: {
          items: {
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const newPrescriptionsSnapshot: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput =
        persistedPrescriptions.length > 0
          ? ((persistedPrescriptions.map((p) => ({
              id: p.id,
              status: p.status,
              notes: p.notes,
              items: p.items.map((item) => ({
                id: item.id,
                medicationName: item.medicationName,
                strength: item.strength,
                route: item.route,
                frequency: item.frequency,
                duration: item.duration,
                quantity: item.quantity,
                instructions: item.instructions,
              })),
            })) as unknown) as Prisma.InputJsonValue)
          : Prisma.JsonNull;

      // 7. Version History Records
      if (targetStatus === ConsultationStatus.FINALIZED && currentStatus === ConsultationStatus.DRAFT) {
        await tx.consultationVersion.create({
          data: {
            consultationId,
            clinicId: context.clinic.id,
            patientId: existingConsultation.patientId,
            doctorId: context.user.id,
            versionNumber: 1,
            status: ConsultationStatus.FINALIZED,
            subjective: input.subjective !== undefined ? input.subjective : existingConsultation.subjective,
            objective: input.objective !== undefined ? input.objective : existingConsultation.objective,
            assessment: input.assessment !== undefined ? input.assessment : existingConsultation.assessment,
            plan: input.plan !== undefined ? input.plan : existingConsultation.plan,
            observationsSnapshot: newObservationsSnapshot,
            diagnosesSnapshot: newDiagnosesSnapshot,
            prescriptionsSnapshot: newPrescriptionsSnapshot,
            finalizedAt: now,
          },
        });
      } else if (targetStatus === ConsultationStatus.AMENDED) {
        await tx.consultationVersion.create({
          data: {
            consultationId,
            clinicId: context.clinic.id,
            patientId: existingConsultation.patientId,
            doctorId: existingConsultation.doctorId,
            amendedById: context.user.id,
            versionNumber: newVersion,
            status: ConsultationStatus.AMENDED,
            subjective: input.subjective !== undefined ? input.subjective : existingConsultation.subjective,
            objective: input.objective !== undefined ? input.objective : existingConsultation.objective,
            assessment: input.assessment !== undefined ? input.assessment : existingConsultation.assessment,
            plan: input.plan !== undefined ? input.plan : existingConsultation.plan,
            observationsSnapshot: newObservationsSnapshot,
            diagnosesSnapshot: newDiagnosesSnapshot,
            prescriptionsSnapshot: newPrescriptionsSnapshot,
            finalizedAt: existingConsultation.finalizedAt,
            amendedAt: now,
            amendmentReason: input.amendmentReason,
          },
        });
      }

      // 8. Update appointment status if transitioning to FINALIZED
      if (
        targetStatus === ConsultationStatus.FINALIZED &&
        existingConsultation.appointmentId &&
        currentStatus === ConsultationStatus.DRAFT
      ) {
        await tx.appointment.update({
          where: { id: existingConsultation.appointmentId },
          data: {
            status: AppointmentStatus.COMPLETED,
            completedAt: now,
          },
        });
      }

      // 9. Transactional Audit Trail
      let auditAction: 'UPDATE' | 'FINALIZE' | 'AMEND' = 'UPDATE';
      let auditDetails = 'Updated draft consultation';
      if (targetStatus === ConsultationStatus.FINALIZED && currentStatus === ConsultationStatus.DRAFT) {
        auditAction = 'FINALIZE';
        auditDetails = 'Finalized and signed clinical consultation';
      } else if (targetStatus === ConsultationStatus.AMENDED) {
        auditAction = 'AMEND';
        auditDetails = `Amended consultation to version ${newVersion}: ${input.amendmentReason?.substring(0, 100)}`;
      }

      await recordClinicalAudit(tx, {
        clinicId: context.clinic.id,
        patientId: existingConsultation.patientId,
        consultationId,
        actorId: context.user.id,
        actorName: context.user.name,
        actorRole: context.membership.role,
        recordType: 'CONSULTATION',
        recordId: consultationId,
        action: auditAction,
        details: auditDetails,
      });

      return tx.consultation.findFirst({
        where: {
          id: consultationId,
          clinicId: context.clinic.id,
        },
        include: {
          patient: true,
          doctor: { select: { id: true, name: true, email: true } },
          appointment: true,
          observations: { where: { isCurrent: true } },
          diagnoses: { where: { isCurrent: true } },
          prescriptions: {
            include: { items: true },
          },
          versions: {
            orderBy: { versionNumber: 'asc' },
            include: {
              doctor: { select: { id: true, name: true } },
              amendedBy: { select: { id: true, name: true } },
            },
          },
          auditLogs: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    });

    return NextResponse.json({ consultation: updated });
  } catch (error) {
    if (error instanceof ConcurrencyError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in PATCH /api/consultations/[consultationId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
