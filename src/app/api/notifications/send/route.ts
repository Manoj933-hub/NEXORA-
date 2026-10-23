import { NextResponse, connection } from 'next/server';
import { requireAuth, requireClinicAccess, AuthError } from '@/lib/auth/tenant';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import type { Permission } from '@/lib/auth/permissions';
import { SendNotificationInputSchema } from '@/lib/validations/notification';
import {
  dispatchPatientNotification,
  NotificationServiceError,
} from '@/lib/notifications/service';

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
 * POST /api/notifications/send
 * Dispatches an ad-hoc or workflow-triggered patient notification.
 */
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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = SendNotificationInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // Requires patient write permission
    const context = await resolveTenantContext(request, {
      requiredPermission: 'patients:write',
    });

    const data = parsed.data;

    const result = await dispatchPatientNotification({
      clinicId: context.clinic.id,
      patientId: data.patientId,
      channel: data.channel,
      eventType: data.eventType,
      appointmentId: data.appointmentId,
      prescriptionId: data.prescriptionId,
      invoiceId: data.invoiceId,
      paymentId: data.paymentId,
      customMessage: data.customMessage,
      createdById: context.user.id,
    });

    return NextResponse.json(
      {
        message: 'Notification processed successfully',
        notification: result,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && 'digest' in error && (error as { digest: string }).digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof NotificationServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error('Error sending notification:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
