import { z } from 'zod';
import {
  InvoiceStatus,
  PaymentMethod,
  InvoiceItemType,
} from '@prisma/client';

export { InvoiceStatus, PaymentMethod, InvoiceItemType };

/**
 * Currency options supported by NEXORA.
 * Scoped to India (INR) and Nepal (NPR).
 */
export const CurrencyEnum = z.enum(['INR', 'NPR']);
export type Currency = z.infer<typeof CurrencyEnum>;

/**
 * Invoice Status Enum matching Prisma schema.
 */
export const InvoiceStatusEnum = z.enum([
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'VOID',
  'REFUNDED',
]);

/**
 * Payment Method Enum matching Prisma schema.
 */
export const PaymentMethodEnum = z.enum([
  'CASH',
  'UPI',
  'CARD',
  'NET_BANKING',
  'BANK_TRANSFER',
  'INSURANCE',
  'OTHER',
]);

/**
 * Invoice Item Type Enum matching Prisma schema.
 */
export const InvoiceItemTypeEnum = z.enum([
  'CONSULTATION',
  'PROCEDURE',
  'MEDICATION',
  'LAB',
  'MISC',
]);

/**
 * Allowed Invoice Status Transitions State Machine.
 */
export const VALID_INVOICE_STATUS_TRANSITIONS: Record<
  InvoiceStatus,
  readonly InvoiceStatus[]
> = {
  DRAFT: ['DRAFT', 'ISSUED', 'VOID'],
  ISSUED: ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'],
  PARTIALLY_PAID: ['PARTIALLY_PAID', 'PAID', 'REFUNDED'],
  PAID: ['PAID', 'REFUNDED'],
  VOID: ['VOID'],
  REFUNDED: ['REFUNDED'],
};

export function isValidInvoiceStatusTransition(
  currentStatus: InvoiceStatus,
  targetStatus: InvoiceStatus
): boolean {
  if (currentStatus === targetStatus) return true;
  return VALID_INVOICE_STATUS_TRANSITIONS[currentStatus]?.includes(targetStatus) ?? false;
}

/**
 * Allowed administrative status transitions that can be requested manually via PATCH.
 *
 * Strict financial invariants:
 * - 'PAID' and 'PARTIALLY_PAID' are strictly derived from recorded payments and cannot be assigned manually.
 * - 'REFUNDED' cannot be assigned directly without an explicit refund transaction record.
 * - 'ISSUED' can only transition to 'VOID' if unpaid with zero recorded payments.
 */
export const ALLOWED_MANUAL_STATUS_TRANSITIONS: Record<
  InvoiceStatus,
  readonly InvoiceStatus[]
> = {
  DRAFT: ['DRAFT', 'ISSUED', 'VOID'],
  ISSUED: ['ISSUED', 'VOID'],
  PARTIALLY_PAID: ['PARTIALLY_PAID'],
  PAID: ['PAID'],
  VOID: ['VOID'],
  REFUNDED: ['REFUNDED'],
};

export function isValidManualStatusTransition(
  currentStatus: InvoiceStatus,
  targetStatus: InvoiceStatus
): boolean {
  if (currentStatus === targetStatus) return true;
  return ALLOWED_MANUAL_STATUS_TRANSITIONS[currentStatus]?.includes(targetStatus) ?? false;
}

/**
 * Checks whether a number or string has at most 2 decimal places.
 * Rejects values with excess decimal precision (e.g. 10.555 or "10.555").
 */
export function hasAtMostTwoDecimalPlaces(val: number | string): boolean {
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return false;
    const str = val.toString();
    if (str.includes('e') || str.includes('E')) return false;
    const dotIndex = str.indexOf('.');
    if (dotIndex === -1) return true;
    return str.length - dotIndex - 1 <= 2;
  }
  return /^\d+(\.\d{1,2})?$/.test(val.trim());
}

/**
 * Non-negative monetary amount input validator.
 * Accepts numeric values or clean decimal strings with up to 2 decimal places.
 */
