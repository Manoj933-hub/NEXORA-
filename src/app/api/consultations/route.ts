import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireClinicAccess, AuthError } from '@/lib/auth/tenant';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import {
  CreateConsultationInputSchema,
  calculateBMI,
} from '@/lib/validations/clinical';
import type { Permission } from '@/lib/auth/permissions';
import { recordClinicalAudit } from '@/lib/clinical/audit';
import { ConsultationStatus, AppointmentStatus, Prisma } from '@prisma/client';

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
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const skip = (page - 1) * limit;

    const whereClause: Prisma.ConsultationWhereInput = {
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

    if (statusParam && ['DRAFT', 'FINALIZED', 'AMENDED'].includes(statusParam)) {
      whereClause.status = statusParam as ConsultationStatus;
    }

    const [total, consultations] = await Promise.all([
      prisma.consultation.count({ where: whereClause }),
      prisma.consultation.findMany({
        where: whereClause,
        include: {
          patient: {
            select: {
              id: true,
              mrn: true,
              name: true,
              gender: true,
              dateOfBirth: true,
              phone: true,
            },
          },
          doctor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          diagnoses: {
            select: {
              id: true,
              name: true,
              code: true,
              type: true,
            },
          },
          observations: {
            select: {
              id: true,
              systolicBp: true,
              diastolicBp: true,
              heartRate: true,
              temperature: true,
              temperatureUnit: true,
              oxygenSaturation: true,
              bmi: true,
            },
          },
          prescriptions: {
            select: {
              id: true,
              status: true,
              _count: {
                select: { items: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      consultations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    if (error instanceof Error && 'digest' in error && (error as { digest: string }).digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in GET /api/consultations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
    const context = await resolveTenantContext(request, {
      requiredPermission: 'clinical:records:write',
    });

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = CreateConsultationInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // Verify patient belongs to this clinic
    const patient = await prisma.patient.findFirst({
      where: {
        id: input.patientId,
        clinicId: context.clinic.id,
      },
    });

    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found in the active clinic' },
        { status: 404 }
      );
    }

    // If appointment is provided, verify it belongs to this clinic and patient
    if (input.appointmentId) {
      const appointment = await prisma.appointment.findFirst({
        where: {
          id: input.appointmentId,
          clinicId: context.clinic.id,
          patientId: patient.id,
        },
      });

      if (!appointment) {
        return NextResponse.json(
          { error: 'Appointment not found or does not belong to this patient in the active clinic' },
          { status: 404 }
        );
      }
    }

    const targetStatus = input.status === 'FINALIZED' ? ConsultationStatus.FINALIZED : ConsultationStatus.DRAFT;
    const now = new Date();

    // Execute atomic transaction for consultation and all related clinical entities
    const createdConsultation = await prisma.$transaction(async (tx) => {
      const consultation = await tx.consultation.create({
        data: {
          clinicId: context.clinic.id,
          patientId: patient.id,
          doctorId: context.user.id,
          appointmentId: input.appointmentId || null,
          status: targetStatus,
          subjective: input.subjective || null,
          objective: input.objective || null,
          assessment: input.assessment || null,
          plan: input.plan || null,
          finalizedAt: targetStatus === ConsultationStatus.FINALIZED ? now : null,
        },
      });

      // 1. Observations / Vitals
      if (input.vitals) {
        const v = input.vitals;
        const bmi = calculateBMI(v.height, v.heightUnit, v.weight, v.weightUnit);

        await tx.observation.create({
          data: {
            clinicId: context.clinic.id,
            patientId: patient.id,
            consultationId: consultation.id,
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
      }

      // 2. Diagnoses
      if (input.diagnoses && input.diagnoses.length > 0) {
        await tx.diagnosis.createMany({
          data: input.diagnoses.map((d) => ({
            clinicId: context.clinic.id,
            patientId: patient.id,
            consultationId: consultation.id,
            name: d.name,
            codeSystem: d.codeSystem || null,
            code: d.code || null,
            type: d.type,
            clinicalStatus: d.clinicalStatus || 'ACTIVE',
            notes: d.notes || null,
          })),
        });
      }

      // 3. Prescriptions
      if (input.prescriptions && input.prescriptions.length > 0) {
        for (const rx of input.prescriptions) {
          const createdRx = await tx.prescription.create({
            data: {
              clinicId: context.clinic.id,
              patientId: patient.id,
              consultationId: consultation.id,
              doctorId: context.user.id,
              status: rx.status || 'ACTIVE',
              notes: rx.notes || null,
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

      // 4. Update linked appointment if present
      if (input.appointmentId) {
        if (targetStatus === ConsultationStatus.FINALIZED) {
          await tx.appointment.update({
            where: { id: input.appointmentId },
            data: {
              status: AppointmentStatus.COMPLETED,
              completedAt: now,
            },
          });
        } else {
          // If draft, mark in progress if still scheduled or checked in
          const apt = await tx.appointment.findUnique({
            where: { id: input.appointmentId },
            select: { status: true, inProgressAt: true },
          });

          if (apt && (apt.status === AppointmentStatus.SCHEDULED || apt.status === AppointmentStatus.CHECKED_IN)) {
            await tx.appointment.update({
              where: { id: input.appointmentId },
              data: {
                status: AppointmentStatus.IN_PROGRESS,
                inProgressAt: apt.inProgressAt || now,
              },
            });
          }
        }
      }

      // 5. Version Snapshot (if created as FINALIZED)
      if (targetStatus === ConsultationStatus.FINALIZED) {
        await tx.consultationVersion.create({
          data: {
            consultationId: consultation.id,
            clinicId: context.clinic.id,
            patientId: patient.id,
            doctorId: context.user.id,
            versionNumber: 1,
            status: ConsultationStatus.FINALIZED,
            subjective: consultation.subjective,
            objective: consultation.objective,
            assessment: consultation.assessment,
            plan: consultation.plan,
            observationsSnapshot: input.vitals ? (input.vitals as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            diagnosesSnapshot: input.diagnoses ? (input.diagnoses as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            prescriptionsSnapshot: input.prescriptions ? (input.prescriptions as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            finalizedAt: now,
          },
        });
      }

      // 6. Audit Log
      await recordClinicalAudit(tx, {
        clinicId: context.clinic.id,
        patientId: patient.id,
        consultationId: consultation.id,
        actorId: context.user.id,
        actorName: context.user.name,
        actorRole: context.membership.role,
        recordType: 'CONSULTATION',
        recordId: consultation.id,
        action: targetStatus === ConsultationStatus.FINALIZED ? 'FINALIZE' : 'CREATE',
        details:
          targetStatus === ConsultationStatus.FINALIZED
            ? 'Created and signed consultation'
            : 'Created draft consultation',
      });

      return tx.consultation.findUnique({
        where: { id: consultation.id },
        include: {
          patient: true,
          doctor: {
            select: { id: true, name: true, email: true },
          },
          appointment: true,
          observations: true,
          diagnoses: true,
          prescriptions: {
            include: { items: true },
          },
          versions: {
            orderBy: { versionNumber: 'asc' },
          },
          auditLogs: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    });

    return NextResponse.json({ consultation: createdConsultation }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in POST /api/consultations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
