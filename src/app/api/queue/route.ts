import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireClinicAccess, AuthError } from '@/lib/auth/tenant';
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

export async function GET(request: Request) {
  try {
    await connection();
  } catch {
    // Outside Next.js runtime context (e.g. tests)
  }

  try {
    const context = await resolveTenantContext(request, {
      requiredPermission: 'reception:queue:manage',
    });

    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');

    let dayStart: Date;
    let dayEnd: Date;
    let dateStr: string;

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      dateStr = dateParam;
      dayStart = new Date(`${dateParam}T00:00:00.000Z`);
      dayEnd = new Date(`${dateParam}T23:59:59.999Z`);
    } else {
      const today = new Date();
      dateStr = today.toISOString().split('T')[0];
      dayStart = new Date(`${dateStr}T00:00:00.000Z`);
      dayEnd = new Date(`${dateStr}T23:59:59.999Z`);
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: context.clinic.id,
        startTime: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      orderBy: { startTime: 'asc' },
      include: {
        patient: {
          select: {
            id: true,
            mrn: true,
            name: true,
            phone: true,
            gender: true,
            dateOfBirth: true,
            bloodGroup: true,
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

    const metrics = {
      total: appointments.length,
      scheduled: appointments.filter((a) => a.status === AppointmentStatus.SCHEDULED).length,
      checkedIn: appointments.filter((a) => a.status === AppointmentStatus.CHECKED_IN).length,
      inProgress: appointments.filter((a) => a.status === AppointmentStatus.IN_PROGRESS).length,
      completed: appointments.filter((a) => a.status === AppointmentStatus.COMPLETED).length,
      cancelled: appointments.filter((a) => a.status === AppointmentStatus.CANCELLED).length,
    };

    return NextResponse.json({
      date: dateStr,
      metrics,
      queue: appointments.map((a) => ({
        id: a.id,
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status,
        reason: a.reason,
        notes: a.notes,
        checkedInAt: a.checkedInAt,
        inProgressAt: a.inProgressAt,
        completedAt: a.completedAt,
        cancelledReason: a.cancelledReason,
        patient: a.patient,
        doctor: a.doctor,
      })),
      clinicId: context.clinic.id,
    });
  } catch (error) {
    if (error instanceof Error && 'digest' in error && (error as { digest: string }).digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching reception queue:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
