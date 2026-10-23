import { prisma } from '@/lib/prisma';
import type { PrismaClient, Prisma } from '@prisma/client';
import type {
  NotificationChannel,
  NotificationEventType,
  NotificationStatus,
} from '@prisma/client';
import { normalizePhoneNumber } from './phone';
import { compileNotificationMessage, PhiViolationError } from './templates';
import {
  generateSecureDocumentToken,
  buildPublicDocumentUrl,
  redactTokensFromText,
} from './secure-links';
import { acquireNotificationRateLimit } from './rate-limiter';
import { getNotificationProvider } from './provider';
import type { NotificationDispatchResult } from './types';

export class NotificationServiceError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, statusCode = 400, code = 'NOTIFICATION_ERROR') {
    super(message);
    this.name = 'NotificationServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface DispatchNotificationRequest {
  clinicId: string;
  patientId: string;
  channel: NotificationChannel;
  eventType: NotificationEventType;
  appointmentId?: string | null;
  prescriptionId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  customMessage?: string | null;
  createdById?: string | null;
}

export interface DispatchNotificationResponse {
  success: boolean;
  notificationId: string;
  status: NotificationStatus;
  error?: string;
  recipientPhone: string;
  channel: NotificationChannel;
}

/**
 * Authoritative notification dispatch service.
 * Enforces:
 * - Patient consent check (Safeguard 1: default false, must be explicitly true)
 * - Clinic settings and channel enablement check
 * - Tenant isolation across patient and linked resources
 * - E.164 phone normalization
 * - Database-backed atomic rate limiting and duplicate suppression (Safeguard 2)
 * - PHI-free template compilation
 * - Audited database logging of all attempts without logging raw tokens or PHI
 */
