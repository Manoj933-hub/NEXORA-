import { prisma } from '@/lib/prisma';
import type { PrismaClient, Prisma } from '@prisma/client';
import type {
  NotificationChannel,
  NotificationEventType,
  NotificationStatus,
} from '@prisma/client';
import {
  dispatchPatientNotification,
  NotificationServiceError,
} from './service';
import { redactTokensFromText } from './secure-links';

export interface TriggerWorkflowNotificationParams {
  clinicId: string;
  patientId: string;
  eventType: NotificationEventType;
  appointmentId?: string | null;
  prescriptionId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  createdById?: string | null;
  preferredChannel?: NotificationChannel;
  db?: PrismaClient | Prisma.TransactionClient;
}

export interface WorkflowNotificationResult {
  dispatched: boolean;
  notificationId?: string;
  status?: NotificationStatus;
  channel?: NotificationChannel;
  reason?: string;
  error?: string;
}

/**
 * Authoritative workflow notification trigger helper (Phase 9.3).
 *
 * Guarantees:
 * 1. Post-Success Dispatch: Triggered strictly after core DB operations succeed.
 * 2. Ancillary Safety: Encapsulated in try/catch; notification failures or AUDIT_LOG_FAILED
 *    never throw or rollback core appointment, clinical, or payment transactions.
 * 3. Consent & Settings Enforcement: Verifies patient consent and clinic alert toggles.
 * 4. Channel Resolution: Chooses WhatsApp if consented and enabled, else SMS, or returns safely.
 * 5. Rate-Limiting & Duplicate Suppression: Reuses Phase 9.2 atomic sliding-window protection.
 * 6. Non-Delivery Honesty: Never claims successful delivery if provider reports FAILED.
 */
export async function triggerWorkflowNotification(
  params: TriggerWorkflowNotificationParams
): Promise<WorkflowNotificationResult> {
  const {
    clinicId,
    patientId,
    eventType,
    appointmentId,
    prescriptionId,
    invoiceId,
    paymentId,
    createdById,
    preferredChannel,
    db = prisma,
  } = params;

  try {
    // 1. Fetch patient consent and contact details
    const patient = await db.patient.findFirst({
      where: {
        id: patientId,
        clinicId,
        isActive: true,
      },
      select: {
        id: true,
        phone: true,
        smsConsent: true,
        whatsappConsent: true,
      },
    });

    if (!patient || !patient.phone) {
      return {
        dispatched: false,
        reason: 'PATIENT_OR_PHONE_NOT_FOUND',
      };
    }

    // 2. Fetch clinic notification settings & alert category toggles
    const settings = await db.clinicNotificationSetting.findUnique({
      where: { clinicId },
    });

    if (
      settings &&
      !settings.appointmentAlerts &&
      (eventType === 'APPOINTMENT_BOOKED' ||
        eventType === 'APPOINTMENT_RESCHEDULED' ||
        eventType === 'APPOINTMENT_CANCELLED' ||
        eventType === 'APPOINTMENT_REMINDER')
    ) {
      return {
        dispatched: false,
        reason: 'APPOINTMENT_ALERTS_DISABLED',
      };
    }

    if (settings && !settings.prescriptionAlerts && eventType === 'PRESCRIPTION_READY') {
      return {
        dispatched: false,
        reason: 'PRESCRIPTION_ALERTS_DISABLED',
      };
    }

    if (
      settings &&
      !settings.billingAlerts &&
      (eventType === 'PAYMENT_RECEIPT' || eventType === 'INVOICE_ISSUED')
    ) {
      return {
        dispatched: false,
        reason: 'BILLING_ALERTS_DISABLED',
      };
    }

    // 3. Channel resolution based on consent and clinic channel enablement
    const whatsappAllowed =
      Boolean(patient.whatsappConsent) && (!settings || settings.whatsappEnabled);
    const smsAllowed =
      Boolean(patient.smsConsent) && (!settings || settings.smsEnabled);

    if (!whatsappAllowed && !smsAllowed) {
      return {
        dispatched: false,
        reason: 'NO_CONSENT_OR_CHANNEL_DISABLED',
      };
    }

    let channel: NotificationChannel;
    if (preferredChannel === 'WHATSAPP' && whatsappAllowed) {
      channel = 'WHATSAPP';
    } else if (preferredChannel === 'SMS' && smsAllowed) {
      channel = 'SMS';
    } else if (whatsappAllowed) {
      channel = 'WHATSAPP';
    } else {
      channel = 'SMS';
    }

    // 4. Dispatch via authoritative notification service
    try {
      const dispatchRes = await dispatchPatientNotification(
        {
          clinicId,
          patientId,
          channel,
          eventType,
          appointmentId: appointmentId || null,
          prescriptionId: prescriptionId || null,
          invoiceId: invoiceId || null,
          paymentId: paymentId || null,
          createdById: createdById || null,
        },
        db
      );

      return {
        dispatched: dispatchRes.success,
        notificationId: dispatchRes.notificationId,
        status: dispatchRes.status,
        channel: dispatchRes.channel,
        error: dispatchRes.error,
      };
    } catch (dispatchErr) {
      const rawMsg =
        dispatchErr instanceof Error ? dispatchErr.message : 'Unknown dispatch error';
      const safeMsg = redactTokensFromText(rawMsg);
      const errCode =
        dispatchErr instanceof NotificationServiceError ? dispatchErr.code : undefined;

      if (errCode === 'DUPLICATE_SUPPRESSED') {
        return {
          dispatched: false,
          reason: 'DUPLICATE_SUPPRESSED',
          error: safeMsg,
        };
      }

      if (
        errCode === 'PATIENT_RATE_LIMIT_EXCEEDED' ||
        errCode === 'CLINIC_RATE_LIMIT_EXCEEDED'
      ) {
        console.warn(`[WorkflowTrigger] Rate limit reached for ${eventType}: ${safeMsg}`);
        return {
          dispatched: false,
          reason: errCode,
          error: safeMsg,
        };
      }

      if (errCode === 'AUDIT_LOG_FAILED') {
        console.warn(`[WorkflowTrigger] Audit log persistence failed for ${eventType}: ${safeMsg}`);
        return {
          dispatched: false,
          reason: 'AUDIT_LOG_FAILED',
          error: safeMsg,
        };
      }

      console.warn(`[WorkflowTrigger] Ancillary notification failed for ${eventType}: ${safeMsg}`);
      return {
        dispatched: false,
        reason: errCode || 'DISPATCH_FAILED',
        error: safeMsg,
      };
    }
  } catch (fatalErr) {
    const rawMsg = fatalErr instanceof Error ? fatalErr.message : 'Unknown trigger error';
    console.warn(`[WorkflowTrigger] Unexpected error in trigger workflow: ${redactTokensFromText(rawMsg)}`);
    return {
      dispatched: false,
      reason: 'TRIGGER_ERROR',
      error: redactTokensFromText(rawMsg),
    };
  }
}

