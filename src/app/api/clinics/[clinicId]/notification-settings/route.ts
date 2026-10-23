import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireClinicAccess, AuthError } from '@/lib/auth/tenant';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import { UpdateClinicNotificationSettingsSchema } from '@/lib/validations/notification';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  try {
    await connection();
  } catch {
    // Outside Next.js runtime context (e.g. tests)
  }

  try {
    const { clinicId } = await params;

    const context = await requireClinicAccess(request, clinicId, {
      requiredPermission: 'clinic:read',
    });

    const settings = await prisma.clinicNotificationSetting.findUnique({
      where: { clinicId: context.clinic.id },
    });

    // Return current settings or system defaults if not explicitly configured yet
    const resolvedSettings = {
      clinicId: context.clinic.id,
      smsEnabled: settings ? settings.smsEnabled : true,
      whatsappEnabled: settings ? settings.whatsappEnabled : true,
      appointmentAlerts: settings ? settings.appointmentAlerts : true,
      prescriptionAlerts: settings ? settings.prescriptionAlerts : true,
      billingAlerts: settings ? settings.billingAlerts : true,
      senderName: settings ? settings.senderName : null,
      createdAt: settings ? settings.createdAt : null,
      updatedAt: settings ? settings.updatedAt : null,
    };

    return NextResponse.json({ settings: resolvedSettings }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && 'digest' in error && (error as { digest: string }).digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching clinic notification settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  const originCheck = validateRequestOrigin(request);
  if (!originCheck.valid) {
    return NextResponse.json(
      { error: originCheck.reason || 'Invalid request origin' },
      { status: 403 }
    );
  }

  try {
    const { clinicId } = await params;

    // Enforce clinic:update permission (restricted to OWNER and ADMIN roles)
    const context = await requireClinicAccess(request, clinicId, {
      requiredPermission: 'clinic:update',
    });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = UpdateClinicNotificationSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const updated = await prisma.clinicNotificationSetting.upsert({
      where: { clinicId: context.clinic.id },
      create: {
        clinicId: context.clinic.id,
        smsEnabled: data.smsEnabled ?? true,
        whatsappEnabled: data.whatsappEnabled ?? true,
        appointmentAlerts: data.appointmentAlerts ?? true,
        prescriptionAlerts: data.prescriptionAlerts ?? true,
        billingAlerts: data.billingAlerts ?? true,
        senderName: data.senderName !== undefined ? data.senderName : null,
      },
      update: {
        ...(data.smsEnabled !== undefined ? { smsEnabled: data.smsEnabled } : {}),
        ...(data.whatsappEnabled !== undefined ? { whatsappEnabled: data.whatsappEnabled } : {}),
        ...(data.appointmentAlerts !== undefined
          ? { appointmentAlerts: data.appointmentAlerts }
          : {}),
        ...(data.prescriptionAlerts !== undefined
          ? { prescriptionAlerts: data.prescriptionAlerts }
          : {}),
        ...(data.billingAlerts !== undefined ? { billingAlerts: data.billingAlerts } : {}),
        ...(data.senderName !== undefined ? { senderName: data.senderName } : {}),
      },
    });

    return NextResponse.json(
      {
        message: 'Clinic notification settings updated successfully',
        settings: updated,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating clinic notification settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