export async function dispatchPatientNotification(
  req: DispatchNotificationRequest,
  db: PrismaClient | Prisma.TransactionClient = prisma
): Promise<DispatchNotificationResponse> {
  const {
    clinicId,
    patientId,
    channel,
    eventType,
    appointmentId,
    prescriptionId,
    invoiceId,
    paymentId,
    customMessage,
    createdById,
  } = req;

  // 1. Verify Clinic Notification Settings
  const settings = await db.clinicNotificationSetting.findUnique({
    where: { clinicId },
  });

  // Check channel enablement (default to true if settings record not yet initialized)
  if (channel === 'SMS' && settings && !settings.smsEnabled) {
    throw new NotificationServiceError(
      'SMS channel is currently disabled in clinic settings',
      400,
      'CHANNEL_DISABLED'
    );
  }

  if (channel === 'WHATSAPP' && settings && !settings.whatsappEnabled) {
    throw new NotificationServiceError(
      'WhatsApp channel is currently disabled in clinic settings',
      400,
      'CHANNEL_DISABLED'
    );
  }

  // Check alert type toggles
  if (
    settings &&
    !settings.appointmentAlerts &&
    (eventType === 'APPOINTMENT_BOOKED' ||
      eventType === 'APPOINTMENT_RESCHEDULED' ||
      eventType === 'APPOINTMENT_CANCELLED' ||
      eventType === 'APPOINTMENT_REMINDER')
  ) {
    throw new NotificationServiceError(
      'Appointment notifications are disabled in clinic settings',
      400,
      'ALERT_TYPE_DISABLED'
    );
  }

  if (settings && !settings.prescriptionAlerts && eventType === 'PRESCRIPTION_READY') {
    throw new NotificationServiceError(
      'Prescription notifications are disabled in clinic settings',
      400,
      'ALERT_TYPE_DISABLED'
    );
  }

  if (
    settings &&
    !settings.billingAlerts &&
    (eventType === 'PAYMENT_RECEIPT' || eventType === 'INVOICE_ISSUED')
  ) {
    throw new NotificationServiceError(
      'Billing notifications are disabled in clinic settings',
      400,
      'ALERT_TYPE_DISABLED'
    );
  }

  // 2. Tenant Boundary & Patient Verification
  const patient = await db.patient.findFirst({
    where: {
      id: patientId,
      clinicId,
      isActive: true,
    },
    include: {
      clinic: {
        select: {
          id: true,
          name: true,
          phone: true,
          country: true,
          currency: true,
        },
      },
    },
  });

  if (!patient) {
    throw new NotificationServiceError(
      'Patient not found in the active clinic organization',
      404,
      'PATIENT_NOT_FOUND'
    );
  }

  // 3. Verify Patient Phone and Consent (Safeguard 1)
  if (!patient.phone) {
    throw new NotificationServiceError(
      'Patient does not have a recorded phone number',
      400,
      'MISSING_PHONE'
    );
  }

  if (channel === 'SMS' && !patient.smsConsent) {
    throw new NotificationServiceError(
      'Patient has not provided consent for SMS notifications',
      403,
      'CONSENT_DENIED'
    );
  }

  if (channel === 'WHATSAPP' && !patient.whatsappConsent) {
    throw new NotificationServiceError(
      'Patient has not provided consent for WhatsApp notifications',
      403,
      'CONSENT_DENIED'
    );
  }

  // Normalize phone number according to clinic country default
  const normalizedPhone = normalizePhoneNumber(
    patient.phone,
    patient.clinic.country as 'IN' | 'NP'
  );

  if (!normalizedPhone.isValid || !normalizedPhone.e164) {
    throw new NotificationServiceError(
      normalizedPhone.error || 'Invalid recipient mobile phone number',
      400,
      'INVALID_PHONE'
    );
  }

  const recipientPhone = normalizedPhone.e164;

  // 4. Validate Linked Resource Entities
  let resourceIdForRateLimit: string | null = null;
  let appointmentData: {
    startTime: Date;
    doctorName: string;
  } | null = null;
  let prescriptionData: {
    id: string;
    doctorName: string;
  } | null = null;
  let invoiceData: {
    id: string;
    invoiceNumber: string;
    totalAmount: string;
    currency: string;
    dueDate: Date | null;
  } | null = null;
  let paymentData: {
    id: string;
    invoiceNumber: string;
    amount: string;
    currency: string;
  } | null = null;

  if (appointmentId) {
    resourceIdForRateLimit = appointmentId;
    const appointment = await db.appointment.findFirst({
      where: { id: appointmentId, clinicId, patientId },
      include: { doctor: { select: { name: true } } },
    });
    if (!appointment) {
      throw new NotificationServiceError(
        'Linked appointment not found or does not belong to this patient',
        404,
        'RESOURCE_NOT_FOUND'
      );
    }
    appointmentData = {
      startTime: appointment.startTime,
      doctorName: appointment.doctor?.name || 'Clinic Physician',
    };
  }

  if (prescriptionId) {
    resourceIdForRateLimit = prescriptionId;
    const prescription = await db.prescription.findFirst({
      where: { id: prescriptionId, clinicId, patientId },
      include: { doctor: { select: { name: true } } },
    });
    if (!prescription) {
      throw new NotificationServiceError(
        'Linked prescription not found or does not belong to this patient',
        404,
        'RESOURCE_NOT_FOUND'
      );
    }
    prescriptionData = {
      id: prescription.id,
      doctorName: prescription.doctor.name,
    };
  }

  if (invoiceId) {
    resourceIdForRateLimit = invoiceId;
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, clinicId, patientId },
    });
    if (!invoice) {
      throw new NotificationServiceError(
        'Linked invoice not found or does not belong to this patient',
        404,
        'RESOURCE_NOT_FOUND'
      );
    }
    invoiceData = {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount.toString(),
      currency: invoice.currency,
      dueDate: invoice.dueDate,
    };
  }

  if (paymentId) {
    resourceIdForRateLimit = paymentId;
    const payment = await db.payment.findFirst({
      where: { id: paymentId, clinicId },
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            currency: true,
            patientId: true,
          },
        },
      },
    });
    if (!payment || payment.invoice.patientId !== patientId) {
      throw new NotificationServiceError(
        'Linked payment not found or does not belong to this patient',
        404,
        'RESOURCE_NOT_FOUND'
      );
    }
    paymentData = {
      id: payment.id,
      invoiceNumber: payment.invoice.invoiceNumber,
      amount: payment.amount.toString(),
      currency: payment.invoice.currency,
    };
  }

  // 5. Atomic Sliding-Window Rate Limiting & Duplicate Suppression
  const rateLimitResult = await acquireNotificationRateLimit(
    {
      clinicId,
      recipientPhone,
      eventType,
      resourceId: resourceIdForRateLimit,
    },
    db
  );

  if (!rateLimitResult.allowed) {
    if (rateLimitResult.reason === 'DUPLICATE_SUPPRESSED') {
      throw new NotificationServiceError(
        'Notification suppressed: identical notification already dispatched within the last 5 minutes',
        429,
        'DUPLICATE_SUPPRESSED'
      );
    }
    if (rateLimitResult.reason === 'PATIENT_LIMIT_EXCEEDED') {
      throw new NotificationServiceError(
        'Hourly rate limit exceeded: maximum 3 notifications allowed per patient per hour',
        429,
        'PATIENT_RATE_LIMIT_EXCEEDED'
      );
    }
    if (rateLimitResult.reason === 'CLINIC_LIMIT_EXCEEDED') {
      throw new NotificationServiceError(
        'Clinic quota exceeded: maximum 100 notifications allowed per clinic per hour',
        429,
        'CLINIC_RATE_LIMIT_EXCEEDED'
      );
    }
  }

  // 6. Secure Expiring Link Generation (if applicable)
  let publicViewLink = '';
  if (eventType === 'PRESCRIPTION_READY' && prescriptionData) {
    const token = generateSecureDocumentToken(7);
    await db.secureDocumentLink.create({
      data: {
        clinicId,
        patientId,
        tokenHash: token.tokenHash,
        resourceType: 'PRESCRIPTION',
        resourceId: prescriptionData.id,
        expiresAt: token.expiresAt,
      },
    });
    publicViewLink = buildPublicDocumentUrl(token.rawToken);
  } else if (eventType === 'PAYMENT_RECEIPT' && paymentData) {
    const token = generateSecureDocumentToken(7);
    await db.secureDocumentLink.create({
      data: {
        clinicId,
        patientId,
        tokenHash: token.tokenHash,
        resourceType: 'RECEIPT',
        resourceId: paymentData.id,
        expiresAt: token.expiresAt,
      },
    });
    publicViewLink = buildPublicDocumentUrl(token.rawToken);
  } else if (eventType === 'INVOICE_ISSUED' && invoiceData) {
    const token = generateSecureDocumentToken(7);
    await db.secureDocumentLink.create({
      data: {
        clinicId,
        patientId,
        tokenHash: token.tokenHash,
        resourceType: 'INVOICE',
        resourceId: invoiceData.id,
        expiresAt: token.expiresAt,
      },
    });
    publicViewLink = buildPublicDocumentUrl(token.rawToken);
  }

  // 7. Compile Message Body (Strict PHI Minimization)
  const clinicDisplayName = settings?.senderName || patient.clinic.name;
  let messageBody: string;

  try {
    switch (eventType) {
      case 'APPOINTMENT_BOOKED':
      case 'APPOINTMENT_RESCHEDULED':
      case 'APPOINTMENT_CANCELLED':
      case 'APPOINTMENT_REMINDER': {
        const appointmentDate = appointmentData
          ? appointmentData.startTime.toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : 'scheduled date';
        const appointmentTime = appointmentData
          ? appointmentData.startTime.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            })
          : 'scheduled time';

        messageBody = compileNotificationMessage({
          eventType,
          variables: {
            patientName: patient.name,
            clinicName: clinicDisplayName,
            doctorName: appointmentData?.doctorName || 'Doctor',
            date: appointmentDate,
            time: appointmentTime,
            mrn: patient.mrn,
            clinicPhone: patient.clinic.phone || undefined,
          },
        });
        break;
      }
      case 'PRESCRIPTION_READY': {
        messageBody = compileNotificationMessage({
          eventType: 'PRESCRIPTION_READY',
          variables: {
            patientName: patient.name,
            clinicName: clinicDisplayName,
            doctorName: prescriptionData?.doctorName || 'Doctor',
            mrn: patient.mrn,
            viewLink: publicViewLink,
          },
        });
        break;
      }
      case 'PAYMENT_RECEIPT': {
        messageBody = compileNotificationMessage({
          eventType: 'PAYMENT_RECEIPT',
          variables: {
            patientName: patient.name,
            clinicName: clinicDisplayName,
            invoiceNumber: paymentData?.invoiceNumber || '',
            currency: paymentData?.currency || patient.clinic.currency,
            amount: paymentData?.amount || '0.00',
            viewLink: publicViewLink,
          },
        });
        break;
      }
      case 'INVOICE_ISSUED': {
        const formattedDueDate = invoiceData?.dueDate
          ? invoiceData.dueDate.toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : undefined;

        messageBody = compileNotificationMessage({
          eventType: 'INVOICE_ISSUED',
          variables: {
            patientName: patient.name,
            clinicName: clinicDisplayName,
            invoiceNumber: invoiceData?.invoiceNumber || '',
            currency: invoiceData?.currency || patient.clinic.currency,
            amount: invoiceData?.totalAmount || '0.00',
            dueDate: formattedDueDate,
            viewLink: publicViewLink,
          },
        });
        break;
      }
      case 'GENERAL_ANNOUNCEMENT': {
        messageBody = compileNotificationMessage({
          eventType: 'GENERAL_ANNOUNCEMENT',
          variables: {
            patientName: patient.name,
            clinicName: clinicDisplayName,
            message: customMessage || '',
          },
        });
        break;
      }
      default:
        throw new NotificationServiceError(`Unsupported event type: ${eventType}`, 400);
    }
  } catch (err) {
    if (err instanceof PhiViolationError) {
      throw new NotificationServiceError(err.message, 400, 'PHI_VIOLATION');
    }
    throw err;
  }

  // 8. Dispatch via Active Provider (Defaults to Mock Provider)
  const provider = getNotificationProvider();
  let dispatchResult: NotificationDispatchResult;

  try {
    dispatchResult = await provider.send({
      to: recipientPhone,
      message: messageBody,
      channel,
      eventType,
      clinicId,
      metadata: {
        patientId,
        appointmentId,
        prescriptionId,
        invoiceId,
        paymentId,
      },
    });
  } catch (providerErr) {
    const rawMsg = providerErr instanceof Error ? providerErr.message : 'Unknown provider error';
    const safeMsg = redactTokensFromText(rawMsg);
    dispatchResult = {
      success: false,
      status: 'FAILED',
      error: `Provider dispatch failed: ${safeMsg}`,
    };
  }

  // 9. Persist Audited Notification Log (Sanitizing any raw token from messageBody)
  const sanitizedMessageBody = redactTokensFromText(messageBody);
  let logId = '';

  try {
    const log = await db.notificationLog.create({
      data: {
        clinicId,
        patientId,
        appointmentId: appointmentId || null,
        prescriptionId: prescriptionId || null,
        invoiceId: invoiceId || null,
        paymentId: paymentId || null,
        channel,
        eventType,
        recipientPhone,
        messageBody: sanitizedMessageBody,
        status: dispatchResult.status,
        providerMessageId: dispatchResult.providerMessageId || null,
        providerName: provider.name,
        errorMessage: dispatchResult.error || null,
        sentAt: dispatchResult.success ? new Date() : null,
        createdById: createdById || null,
      },
    });
    logId = log.id;
  } catch (dbErr) {
    console.error('Failed to persist notification audit log to database:', dbErr);
    throw new NotificationServiceError(
      'Notification was processed but audit log persistence failed',
      500,
      'AUDIT_LOG_FAILED'
    );
  }

  return {
    success: dispatchResult.success,
    notificationId: logId,
    status: dispatchResult.status,
    error: dispatchResult.error,
    recipientPhone,
    channel,
  };
}