/**
 * Convenience helper: trigger appointment booked notification
 */
export async function notifyAppointmentBooked(params: {
  clinicId: string;
  patientId: string;
  appointmentId: string;
  createdById?: string | null;
  db?: PrismaClient | Prisma.TransactionClient;
}): Promise<WorkflowNotificationResult> {
  return triggerWorkflowNotification({
    ...params,
    eventType: 'APPOINTMENT_BOOKED',
  });
}

/**
 * Convenience helper: trigger appointment rescheduled notification
 */
export async function notifyAppointmentRescheduled(params: {
  clinicId: string;
  patientId: string;
  appointmentId: string;
  createdById?: string | null;
  db?: PrismaClient | Prisma.TransactionClient;
}): Promise<WorkflowNotificationResult> {
  return triggerWorkflowNotification({
    ...params,
    eventType: 'APPOINTMENT_RESCHEDULED',
  });
}

/**
 * Convenience helper: trigger appointment cancelled notification
 */
export async function notifyAppointmentCancelled(params: {
  clinicId: string;
  patientId: string;
  appointmentId: string;
  createdById?: string | null;
  db?: PrismaClient | Prisma.TransactionClient;
}): Promise<WorkflowNotificationResult> {
  return triggerWorkflowNotification({
    ...params,
    eventType: 'APPOINTMENT_CANCELLED',
  });
}

/**
 * Convenience helper: trigger prescription ready notification
 */
export async function notifyPrescriptionReady(params: {
  clinicId: string;
  patientId: string;
  prescriptionId: string;
  createdById?: string | null;
  db?: PrismaClient | Prisma.TransactionClient;
}): Promise<WorkflowNotificationResult> {
  return triggerWorkflowNotification({
    ...params,
    eventType: 'PRESCRIPTION_READY',
  });
}

/**
 * Convenience helper: trigger payment receipt notification
 */
export async function notifyPaymentReceipt(params: {
  clinicId: string;
  patientId: string;
  paymentId: string;
  invoiceId: string;
  createdById?: string | null;
  db?: PrismaClient | Prisma.TransactionClient;
}): Promise<WorkflowNotificationResult> {
  return triggerWorkflowNotification({
    ...params,
    eventType: 'PAYMENT_RECEIPT',
  });
}
