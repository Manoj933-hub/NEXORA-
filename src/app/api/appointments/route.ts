import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireClinicAccess, AuthError } from '@/lib/auth/tenant';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import { CreateAppointmentInputSchema, AppointmentQuerySchema } from '@/lib/validations/appointment';
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
      requiredPermission: 'reception:appointments:manage',
    });

    const url = new URL(request.url);
    const parsedQuery = AppointmentQuerySchema.safeParse({
      date: url.searchParams.get('date') || undefined,
      startDate: url.searchParams.get('startDate') || undefined,
      endDate: url.searchParams.get('endDate') || undefined,
      status: url.searchParams.get('status') || undefined,
      patientId: url.searchParams.get('patientId') || undefined,
      doctorId: url.searchParams.get('doctorId') || undefined,
      page: url.searchParams.get('page') || undefined,
      limit: url.searchParams.get('limit') || undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsedQuery.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { date, startDate, endDate, status, patientId, doctorId, page, limit } = parsedQuery.data;
    const skip = (page - 1) * limit;

    const whereClause: {
      clinicId: string;
      status?: AppointmentStatus;
      patientId?: string;
      doctorId?: string;
      startTime?: {
        gte?: Date;
        lte?: Date;
      };
    } = {
      clinicId: context.clinic.id,
    };

    if (status) {
      whereClause.status = status;
    }

    if (patientId) {
      whereClause.patientId = patientId;
    }

    if (doctorId) {
      whereClause.doctorId = doctorId;
    }

    // Date range filtering
    if (date) {
      // e.g. YYYY-MM-DD -> match the entire 24h window
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(`${date}T23:59:59.999Z`);
      whereClause.startTime = {
        gte: dayStart,
        lte: dayEnd,
      };
    } else if (startDate || endDate) {
      whereClause.startTime = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(endDate) } : {}),
      };
    }

    const [total, appointments] = await Promise.all([
      prisma.appointment.count({ where: whereClause }),
      prisma.appointment.findMany({
        where: whereClause,
        orderBy: { startTime: 'asc' },
        skip,
        take: limit,
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
      }),
    ]);

    return NextResponse.json({
      appointments: appointments.map((a) => ({
        id: a.id,
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status,
        reason: a.reason,
        notes: a.notes,
        cancelledReason: a.cancelledReason,
        checkedInAt: a.checkedInAt,
        inProgressAt: a.inProgressAt,
        completedAt: a.completedAt,
        patient: a.patient,
        doctor: a.doctor,
        createdAt: a.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      clinicId: context.clinic.id,
    });
  } catch (error) {
    if (error instanceof Error && 'digest' in error && (error as { digest: string }).digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error listing appointments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const originCheck = validateRequestOrigin(request);
  if (!originCheck.valid) {
    return NextResponse.json(
      { error: originCheck.reason || 'Invalid request origin' },
      { status: 403 }
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = CreateAppointmentInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const context = await resolveTenantContext(request, {
      requiredPermission: 'reception:appointments:manage',
    });

    const data = parsed.data;
    const startDateTime = new Date(data.startTime);
    const endDateTime = new Date(data.endTime);

    // 1. Tenant boundary: verify patient belongs to active clinic
    const patient = await prisma.patient.findFirst({
      where: {
        id: data.patientId,
        clinicId: context.clinic.id,
        isActive: true,
      },
    });

    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found in this clinic organization' },
        { status: 404 }
      );
    }

    // 2. If doctorId is specified, verify doctor belongs to active clinic
    if (data.doctorId) {
      const doctorMembership = await prisma.membership.findFirst({
        where: {
          userId: data.doctorId,
          clinicId: context.clinic.id,
          isActive: true,
        },
      });

      if (!doctorMembership) {
        return NextResponse.json(
          { error: 'Assigned practitioner is not an active member of this clinic' },
          { status: 400 }
        );
      }

      // 3. Conflict detection: check for overlapping non-cancelled appointment for this doctor
      const conflict = await prisma.appointment.findFirst({
        where: {
          clinicId: context.clinic.id,
          doctorId: data.doctorId,
          status: { not: AppointmentStatus.CANCELLED },
          startTime: { lt: endDateTime },
          endTime: { gt: startDateTime },
        },
        select: {
          id: true,
          startTime: true,
          endTime: true,
        },
      });

      if (conflict) {
        return NextResponse.json(
          {
            error: 'Scheduling conflict: The assigned doctor already has a booked appointment during this time slot',
            conflictId: conflict.id,
          },
          { status: 409 }
        );
      }
    }

    // 4. Create appointment
    const appointment = await prisma.appointment.create({
      data: {
        clinicId: context.clinic.id,
        patientId: patient.id,
        doctorId: data.doctorId || null,
        startTime: startDateTime,
        endTime: endDateTime,
        status: AppointmentStatus.SCHEDULED,
        reason: data.reason || null,
        notes: data.notes || null,
      },
      include: {
        patient: {
          select: {
            id: true,
            mrn: true,
            name: true,
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
      },
    });

    return NextResponse.json(
      {
        message: 'Appointment scheduled successfully',
        appointment: {
          id: appointment.id,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          status: appointment.status,
          reason: appointment.reason,
          notes: appointment.notes,
          patient: appointment.patient,
          doctor: appointment.doctor,
          createdAt: appointment.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error creating appointment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