export const MonetaryAmountInputSchema = z
  .union([
    z
      .number()
      .min(0, 'Amount cannot be negative')
      .max(99999999.99, 'Amount exceeds maximum allowable limit'),
    z
      .string()
      .trim()
      .regex(
        /^\d+(\.\d{1,2})?$/,
        'Amount must be a non-negative decimal with up to 2 decimal places'
      ),
  ])
  .refine(
    (val) => {
      const num = typeof val === 'number' ? val : parseFloat(val);
      return (
        !isNaN(num) &&
        num >= 0 &&
        num <= 99999999.99 &&
        hasAtMostTwoDecimalPlaces(val)
      );
    },
    { message: 'Amount must be between 0.00 and 99,999,999.99 with at most 2 decimal places' }
  );

/**
 * Positive payment amount input validator (must be > 0).
 */
export const PositivePaymentAmountSchema = z
  .union([
    z
      .number()
      .gt(0, 'Payment amount must be greater than zero')
      .max(99999999.99, 'Payment amount exceeds maximum limit'),
    z
      .string()
      .trim()
      .regex(
        /^\d+(\.\d{1,2})?$/,
        'Payment amount must be a positive decimal with up to 2 decimal places'
      ),
  ])
  .refine(
    (val) => {
      const num = typeof val === 'number' ? val : parseFloat(val);
      return (
        !isNaN(num) &&
        num > 0 &&
        num <= 99999999.99 &&
        hasAtMostTwoDecimalPlaces(val)
      );
    },
    { message: 'Payment amount must be strictly greater than 0 with at most 2 decimal places' }
  );

/**
 * Tax rate percentage validator: 0.00% to 100.00%
 */
export const TaxRatePercentageSchema = z
  .union([
    z
      .number()
      .min(0, 'Tax rate cannot be negative')
      .max(100, 'Tax rate cannot exceed 100%'),
    z
      .string()
      .trim()
      .regex(
        /^\d+(\.\d{1,2})?$/,
        'Tax rate must be a valid percentage with up to 2 decimal places'
      ),
  ])
  .refine(
    (val) => {
      const num = typeof val === 'number' ? val : parseFloat(val);
      return (
        !isNaN(num) &&
        num >= 0 &&
        num <= 100 &&
        hasAtMostTwoDecimalPlaces(val)
      );
    },
    { message: 'Tax rate must be between 0.00% and 100.00% with at most 2 decimal places' }
  );

/**
 * Input schema for individual line items when creating or amending an invoice.
 *
 * Strict: Rejects any server-managed properties (e.g., id, invoiceId, lineTotal).
 */
export const InvoiceItemInputSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1, 'Item description is required')
      .max(255, 'Item description must not exceed 255 characters'),
    quantity: z
      .number()
      .int('Quantity must be an integer')
      .min(1, 'Quantity must be at least 1')
      .max(10000, 'Quantity cannot exceed 10,000')
      .default(1),
    unitPrice: MonetaryAmountInputSchema,
    itemType: InvoiceItemTypeEnum.default('MISC'),
  })
  .strict();

export type InvoiceItemInput = z.infer<typeof InvoiceItemInputSchema>;

/**
 * Input schema for manual invoice creation.
 *
 * Security:
 * Strictly prevents clients from supplying trusted server-controlled fields:
 * - clinicId (derived from authenticated session)
 * - invoiceNumber (derived from atomic sequence allocator)
 * - subtotal, taxAmount, totalAmount (calculated server-side via exact Decimal math)
 * - paidAmount (derived from recorded payments)
 * - createdById (derived from authenticated actor)
 * - taxLabel, taxNumber (snapshotted from clinic configuration)
 */
