import { z } from 'zod';

export const NotificationChannelEnum = z.enum(['SMS', 'WHATSAPP']);
export type NotificationChannelType = z.infer<typeof NotificationChannelEnum>;

export const NotificationStatusEnum = z.enum(['PENDING', 'SENT', 'DELIVERED', 'FAILED']);
export type NotificationStatusType = z.infer<typeof NotificationStatusEnum>;

export const NotificationEventTypeEnum = z.enum([
  'APPOINTMENT_BOOKED',
  'APPOINTMENT_RESCHEDULED',
  'APPOINTMENT_CANCELLED',
  'APPOINTMENT_REMINDER',
  'PRESCRIPTION_READY',
  'PAYMENT_RECEIPT',
  'INVOICE_ISSUED',
  'GENERAL_ANNOUNCEMENT',
]);
export type NotificationEventTypeType = z.infer<typeof NotificationEventTypeEnum>;

/**
 * Validation schema for manual/ad-hoc notification dispatch payload.
 */
export const SendNotificationInputSchema = z
  .object({
    patientId: z.string().uuid('Invalid patient ID format'),
    channel: NotificationChannelEnum,
    eventType: NotificationEventTypeEnum,
    appointmentId: z.string().uuid('Invalid appointment ID format').optional().nullable(),
    prescriptionId: z.string().uuid('Invalid prescription ID format').optional().nullable(),
    invoiceId: z.string().uuid('Invalid invoice ID format').optional().nullable(),
    paymentId: z.string().uuid('Invalid payment ID format').optional().nullable(),
    customMessage: z
      .string()
      .trim()
      .min(1, 'Message cannot be empty')
      .max(500, 'Custom message exceeds 500 characters')
      .optional()
      .nullable(),
  })
  .refine(
    (data) => {
      // If eventType is GENERAL_ANNOUNCEMENT, customMessage is required
      if (data.eventType === 'GENERAL_ANNOUNCEMENT' && !data.customMessage) {
        return false;
      }
      return true;
    },
    {
      message: 'Custom message is required for general announcements',
      path: ['customMessage'],
    }
  );

export type SendNotificationInput = z.infer<typeof SendNotificationInputSchema>;

/**
 * Validation schema for querying clinic notification delivery logs.
 */
export const NotificationLogQuerySchema = z.object({
  patientId: z.string().uuid('Invalid patient ID').optional(),
  channel: NotificationChannelEnum.optional(),
  status: NotificationStatusEnum.optional(),
  eventType: NotificationEventTypeEnum.optional(),
  startDate: z
    .string()
    .datetime({ message: 'Start date must be an ISO 8601 string' })
    .optional(),
  endDate: z
    .string()
    .datetime({ message: 'End date must be an ISO 8601 string' })
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type NotificationLogQuery = z.infer<typeof NotificationLogQuerySchema>;

/**
 * Validation schema for updating clinic notification channel and alert preferences.
 */
export const UpdateClinicNotificationSettingsSchema = z
  .object({
    smsEnabled: z.boolean().optional(),
    whatsappEnabled: z.boolean().optional(),
    appointmentAlerts: z.boolean().optional(),
    prescriptionAlerts: z.boolean().optional(),
    billingAlerts: z.boolean().optional(),
    senderName: z
      .string()
      .trim()
      .min(2, 'Sender name must be at least 2 characters')
      .max(50, 'Sender name cannot exceed 50 characters')
      .optional()
      .nullable(),
  })
  .refine(
    (data) => {
      // Must provide at least one field to update
      return Object.keys(data).length > 0;
    },
    {
      message: 'At least one setting must be provided for update',
    }
  );

export type UpdateClinicNotificationSettingsInput = z.infer<
  typeof UpdateClinicNotificationSettingsSchema
>;

/**
 * Validation schema for updating patient communication consent.
 */
export const UpdatePatientConsentSchema = z
  .object({
    smsConsent: z.boolean().optional(),
    whatsappConsent: z.boolean().optional(),
  })
  .refine(
    (data) => data.smsConsent !== undefined || data.whatsappConsent !== undefined,
    {
      message: 'At least one consent preference must be provided',
    }
  );

export type UpdatePatientConsentInput = z.infer<typeof UpdatePatientConsentSchema>;
