import type { NotificationTemplateParams, NotificationEventType } from './types';

export class PhiViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhiViolationError';
  }
}

/**
 * Formats doctor name to cleanly ensure single "Dr." title.
 */
export function formatDoctorName(doctorName: string | undefined): string {
  if (!doctorName) return '';
  const trimmed = doctorName.trim();
  if (/^dr\.?\s+/i.test(trimmed)) {
    return trimmed.replace(/^dr\.?\s+/i, 'Dr. ');
  }
  return `Dr. ${trimmed}`;
}

/**
 * Standard TRAI DLT-compatible static message templates.
 * Designed to minimize PHI and comply with commercial telecom regulations in India and Nepal.
 */
export const NOTIFICATION_TEMPLATES: Record<
  NotificationEventType,
  (variables: Record<string, string>) => string
> = {
  APPOINTMENT_BOOKED: (v) =>
    `Dear ${v.patientName}, your appointment at ${v.clinicName} with ${formatDoctorName(v.doctorName)} is confirmed for ${v.date} at ${v.time}. Ref: ${v.mrn}.`,

  APPOINTMENT_RESCHEDULED: (v) =>
    `Dear ${v.patientName}, your appointment at ${v.clinicName} with ${formatDoctorName(v.doctorName)} has been rescheduled to ${v.date} at ${v.time}. Ref: ${v.mrn}.`,

  APPOINTMENT_CANCELLED: (v) =>
    `Dear ${v.patientName}, your appointment at ${v.clinicName} on ${v.date} at ${v.time} has been cancelled.${v.clinicPhone ? ` For queries call ${v.clinicPhone}.` : ''}`,

  APPOINTMENT_REMINDER: (v) =>
    `Dear ${v.patientName}, reminder for your appointment at ${v.clinicName} with ${formatDoctorName(v.doctorName)} on ${v.date} at ${v.time}. Ref: ${v.mrn}.`,

  PRESCRIPTION_READY: (v) =>
    `Dear ${v.patientName}, your prescription from ${formatDoctorName(v.doctorName)} at ${v.clinicName} is ready. View securely: ${v.viewLink}`,

  PAYMENT_RECEIPT: (v) =>
    `Dear ${v.patientName}, payment of ${v.currency} ${v.amount} received for invoice #${v.invoiceNumber} at ${v.clinicName}. Receipt: ${v.viewLink}`,

  INVOICE_ISSUED: (v) =>
    `Dear ${v.patientName}, invoice #${v.invoiceNumber} for ${v.currency} ${v.amount} has been issued by ${v.clinicName}.${v.dueDate ? ` Due: ${v.dueDate}.` : ''} Details: ${v.viewLink}`,

  GENERAL_ANNOUNCEMENT: (v) =>
    `Dear ${v.patientName}, message from ${v.clinicName}: ${v.message}`,
};


/**
 * Known sensitive medical/clinical keywords that must NEVER appear in outbound SMS/WhatsApp messages.
 * Outbound patient notifications are strictly administrative.
 */
const FORBIDDEN_PHI_PATTERNS = [
  /\bdiagnosis\b/i,
  /\bdiagnoses\b/i,
  /\bcondition\b/i,
  /\bsyndrome\b/i,
  /\bprescription items?\b/i,
  /\btablets?\b/i,
  /\bcapsules?\b/i,
  /\bsyrup\b/i,
  /\binjections?\b/i,
  /\bmg\b/i,
  /\bml\b/i,
  /\bblood pressure\b/i,
  /\bsystolic\b/i,
  /\bdiastolic\b/i,
  /\bvital signs?\b/i,
  /\bsoap notes?\b/i,
  /\bclinical notes?\b/i,
  /\bpathology\b/i,
  /\bbiopsy\b/i,
  /\bcovid\b/i,
  /\bhiv\b/i,
  /\bcancer\b/i,
  /\btumor\b/i,
];

/**
 * Sanitizes input string to prevent control characters or injection.
 */
function sanitizeVariable(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Inspects a compiled message body for accidental Protected Health Information (PHI).
 * Throws PhiViolationError if prohibited medical terminology is detected.
 */
export function assertPhiFree(message: string): void {
  for (const pattern of FORBIDDEN_PHI_PATTERNS) {
    if (pattern.test(message)) {
      throw new PhiViolationError(
        `Security Policy Violation: Outbound notification contains prohibited medical terminology (${pattern.source}). Clinical details must only be accessed via secure tokenized links.`
      );
    }
  }
}

/**
 * Compiles a notification message from event parameters.
 * Validates against PHI leakage and formatting constraints.
 */
export function compileNotificationMessage(params: NotificationTemplateParams): string {
  const templateFn = NOTIFICATION_TEMPLATES[params.eventType];
  if (!templateFn) {
    throw new Error(`Unsupported notification event type: ${params.eventType}`);
  }

  // Sanitize all variable inputs
  const sanitizedVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(params.variables)) {
    if (typeof value === 'string') {
      sanitizedVars[key] = sanitizeVariable(value);
    }
  }

  const compiled = templateFn(sanitizedVars);

  // Assert compliance with PHI rules
  assertPhiFree(compiled);

  return compiled;
}

/**
 * Calculates standard GSM-7 SMS character count and multi-part segment boundaries.
 * Standard SMS single segment: up to 160 characters.
 * Multi-part concatenated SMS: 153 characters per segment.
 */
export function calculateSmsSegments(text: string): {
  charCount: number;
  segmentCount: number;
  isSingleSegment: boolean;
} {
  const charCount = text.length;
  if (charCount <= 160) {
    return {
      charCount,
      segmentCount: 1,
      isSingleSegment: true,
    };
  }

  const segmentCount = Math.ceil(charCount / 153);
  return {
    charCount,
    segmentCount,
    isSingleSegment: false,
  };
}
