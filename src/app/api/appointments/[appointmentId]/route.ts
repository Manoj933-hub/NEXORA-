import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireClinicAccess, AuthError } from '@/lib/auth/tenant';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import {
  isValidStatusTransition,
  UpdateAppointmentStatusInputSchema,
  RescheduleAppointmentInputSchema,
} from '@/lib/validations/appointment';
import type { Permission } from '@/lib/auth/permissions';
import { AppointmentStatus } from '@prisma/client';

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
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    await connection();
  } catch {
    // Outside Next.js runtime context (e.g. tests)
  }

  try {
    const { appointmentId } = await params;
    const context = await resolveTenantContext(request, {
      requiredPermission: 'reception:appointments:manage',
    });

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        clinicId: context.clinic.id,
      },
      include: {
        patient: {
          select: {
            id: true,
            mrn: true,
            name: true,
            phone: true,
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
      },
    });

    if (!appointment) {
      return NextResponse.json(
        { error: 'Appointment not found in active clinic' },
        { status: 404 }
      );
    }

    return NextResponse.json({ appointment });
  } catch (error) {
    if (error instanceof Error && 'digest' in error && (error as { digest: string }).digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching appointment details:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const originCheck = validateRequestOrigin(request);
  if (!originCheck.valid) {
    return NextResponse.json(
      { error: originCheck.reason || 'Invalid request origin' },
      { status: 403 }
    );
  }

  try {
    const { appointmentId } = await params;
    const context = await resolveTenantContext(request, {
      requiredPermission: 'reception:appointments:manage',
    });

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    // Verify appointment belongs to this clinic
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        clinicId: context.clinic.id,
      },
    });

    if (!appointment) {
      return NextResponse.json(
        { error: 'Appointment not found or belongs to another clinic' },
        { status: 404 }
      );
    }

    // Branch 1: Rescheduling (has startTime or endTime)
    if ('startTime' in body || 'endTime' in body) {
      if (appointment.status === AppointmentStatus.COMPLETED || appointment.status === AppointmentStatus.CANCELLED) {
        return NextResponse.json(
          { error: `Cannot reschedule appointment with status '${appointment.status}'` },
          { status: 400 }
        );
      }

      const parsedReschedule = RescheduleAppointmentInputSchema.safeParse(body);
      if (!parsedReschedule.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: parsedReschedule.error.flatten().fieldErrors },
          { status: 400 }
        );
      }

      const { startTime, endTime, reason } = parsedReschedule.data;
      const startDateTime = new Date(startTime);
      const endDateTime = new Date(endTime);

      // Conflict check if assigned to a doctor
      if (appointment.doctorId) {
        const conflict = await prisma.appointment.findFirst({
          where: {
            clinicId: context.clinic.id,
            doctorId: appointment.doctorId,
            id: { not: appointment.id },
            status: { not: AppointmentStatus.CANCELLED },
            startTime: { lt: endDateTime },
            endTime: { gt: startDateTime },
          },
        });

        if (conflict) {
          return NextResponse.json(
            { error: 'Scheduling conflict: The assigned doctor has an existing appointment during this rescheduled window' },
            { status: 409 }
          );
        }
      }

      const updated = await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          startTime: startDateTime,
          endTime: endDateTime,
          ...(reason !== undefined ? { reason } : {}),
        },
        include: {
          patient: { select: { id: true, mrn: true, name: true, phone: true } },
          doctor: { select: { id: true, name: true, email: true } },
        },
      });

      return NextResponse.json({
        message: 'Appointment rescheduled successfully',
        appointment: updated,
      });
    }

    // Branch 2: Status transition
    if ('status' in body) {
      const parsedStatus = UpdateAppointmentStatusInputSchema.safeParse(body);
      if (!parsedStatus.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: parsedStatus.error.flatten().fieldErrors },
          { status: 400 }
        );
      }

      const { status: targetStatus, cancelledReason } = parsedStatus.data;

      // Validate status transition
      if (!isValidStatusTransition(appointment.status, targetStatus)) {
        return NextResponse.json(
          {
            error: `Invalid appointment status transition: Cannot transition from '${appointment.status}' to '${targetStatus}'`,
          },
          { status: 400 }
        );
      }

      const updateData: {
        status: AppointmentStatus;
        cancelledReason?: string | null;
        checkedInAt?: Date | null;
        inProgressAt?: Date | null;
        completedAt?: Date | null;
      } = {
        status: targetStatus,
      };

      if (targetStatus === AppointmentStatus.CHECKED_IN && !appointment.checkedInAt) {
        updateData.checkedInAt = new Date();
      } else if (targetStatus === AppointmentStatus.IN_PROGRESS && !appointment.inProgressAt) {
        updateData.inProgressAt = new Date();
      } else if (targetStatus === AppointmentStatus.COMPLETED && !appointment.completedAt) {
        updateData.completedAt = new Date();
      } else if (targetStatus === AppointmentStatus.CANCELLED) {
        updateData.cancelledReason = cancelledReason || 'Cancelled by staff/practitioner';
      }

      const updated = await prisma.appointment.update({
        where: { id: appointment.id },
        data: updateData,
        include: {
          patient: { select: { id: true, mrn: true, name: true, phone: true } },
          doctor: { select: { id: true, name: true, email: true } },
        },
      });

      return NextResponse.json({
        message: `Appointment marked as ${targetStatus.toLowerCase().replace('_', ' ')}`,
        appointment: updated,
      });
    }

    return NextResponse.json(
      { error: 'Invalid request: Must provide status or reschedule time window' },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating appointment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
