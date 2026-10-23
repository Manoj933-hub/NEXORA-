import type {
  NotificationChannel,
  NotificationStatus,
  NotificationEventType,
} from '@prisma/client';

export type { NotificationChannel, NotificationStatus, NotificationEventType };

/**
 * Common parameters passed to a notification provider to dispatch a message.
 */
export interface SendNotificationParams {
  /** Recipient normalized phone in E.164 format (e.g. +919876543210, +9779841234567) */
  to: string;
  /** Pre-compiled, PHI-minimized message body */
  message: string;
  /** Delivery channel */
  channel: NotificationChannel;
  /** Event trigger type */
  eventType: NotificationEventType;
  /** Scoped clinic ID */
  clinicId: string;
  /** Optional metadata passed to provider for auditing / logging */
  metadata?: Record<string, unknown>;
}

/**
 * Result returned by a notification provider dispatch attempt.
 */
export interface NotificationDispatchResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
  status: NotificationStatus;
}

/**
 * Pluggable notification provider interface.
 */
export interface NotificationProvider {
  /** Unique name identifier of the provider (e.g. MOCK, TWILIO, FAST2SMS) */
  readonly name: string;

  /**
   * Dispatches a single message via the provider.
   */
  send(params: SendNotificationParams): Promise<NotificationDispatchResult>;
}

/**
 * Phone number parsing and normalization result.
 */
export interface NormalizedPhoneResult {
  isValid: boolean;
  e164: string | null;
  countryCode: 'IN' | 'NP' | 'OTHER' | null;
  nationalNumber: string | null;
  error?: string;
}

/**
 * Template variable parameters for appointment events.
 */
export interface AppointmentTemplateVariables {
  patientName: string;
  clinicName: string;
  doctorName: string;
  date: string; // e.g. "24 Oct 2026"
  time: string; // e.g. "10:30 AM"
  mrn: string;
  clinicPhone?: string;
}

/**
 * Template variable parameters for prescription events.
 */
export interface PrescriptionTemplateVariables {
  patientName: string;
  clinicName: string;
  doctorName: string;
  viewLink: string;
  mrn: string;
}

/**
 * Template variable parameters for payment receipt events.
 */
export interface PaymentReceiptTemplateVariables {
  patientName: string;
  clinicName: string;
  invoiceNumber: string;
  currency: string;
  amount: string;
  viewLink: string;
}

/**
 * Template variable parameters for invoice issued events.
 */
export interface InvoiceIssuedTemplateVariables {
  patientName: string;
  clinicName: string;
  invoiceNumber: string;
  currency: string;
  amount: string;
  dueDate?: string;
  viewLink: string;
}

/**
 * Generic union of template parameters.
 */
export type NotificationTemplateParams =
  | { eventType: 'APPOINTMENT_BOOKED'; variables: AppointmentTemplateVariables }
  | { eventType: 'APPOINTMENT_RESCHEDULED'; variables: AppointmentTemplateVariables }
  | { eventType: 'APPOINTMENT_CANCELLED'; variables: AppointmentTemplateVariables }
  | { eventType: 'APPOINTMENT_REMINDER'; variables: AppointmentTemplateVariables }
  | { eventType: 'PRESCRIPTION_READY'; variables: PrescriptionTemplateVariables }
  | { eventType: 'PAYMENT_RECEIPT'; variables: PaymentReceiptTemplateVariables }
  | { eventType: 'INVOICE_ISSUED'; variables: InvoiceIssuedTemplateVariables }
  | { eventType: 'GENERAL_ANNOUNCEMENT'; variables: { patientName: string; clinicName: string; message: string } };
