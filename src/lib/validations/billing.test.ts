import { describe, it, expect } from 'vitest';
import {
  CreateInvoiceInputSchema,
  InvoiceItemInputSchema,
  RecordPaymentInputSchema,
  UpdateInvoiceStatusInputSchema,
  ClinicTaxConfigInputSchema,
  isValidInvoiceStatusTransition,
  isValidManualStatusTransition,
} from './billing';

describe('Billing Validation Schemas', () => {
  describe('CreateInvoiceInputSchema', () => {
    const validBaseInput = {
      patientId: 'patient-uuid-123',
      currency: 'INR' as const,
      discount: '50.00',
      taxRate: '18.00',
      notes: 'Consultation and medication',
      items: [
        {
          description: 'Consultation Fee',
          quantity: 1,
          unitPrice: '500.00',
          itemType: 'CONSULTATION' as const,
        },
      ],
    };

    it('validates a complete, valid invoice creation payload', () => {
      const result = CreateInvoiceInputSchema.safeParse(validBaseInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.patientId).toBe('patient-uuid-123');
        expect(result.data.currency).toBe('INR');
        expect(result.data.items).toHaveLength(1);
      }
    });

    it('accepts NPR currency and optional appointment/consultation links', () => {
      const input = {
        ...validBaseInput,
        currency: 'NPR' as const,
        appointmentId: 'appointment-456',
        consultationId: 'consultation-789',
      };
      const result = CreateInvoiceInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects unsupported currencies like USD or EUR', () => {
      const input = {
        ...validBaseInput,
        currency: 'USD',
      };
      const result = CreateInvoiceInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects payload when items array is empty', () => {
      const input = {
        ...validBaseInput,
        items: [],
      };
      const result = CreateInvoiceInputSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toMatch(/at least one line item/);
      }
    });

    it('STRICTLY rejects client-controlled trusted fields: clinicId', () => {
      const maliciousInput = {
        ...validBaseInput,
        clinicId: 'attacker-clinic-id',
      };
      const result = CreateInvoiceInputSchema.safeParse(maliciousInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues[0];
        // @ts-expect-error Zod unrecognized_keys has keys property
        const hasKey = issue.keys?.includes('clinicId') || issue.message.includes('clinicId');
        expect(hasKey).toBe(true);
      }
    });

    it('STRICTLY rejects client-controlled trusted fields: invoiceNumber', () => {
      const maliciousInput = {
        ...validBaseInput,
        invoiceNumber: 'INV-2026-9999',
      };
      const result = CreateInvoiceInputSchema.safeParse(maliciousInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues[0];
        // @ts-expect-error Zod unrecognized_keys has keys property
        const hasKey = issue.keys?.includes('invoiceNumber') || issue.message.includes('invoiceNumber');
        expect(hasKey).toBe(true);
      }
    });

    it('STRICTLY rejects client-controlled trusted fields: paidAmount and status', () => {
      const maliciousInput = {
        ...validBaseInput,
        paidAmount: '1000.00',
        status: 'PAID',
      };
      const result = CreateInvoiceInputSchema.safeParse(maliciousInput);
      expect(result.success).toBe(false);
    });

    it('STRICTLY rejects client-controlled derived financial totals (subtotal, taxAmount, totalAmount)', () => {
      const maliciousInput = {
        ...validBaseInput,
        subtotal: '100.00',
        taxAmount: '0.00',
        totalAmount: '100.00',
      };
      const result = CreateInvoiceInputSchema.safeParse(maliciousInput);
      expect(result.success).toBe(false);
    });

    it('STRICTLY rejects client-controlled clinic tax snapshots (taxLabel, taxNumber)', () => {
      const maliciousInput = {
        ...validBaseInput,
        taxLabel: 'GSTIN',
        taxNumber: 'FAKE_GST_123',
      };
      const result = CreateInvoiceInputSchema.safeParse(maliciousInput);
      expect(result.success).toBe(false);
    });

    it('rejects negative discount', () => {
      const input = {
        ...validBaseInput,
        discount: '-10.00',
      };
      const result = CreateInvoiceInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid tax rate (> 100 or negative)', () => {
      expect(
        CreateInvoiceInputSchema.safeParse({ ...validBaseInput, taxRate: '105.00' }).success
      ).toBe(false);
      expect(
        CreateInvoiceInputSchema.safeParse({ ...validBaseInput, taxRate: '-5.00' }).success
      ).toBe(false);
    });
  });

  describe('InvoiceItemInputSchema', () => {
    it('validates a valid line item', () => {
      const item = {
        description: 'Amoxicillin 500mg',
        quantity: 2,
        unitPrice: '120.50',
        itemType: 'MEDICATION' as const,
      };
      const result = InvoiceItemInputSchema.safeParse(item);
      expect(result.success).toBe(true);
    });

    it('rejects item without description or with empty description', () => {
      const item = {
        description: '   ',
        quantity: 1,
        unitPrice: '100.00',
      };
      const result = InvoiceItemInputSchema.safeParse(item);
      expect(result.success).toBe(false);
    });

    it('rejects invalid quantity (zero, negative, or non-integer)', () => {
      expect(
        InvoiceItemInputSchema.safeParse({
          description: 'Test',
          quantity: 0,
          unitPrice: '10.00',
        }).success
      ).toBe(false);

      expect(
        InvoiceItemInputSchema.safeParse({
          description: 'Test',
          quantity: -1,
          unitPrice: '10.00',
        }).success
      ).toBe(false);

      expect(
        InvoiceItemInputSchema.safeParse({
          description: 'Test',
          quantity: 1.5,
          unitPrice: '10.00',
        }).success
      ).toBe(false);
    });

    it('rejects negative unit price', () => {
      const item = {
        description: 'Test',
        quantity: 1,
        unitPrice: '-100.00',
      };
      const result = InvoiceItemInputSchema.safeParse(item);
      expect(result.success).toBe(false);
    });

    it('STRICTLY rejects injected server-computed fields like lineTotal or invoiceId', () => {
      const item = {
        description: 'Test',
        quantity: 1,
        unitPrice: '100.00',
        lineTotal: '100.00',
        invoiceId: 'inv-123',
      };
      const result = InvoiceItemInputSchema.safeParse(item);
      expect(result.success).toBe(false);
    });
  });

  describe('RecordPaymentInputSchema', () => {
    it('validates a valid payment payload (UPI/CASH/CARD)', () => {
      const payload = {
        amount: '500.00',
        method: 'UPI' as const,
        transactionRef: 'UPI-REF-998877',
        notes: 'Paid via GooglePay',
      };
      const result = RecordPaymentInputSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects payment amount <= 0', () => {
      expect(
        RecordPaymentInputSchema.safeParse({
          amount: '0.00',
          method: 'CASH',
        }).success
      ).toBe(false);

      expect(
        RecordPaymentInputSchema.safeParse({
          amount: '-50.00',
          method: 'CASH',
        }).success
      ).toBe(false);
    });

    it('rejects invalid payment method', () => {
      const result = RecordPaymentInputSchema.safeParse({
        amount: '100.00',
        method: 'BITCOIN',
      });
      expect(result.success).toBe(false);
    });

    it('STRICTLY rejects client-controlled fields: clinicId, invoiceId, receivedById', () => {
      const malicious = {
        amount: '100.00',
        method: 'CASH' as const,
        clinicId: 'injected-clinic',
        invoiceId: 'injected-invoice',
        receivedById: 'injected-user',
      };
      const result = RecordPaymentInputSchema.safeParse(malicious);
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateInvoiceStatusInputSchema', () => {
    it('validates valid status transitions input', () => {
      expect(
        UpdateInvoiceStatusInputSchema.safeParse({
          status: 'ISSUED',
          reason: 'Authorized for billing',
        }).success
      ).toBe(true);

      expect(
        UpdateInvoiceStatusInputSchema.safeParse({
          status: 'VOID',
          reason: 'Duplicate entry',
        }).success
      ).toBe(true);
    });

    it('rejects unrecognized status', () => {
      expect(
        UpdateInvoiceStatusInputSchema.safeParse({
          status: 'PENDING_APPROVAL',
        }).success
      ).toBe(false);
    });
  });

  describe('ClinicTaxConfigInputSchema', () => {
    it('validates clinic tax configuration', () => {
      const result = ClinicTaxConfigInputSchema.safeParse({
        taxLabel: 'GSTIN',
        taxNumber: '27AAPFU0939F1ZV',
      });
      expect(result.success).toBe(true);
    });

    it('accepts null or omitted tax configuration', () => {
      expect(ClinicTaxConfigInputSchema.safeParse({}).success).toBe(true);
      expect(
        ClinicTaxConfigInputSchema.safeParse({
          taxLabel: null,
          taxNumber: null,
        }).success
      ).toBe(true);
    });
  });

  describe('isValidInvoiceStatusTransition', () => {
    it('allows valid progressive transitions', () => {
      expect(isValidInvoiceStatusTransition('DRAFT', 'ISSUED')).toBe(true);
      expect(isValidInvoiceStatusTransition('DRAFT', 'VOID')).toBe(true);
      expect(isValidInvoiceStatusTransition('ISSUED', 'PARTIALLY_PAID')).toBe(true);
      expect(isValidInvoiceStatusTransition('ISSUED', 'PAID')).toBe(true);
      expect(isValidInvoiceStatusTransition('ISSUED', 'VOID')).toBe(true);
      expect(isValidInvoiceStatusTransition('PARTIALLY_PAID', 'PAID')).toBe(true);
      expect(isValidInvoiceStatusTransition('PAID', 'REFUNDED')).toBe(true);
    });

    it('allows idempotent transitions (same status to same status)', () => {
      expect(isValidInvoiceStatusTransition('DRAFT', 'DRAFT')).toBe(true);
      expect(isValidInvoiceStatusTransition('PAID', 'PAID')).toBe(true);
    });

    it('disallows invalid backwards or terminal transitions', () => {
      expect(isValidInvoiceStatusTransition('VOID', 'PAID')).toBe(false);
      expect(isValidInvoiceStatusTransition('VOID', 'ISSUED')).toBe(false);
      expect(isValidInvoiceStatusTransition('REFUNDED', 'PAID')).toBe(false);
      expect(isValidInvoiceStatusTransition('PAID', 'DRAFT')).toBe(false);
      expect(isValidInvoiceStatusTransition('PAID', 'ISSUED')).toBe(false);
    });
  });

  describe('isValidManualStatusTransition (Administrative PATCH restrictions)', () => {
    it('allows permitted administrative transitions', () => {
      expect(isValidManualStatusTransition('DRAFT', 'ISSUED')).toBe(true);
      expect(isValidManualStatusTransition('DRAFT', 'VOID')).toBe(true);
      expect(isValidManualStatusTransition('ISSUED', 'VOID')).toBe(true);
      expect(isValidManualStatusTransition('DRAFT', 'DRAFT')).toBe(true);
      expect(isValidManualStatusTransition('ISSUED', 'ISSUED')).toBe(true);
    });

    it('PROHIBITS manual assignment of payment-derived or refund statuses', () => {
      expect(isValidManualStatusTransition('ISSUED', 'PAID')).toBe(false);
      expect(isValidManualStatusTransition('ISSUED', 'PARTIALLY_PAID')).toBe(false);
      expect(isValidManualStatusTransition('DRAFT', 'PAID')).toBe(false);
      expect(isValidManualStatusTransition('PARTIALLY_PAID', 'PAID')).toBe(false);
      expect(isValidManualStatusTransition('PAID', 'REFUNDED')).toBe(false);
      expect(isValidManualStatusTransition('PARTIALLY_PAID', 'REFUNDED')).toBe(false);
    });

    it('disallows backwards transitions from terminal states', () => {
      expect(isValidManualStatusTransition('VOID', 'DRAFT')).toBe(false);
      expect(isValidManualStatusTransition('VOID', 'ISSUED')).toBe(false);
      expect(isValidManualStatusTransition('REFUNDED', 'PAID')).toBe(false);
    });
  });

  describe('Monetary Precision and Decimal Boundary Validation', () => {
    it('rejects values with more than 2 decimal places for both numbers and strings', () => {
      // RecordPaymentInputSchema amount precision
      expect(RecordPaymentInputSchema.safeParse({ amount: 10.555, method: 'CASH' }).success).toBe(false);
      expect(RecordPaymentInputSchema.safeParse({ amount: '10.555', method: 'CASH' }).success).toBe(false);
      expect(RecordPaymentInputSchema.safeParse({ amount: 0.001, method: 'CASH' }).success).toBe(false);
      expect(RecordPaymentInputSchema.safeParse({ amount: '0.001', method: 'CASH' }).success).toBe(false);

      // Line item unitPrice precision
      expect(
        InvoiceItemInputSchema.safeParse({
          description: 'Precision Item',
          quantity: 1,
          unitPrice: 10.555,
        }).success
      ).toBe(false);
      expect(
        InvoiceItemInputSchema.safeParse({
          description: 'Precision Item',
          quantity: 1,
          unitPrice: '10.555',
        }).success
      ).toBe(false);
    });

    it('accepts valid monetary values with at most 2 decimal places', () => {
      expect(RecordPaymentInputSchema.safeParse({ amount: 10.55, method: 'CASH' }).success).toBe(true);
      expect(RecordPaymentInputSchema.safeParse({ amount: '10.55', method: 'CASH' }).success).toBe(true);
      expect(RecordPaymentInputSchema.safeParse({ amount: 10, method: 'CASH' }).success).toBe(true);
      expect(RecordPaymentInputSchema.safeParse({ amount: '10', method: 'CASH' }).success).toBe(true);
      expect(RecordPaymentInputSchema.safeParse({ amount: '10.5', method: 'CASH' }).success).toBe(true);
      expect(RecordPaymentInputSchema.safeParse({ amount: 0.01, method: 'CASH' }).success).toBe(true);
      expect(RecordPaymentInputSchema.safeParse({ amount: '0.01', method: 'CASH' }).success).toBe(true);

      expect(
        InvoiceItemInputSchema.safeParse({
          description: 'Precision Item',
          quantity: 1,
          unitPrice: 10.55,
        }).success
      ).toBe(true);
      expect(
        InvoiceItemInputSchema.safeParse({
          description: 'Precision Item',
          quantity: 1,
          unitPrice: '10.55',
        }).success
      ).toBe(true);
    });
  });
});