export const CreateInvoiceInputSchema = z
  .object({
    patientId: z
      .string()
      .trim()
      .min(1, 'Patient ID is required'),
    appointmentId: z
      .string()
      .trim()
      .optional()
      .nullable(),
    consultationId: z
      .string()
      .trim()
      .optional()
      .nullable(),
    currency: CurrencyEnum.optional(),
    discount: MonetaryAmountInputSchema.optional().default('0.00'),
    taxRate: TaxRatePercentageSchema.optional().nullable(),
    issueDate: z
      .string()
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/,
        'Issue date must be in YYYY-MM-DD or ISO 8601 format'
      )
      .optional()
      .nullable(),
    dueDate: z
      .string()
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/,
        'Due date must be in YYYY-MM-DD or ISO 8601 format'
      )
      .optional()
      .nullable(),
    notes: z
      .string()
      .trim()
      .max(2000, 'Notes must not exceed 2000 characters')
      .optional()
      .nullable(),
    items: z
      .array(InvoiceItemInputSchema)
      .min(1, 'Invoice must contain at least one line item'),
  })
  .strict();

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceInputSchema>;

/**
 * Input schema for recording a payment against an invoice.
 *
 * Security:
 * Strictly prevents clients from supplying:
 * - clinicId (derived from authenticated session)
 * - invoiceId (taken from validated route path parameter)
 * - receivedById (derived from authenticated user session)
 */
export const RecordPaymentInputSchema = z
  .object({
    amount: PositivePaymentAmountSchema,
    method: PaymentMethodEnum,
    transactionRef: z
      .string()
      .trim()
      .max(100, 'Transaction reference must not exceed 100 characters')
      .optional()
      .nullable(),
    notes: z
      .string()
      .trim()
      .max(1000, 'Payment notes must not exceed 1000 characters')
      .optional()
      .nullable(),
    receivedAt: z
      .string()
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/,
        'Received date must be in YYYY-MM-DD or ISO 8601 format'
      )
      .optional()
      .nullable(),
  })
  .strict();

export type RecordPaymentInput = z.infer<typeof RecordPaymentInputSchema>;

/**
 * Input schema for updating invoice status (e.g. issuing or voiding an invoice).
 */
export const UpdateInvoiceStatusInputSchema = z
  .object({
    status: InvoiceStatusEnum,
    reason: z
      .string()
      .trim()
      .max(500, 'Status change reason must not exceed 500 characters')
      .optional()
      .nullable(),
  })
  .strict();

export type UpdateInvoiceStatusInput = z.infer<typeof UpdateInvoiceStatusInputSchema>;

/**
 * Input schema for clinic tax settings configuration.
 */
export const ClinicTaxConfigInputSchema = z
  .object({
    taxLabel: z
      .string()
      .trim()
      .max(50, 'Tax label must not exceed 50 characters')
      .optional()
      .nullable(),
    taxNumber: z
      .string()
      .trim()
      .max(50, 'Tax registration number must not exceed 50 characters')
      .optional()
      .nullable(),
  })
  .strict();

export type ClinicTaxConfigInput = z.infer<typeof ClinicTaxConfigInputSchema>;

/**
 * Query schema for listing invoices with optional filters and pagination.
 */
export const InvoiceQuerySchema = z.object({
  patientId: z.string().trim().optional(),
  status: InvoiceStatusEnum.optional(),
  year: z.coerce.number().int().min(2000).max(2099).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type InvoiceQuery = z.infer<typeof InvoiceQuerySchema>;

/**
 * Input schema for patching an existing invoice (status transitions, notes, due date, or draft item amendments).
 *
 * Strict: Rejects any untrusted or server-controlled fields.
 */
export const PatchInvoiceInputSchema = z
  .object({
    status: InvoiceStatusEnum.optional(),
    reason: z
      .string()
      .trim()
      .max(500, 'Status change reason must not exceed 500 characters')
      .optional()
      .nullable(),
    dueDate: z
      .string()
      .trim()
      .regex(
        /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/,
        'Due date must be in YYYY-MM-DD or ISO 8601 format'
      )
      .optional()
      .nullable(),
    notes: z
      .string()
      .trim()
      .max(2000, 'Notes must not exceed 2000 characters')
      .optional()
      .nullable(),
    discount: MonetaryAmountInputSchema.optional(),
    taxRate: TaxRatePercentageSchema.optional().nullable(),
    items: z
      .array(InvoiceItemInputSchema)
      .min(1, 'At least one line item is required if updating items')
      .optional(),
  })
  .strict();

export type PatchInvoiceInput = z.infer<typeof PatchInvoiceInputSchema>;
