import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireClinicAccess, AuthError } from '@/lib/auth/tenant';
import type { Permission } from '@/lib/auth/permissions';
import { NotificationLogQuerySchema } from '@/lib/validations/notification';
import { maskPhoneNumber } from '@/lib/notifications/phone';
import { redactTokensFromText } from '@/lib/notifications/secure-links';
import type { Prisma } from '@prisma/client';

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

/**
 * GET /api/notifications
 * Lists paginated notification delivery logs for the active clinic.
 */
export async function GET(request: Request) {
  try {
    await connection();
  } catch {
    // Outside Next.js runtime context (e.g. tests)
  }

  try {
    const context = await resolveTenantContext(request, {
      requiredPermission: 'patients:read',
    });

    const url = new URL(request.url);
    const parsedQuery = NotificationLogQuerySchema.safeParse({
      patientId: url.searchParams.get('patientId') || undefined,
      channel: url.searchParams.get('channel') || undefined,
      status: url.searchParams.get('status') || undefined,
      eventType: url.searchParams.get('eventType') || undefined,
      startDate: url.searchParams.get('startDate') || undefined,
      endDate: url.searchParams.get('endDate') || undefined,
      page: url.searchParams.get('page') || undefined,
      limit: url.searchParams.get('limit') || undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsedQuery.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { patientId, channel, status, eventType, startDate, endDate, page, limit } =
      parsedQuery.data;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationLogWhereInput = {
      clinicId: context.clinic.id,
      ...(patientId ? { patientId } : {}),
      ...(channel ? { channel } : {}),
      ...(status ? { status } : {}),
      ...(eventType ? { eventType } : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate) } : {}),
            },
          }
        : {}),
    };

    const [total, logs] = await Promise.all([
      prisma.notificationLog.count({ where }),
      prisma.notificationLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: {
            select: {
              id: true,
              mrn: true,
              name: true,
              phone: true,
            },
          },
          createdBy: {
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
      logs: logs.map((log) => ({
        id: log.id,
        channel: log.channel,
        eventType: log.eventType,
        recipientPhone: maskPhoneNumber(log.recipientPhone),
        messageBody: redactTokensFromText(log.messageBody),
        status: log.status,
        providerMessageId: log.providerMessageId,
        providerName: log.providerName,
        errorMessage: log.errorMessage,
        sentAt: log.sentAt,
        deliveredAt: log.deliveredAt,
        createdAt: log.createdAt,
        patient: log.patient
          ? {
              ...log.patient,
              phone: log.patient.phone ? maskPhoneNumber(log.patient.phone) : null,
            }
          : null,
        createdBy: log.createdBy,
        appointmentId: log.appointmentId,
        prescriptionId: log.prescriptionId,
        invoiceId: log.invoiceId,
        paymentId: log.paymentId,
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
    console.error('Error fetching notification logs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export { POST } from './send/route';

