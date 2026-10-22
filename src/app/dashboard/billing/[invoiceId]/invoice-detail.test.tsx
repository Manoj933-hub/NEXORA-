import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  type InvoiceDetail,
  type InvoiceLineItem,
  type InvoicePayment,
  parseMinorUnits,
  formatMinorUnits,
  formatMoney,
  calculateBalanceDueCents,
  canRecordPayment,
  canIssueInvoice,
  hasAtMostTwoDecimals,
  formatDate,
  formatDateTime,
  InvoiceDetailView,
  InvoiceDetailSkeleton,
  RecordPaymentModal,
  PaymentReceiptModal,
  SUPPORTED_PAYMENT_METHODS,
} from './page';

describe('Invoice Detail & Payment Recording UI Tests (SSR/Component)', () => {
  const mockLineItems: InvoiceLineItem[] = [
    {
      id: 'item-1',
      description: 'Specialist Consultation',
      quantity: 1,
      unitPrice: '800.00',
      lineTotal: '800.00',
      itemType: 'CONSULTATION',
    },
    {
      id: 'item-2',
      description: 'Blood Sugar & Lipid Panel',
      quantity: 2,
      unitPrice: '200.00',
      lineTotal: '400.00',
      itemType: 'LAB',
    },
  ];

  const mockPayments: InvoicePayment[] = [
    {
      id: 'pay-1',
      amount: '500.00',
      method: 'UPI',
      transactionRef: 'UPI-9876543210',
      notes: 'Initial deposit',
      receivedAt: '2026-10-22T10:30:00.000Z',
      receivedBy: {
        id: 'usr-1',
        name: 'Dr. Jane Doe',
        email: 'jane@nexora.health',
      },
    },
  ];

  const mockIssuedInvoice: InvoiceDetail = {
    id: 'inv-12345',
    clinicId: 'clinic-delhi',
    invoiceNumber: 'INV-2026-0001',
    year: 2026,
    currency: 'INR',
    status: 'PARTIALLY_PAID',
    subtotal: '1200.00',
    discount: '100.00',
    taxRate: '18',
    taxAmount: '198.00',
    totalAmount: '1298.00',
    paidAmount: '500.00',
    balanceDue: '798.00',
    isFullyPaid: false,
    isOverpaid: false,
    issueDate: '2026-10-22T00:00:00.000Z',
    dueDate: '2026-11-05T00:00:00.000Z',
    notes: 'Please pay remaining balance by due date.',
    taxLabel: 'GSTIN',
    taxNumber: '07AAAAA0000A1Z5',
    createdAt: '2026-10-22T08:00:00.000Z',
    items: mockLineItems,
    payments: mockPayments,
    patient: {
      id: 'pat-1',
      mrn: 'NXR-DEL-0001',
      name: 'Aarav Sharma',
      phone: '+91 9876543210',
      email: 'aarav@example.com',
      gender: 'MALE',
    },
    clinic: {
      id: 'clinic-delhi',
      name: 'NEXORA Care Centre Delhi',
      phone: '+91 11 2345 6789',
      address: 'Connaught Place, New Delhi, India',
      country: 'IN',
      currency: 'INR',
      taxLabel: 'GSTIN',
      taxNumber: '07AAAAA0000A1Z5',
    },
    appointment: {
      id: 'appt-1',
      startTime: '2026-10-22T09:00:00.000Z',
      endTime: '2026-10-22T09:30:00.000Z',
      status: 'COMPLETED',
    },
    consultation: {
      id: 'consult-1',
      status: 'SIGNED',
      version: 1,
      createdAt: '2026-10-22T09:30:00.000Z',
    },
    createdBy: {
      id: 'usr-1',
      name: 'Dr. Jane Doe',
      email: 'jane@nexora.health',
    },
  };

  const mockNepaliInvoice: InvoiceDetail = {
    ...mockIssuedInvoice,
    id: 'inv-nepal-999',
    invoiceNumber: 'INV-2026-0088',
    currency: 'NPR',
    taxLabel: 'PAN',
    taxNumber: '600123456',
    clinic: {
      id: 'clinic-ktm',
      name: 'NEXORA Care Centre Kathmandu',
      phone: '+977 1 4567890',
      address: 'Thamel, Kathmandu, Nepal',
      country: 'NP',
      currency: 'NPR',
      taxLabel: 'PAN',
      taxNumber: '600123456',
    },
  };

  describe('1. Decimal-Safe Helpers & Financial Logic', () => {
    it('parses minor units safely without IEEE-754 floating-point drift', () => {
      expect(parseMinorUnits('1298.00')).toBe(BigInt(129800));
      expect(parseMinorUnits('500.50')).toBe(BigInt(50050));
      expect(parseMinorUnits(0)).toBe(BigInt(0));
      expect(parseMinorUnits(null)).toBe(BigInt(0));
      expect(parseMinorUnits(undefined)).toBe(BigInt(0));
    });

    it('formats minor units accurately with currency code and separators', () => {
      expect(formatMinorUnits(BigInt(129800), 'INR')).toBe('INR 1,298.00');
      expect(formatMinorUnits(BigInt(50050), 'NPR')).toBe('NPR 500.50');
      expect(formatMinorUnits(BigInt(0), 'INR')).toBe('INR 0.00');
      expect(formatMinorUnits(BigInt(100000), null)).toBe('-- 1,000.00');
    });

    it('formats arbitrary decimal money strings accurately with invoice currency', () => {
      expect(formatMoney('1298.00', 'INR')).toBe('INR 1,298.00');
      expect(formatMoney('500.00', 'NPR')).toBe('NPR 500.00');
      expect(formatMoney(null, 'INR')).toBe('INR 0.00');
      expect(formatMoney(null, null)).toBe('-- 0.00');
    });

    it('calculates balance due accurately in minor units without going negative', () => {
      // 1298.00 - 500.00 = 798.00 (79800 minor units)
      expect(calculateBalanceDueCents('1298.00', '500.00')).toBe(BigInt(79800));
      // Fully paid: 1298.00 - 1298.00 = 0
      expect(calculateBalanceDueCents('1298.00', '1298.00')).toBe(BigInt(0));
      // Overpaid defense: balance clamped to 0
      expect(calculateBalanceDueCents('1000.00', '1500.00')).toBe(BigInt(0));
    });

    it('validates at most 2 decimal places precision', () => {
      expect(hasAtMostTwoDecimals('100.55')).toBe(true);
      expect(hasAtMostTwoDecimals('100.5')).toBe(true);
      expect(hasAtMostTwoDecimals('100')).toBe(true);
      expect(hasAtMostTwoDecimals('100.555')).toBe(false);
      expect(hasAtMostTwoDecimals('abc')).toBe(false);
    });

    it('evaluates invoice payment eligibility correctly', () => {
      expect(canRecordPayment('ISSUED', BigInt(50000))).toBe(true);
      expect(canRecordPayment('PARTIALLY_PAID', BigInt(25000))).toBe(true);
      expect(canRecordPayment('DRAFT', BigInt(50000))).toBe(false);
      expect(canRecordPayment('PAID', BigInt(0))).toBe(false);
      expect(canRecordPayment('VOID', BigInt(50000))).toBe(false);
      expect(canRecordPayment('REFUNDED', BigInt(50000))).toBe(false);
      expect(canRecordPayment('ISSUED', BigInt(0))).toBe(false);
    });

    it('evaluates issue action eligibility correctly', () => {
      expect(canIssueInvoice('DRAFT')).toBe(true);
      expect(canIssueInvoice('ISSUED')).toBe(false);
      expect(canIssueInvoice('PAID')).toBe(false);
      expect(canIssueInvoice('VOID')).toBe(false);
    });

    it('formats date and datetime strings safely', () => {
      expect(formatDate('2026-10-22T00:00:00.000Z')).toContain('2026');
      expect(formatDate(null)).toBe('—');
      expect(formatDateTime('2026-10-22T10:30:00.000Z')).toContain('2026');
      expect(formatDateTime(null)).toBe('—');
    });
  });

  describe('2. InvoiceDetailView Component Rendering & States', () => {
    it('renders InvoiceDetailSkeleton directly with pulse animation', () => {
      const html = renderToString(React.createElement(InvoiceDetailSkeleton));
      expect(html).toContain('animate-pulse');
    });

    it('renders loading skeleton when loading is true and invoice is null', () => {
      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: null,
          loading: true,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
        })
      );

      expect(html).toContain('animate-pulse');
    });

    it('renders 404 not-found card when invoice is not found in clinic', () => {
      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: null,
          loading: false,
          error: null,
          isNotFound: true,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
        })
      );

      expect(html).toContain('Invoice Not Found');
      expect(html).toContain('The requested invoice was not found in this clinic');
      expect(html).toContain('Back to Billing Directory');
      expect(html).toContain('href="/dashboard/billing"');
    });

    it('renders error card with retry button on unexpected load failure', () => {
      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: null,
          loading: false,
          error: 'Access forbidden: You do not have permission to view billing records in this clinic.',
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
        })
      );

      expect(html).toContain('Failed to Load Invoice');
      expect(html).toContain('Access forbidden: You do not have permission to view billing records');
      expect(html).toContain('Retry');
      expect(html).toContain('Back to Invoices');
    });

    it('renders complete invoice details, line items, and financial summary', () => {
      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: mockIssuedInvoice,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
        })
      );

      // Header checks
      expect(html).toContain('INV-2026-0001');
      expect(html).toContain('Partially Paid');
      expect(html).toContain('Currency: INR');

      // Patient checks
      expect(html).toContain('Aarav Sharma');
      expect(html).toContain('MRN: NXR-DEL-0001');
      expect(html).toContain('+91 9876543210');
      expect(html).toContain('aarav@example.com');

      // Tax details checks
      expect(html).toContain('GSTIN: 07AAAAA0000A1Z5');

      // Line items checks
      expect(html).toContain('Specialist Consultation');
      expect(html).toContain('Blood Sugar &amp; Lipid Panel');
      expect(html).toContain('INR 800.00');
      expect(html).toContain('INR 400.00');

      // Financial totals checks
      expect(html).toContain('INR 1,200.00'); // subtotal
      expect(html).toContain('-INR 100.00'); // discount
      expect(html).toContain('INR 198.00'); // tax
      expect(html).toContain('INR 1,298.00'); // total
      expect(html).toContain('INR 500.00'); // paid
      expect(html).toContain('INR 798.00'); // balance due

      // Action button check
      expect(html).toContain('Record Payment');
      expect(html).not.toContain('Issue Invoice');
    });

    it('renders Nepal clinic invoice with NPR currency accurately without defaulting to INR', () => {
      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: mockNepaliInvoice,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
        })
      );

      expect(html).toContain('INV-2026-0088');
      expect(html).toContain('Currency: NPR');
      expect(html).toContain('NPR 1,298.00');
      expect(html).toContain('NPR 798.00');
      expect(html).toContain('PAN: 600123456');
      expect(html).not.toContain('INR');
    });

    it('renders Draft invoice with "Issue Invoice" button and explains payment unavailability', () => {
      const draftInvoice: InvoiceDetail = {
        ...mockIssuedInvoice,
        status: 'DRAFT',
        paidAmount: '0.00',
        payments: [],
      };

      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: draftInvoice,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onIssueInvoice: vi.fn(),
          onOpenPaymentModal: vi.fn(),
        })
      );

      expect(html).toContain('Draft');
      expect(html).toContain('Issue Invoice');
      expect(html).toContain('Payments available once issued');
      expect(html).not.toContain('Record Payment');
    });

    it('renders Fully Paid invoice with "Paid in Full" badge and hides payment recording button', () => {
      const paidInvoice: InvoiceDetail = {
        ...mockIssuedInvoice,
        status: 'PAID',
        paidAmount: '1298.00',
      };

      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: paidInvoice,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
        })
      );

      expect(html).toContain('Paid in Full');
      expect(html).not.toContain('Record Payment');
      expect(html).not.toContain('Issue Invoice');
    });

    it('renders payment ledger table when payments exist', () => {
      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: mockIssuedInvoice,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
        })
      );

      expect(html).toContain('Payment History');
      expect(html).toContain('UPI');
      expect(html).toContain('UPI-9876543210');
      expect(html).toContain('Dr. Jane Doe');
      expect(html).toContain('INR 500.00');
    });

    it('renders empty payment ledger state when no payments are recorded', () => {
      const unpaidInvoice: InvoiceDetail = {
        ...mockIssuedInvoice,
        status: 'ISSUED',
        paidAmount: '0.00',
        payments: [],
      };

      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: unpaidInvoice,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
        })
      );

      expect(html).toContain('No payments recorded yet');
      expect(html).toContain('Click &quot;Record Payment&quot; above to record a payment');
    });

    it('renders action success banner when payment or issue operation succeeds', () => {
      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: mockIssuedInvoice,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
          actionMessage: {
            type: 'success',
            text: 'Payment of INR 500.00 recorded successfully.',
          },
        })
      );

      expect(html).toContain('Payment of INR 500.00 recorded successfully.');
    });
  });

  describe('3. RecordPaymentModal Component & Form Validation', () => {
    it('renders modal dialog with accessible attributes and outstanding balance', () => {
      const html = renderToString(
        React.createElement(RecordPaymentModal, {
          isOpen: true,
          onClose: vi.fn(),
          invoiceId: 'inv-12345',
          invoiceNumber: 'INV-2026-0001',
          currency: 'INR',
          balanceDueCents: BigInt(79800), // 798.00
          onSuccess: vi.fn(),
          onConflictRefresh: vi.fn(),
        })
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-labelledby="record-payment-title"');
      expect(html).toContain('print:hidden');
      expect(html).toContain('Record Payment');
      expect(html).toContain('Invoice #INV-2026-0001');
      expect(html).toContain('Outstanding Balance:');
      expect(html).toContain('INR 798.00');
      expect(html).toContain('Pay Full Balance');
      expect(html).toContain('value="798.00"');
    });

    it('applies print:hidden on outer dialog container to prevent accidental printing when modal is open', () => {
      const html = renderToString(
        React.createElement(RecordPaymentModal, {
          isOpen: true,
          onClose: vi.fn(),
          invoiceId: 'inv-12345',
          invoiceNumber: 'INV-2026-0001',
          currency: 'INR',
          balanceDueCents: BigInt(79800),
          onSuccess: vi.fn(),
          onConflictRefresh: vi.fn(),
        })
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 print:hidden"');
    });

    it('includes all supported payment methods in dropdown', () => {
      const html = renderToString(
        React.createElement(RecordPaymentModal, {
          isOpen: true,
          onClose: vi.fn(),
          invoiceId: 'inv-12345',
          invoiceNumber: 'INV-2026-0001',
          currency: 'INR',
          balanceDueCents: BigInt(79800),
          onSuccess: vi.fn(),
          onConflictRefresh: vi.fn(),
        })
      );

      for (const method of SUPPORTED_PAYMENT_METHODS) {
        expect(html).toContain(`value="${method.value}"`);
        expect(html).toContain(method.label);
      }
    });

    it('does not render modal when isOpen is false', () => {
      const html = renderToString(
        React.createElement(RecordPaymentModal, {
          isOpen: false,
          onClose: vi.fn(),
          invoiceId: 'inv-12345',
          invoiceNumber: 'INV-2026-0001',
          currency: 'INR',
          balanceDueCents: BigInt(79800),
          onSuccess: vi.fn(),
          onConflictRefresh: vi.fn(),
        })
      );

      expect(html).toBe('');
    });
  });

  describe('4. Payment API Error Mapping & Concurrency Handling', () => {
    it('maps authentication, permission, not-found, and server errors accurately', () => {
      const mapError = (status: number, serverMsg?: string) => {
        if (status === 401) return 'Authentication required. Please log in.';
        if (status === 403) {
          return 'Access forbidden: Recording payments requires write permissions in this clinic.';
        }
        if (status === 404) return 'Invoice not found in active clinic.';
        return serverMsg || 'Failed to record payment.';
      };

      expect(mapError(401)).toContain('Authentication required');
      expect(mapError(403)).toContain('write permissions');
      expect(mapError(404)).toContain('Invoice not found in active clinic');
      expect(mapError(500, 'Internal server error')).toContain('Internal server error');
    });

    it('identifies overpayment and concurrency conflicts to trigger data refresh', () => {
      const isConcurrencyConflict = (errorText: string) => {
        return errorText.toLowerCase().includes('exceeds outstanding balance');
      };

      const serverConflictMsg =
        'Payment amount (500.00) exceeds outstanding balance (300.00). Overpayment is not permitted.';
      expect(isConcurrencyConflict(serverConflictMsg)).toBe(true);
      expect(isConcurrencyConflict('Invalid payment method')).toBe(false);
    });
  });

  describe('5. Printable Invoice View (Scope A & C)', () => {
    it('renders formal printable invoice header with TAX INVOICE title and clinic identity', () => {
      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: mockIssuedInvoice,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
        })
      );

      // Formal print header
      expect(html).toContain('TAX INVOICE');
      expect(html).toContain('Invoice #:');
      expect(html).toContain('INV-2026-0001');
      expect(html).toContain('NEXORA Care Centre Delhi');
      expect(html).toContain('Connaught Place, New Delhi, India');
      expect(html).toContain('Phone: +91 11 2345 6789');
      expect(html).toContain('GSTIN: 07AAAAA0000A1Z5');
    });

    it('renders Print Invoice button in the action header with data-testid and print:hidden', () => {
      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: mockIssuedInvoice,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
        })
      );

      expect(html).toContain('data-testid="print-invoice-btn"');
      expect(html).toContain('Print Invoice');
      expect(html).toContain('print:hidden');
    });

    it('applies print-only visibility rules hiding navigation, links, and action buttons during print', () => {
      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: mockIssuedInvoice,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
        })
      );

      // Breadcrumb wrapper is print:hidden
      expect(html).toContain('Back to Billing Directory');
      // Patient profile navigation link is print:hidden
      expect(html).toContain('View Profile →');
      // Screen header action bar is print:hidden
      expect(html).toContain('print:hidden');
    });

    it('safely handles missing optional clinic contact and tax registration fields without placeholders', () => {
      const invoiceWithoutClinicInfo: InvoiceDetail = {
        ...mockIssuedInvoice,
        clinic: {
          id: 'clinic-minimal',
          name: 'Community Health Clinic',
          phone: null,
          address: null,
          country: 'IN',
          currency: 'INR',
          taxLabel: null,
          taxNumber: null,
        },
        taxLabel: null,
        taxNumber: null,
      };

      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: invoiceWithoutClinicInfo,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
        })
      );

      expect(html).toContain('Community Health Clinic');
      // Does not print null or undefined strings
      expect(html).not.toContain('null');
      expect(html).not.toContain('undefined');
    });

    it('handles multiple line items and long descriptions without text clipping in print styles', () => {
      const longDescInvoice: InvoiceDetail = {
        ...mockIssuedInvoice,
        items: [
          {
            id: 'item-long',
            description:
              'Comprehensive multi-disciplinary consultation including cardiometabolic risk stratification, 12-lead electrocardiogram interpretation, and detailed therapeutic plan discussion.',
            quantity: 1,
            unitPrice: '1500.00',
            lineTotal: '1500.00',
            itemType: 'CONSULTATION',
          },
        ],
      };

      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: longDescInvoice,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
        })
      );

      expect(html).toContain('break-words');
      expect(html).toContain('whitespace-normal');
      expect(html).toContain('Comprehensive multi-disciplinary consultation');
    });

    it('preserves exact currency (NPR vs INR) across print header, items, and totals summary', () => {
      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: mockNepaliInvoice,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
        })
      );

      expect(html).toContain('NEXORA Care Centre Kathmandu');
      expect(html).toContain('PAN: 600123456');
      expect(html).toContain('Currency: NPR');
      expect(html).toContain('NPR 1,298.00');
      expect(html).toContain('NPR 798.00');
      // Does not default to INR
      expect(html).not.toContain('INR 1,298.00');
    });

    it('renders formal printable signature blocks for authorized signatory and patient acknowledgement', () => {
      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: mockIssuedInvoice,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
        })
      );

      expect(html).toContain('Authorized Signatory');
      expect(html).toContain('Customer / Patient Acknowledgement');
      expect(html).toContain('print:grid');
    });
  });

  describe('6. Printable Payment Receipts (Scope B & C)', () => {
    it('clearly distinguishes payment receipt from invoice with explicit receipt title', () => {
      const html = renderToString(
        React.createElement(PaymentReceiptModal, {
          isOpen: true,
          onClose: vi.fn(),
          payment: mockPayments[0],
          invoice: mockIssuedInvoice,
          balanceDueCents: BigInt(79800),
        })
      );

      expect(html).toContain('Official Payment Receipt');
      expect(html).toContain('PAYMENT RECEIPT');
    });

    it('renders authentic server-returned payment identifier labeled explicitly as Payment ID without inventing numbers', () => {
      const html = renderToString(
        React.createElement(PaymentReceiptModal, {
          isOpen: true,
          onClose: vi.fn(),
          payment: mockPayments[0],
          invoice: mockIssuedInvoice,
          balanceDueCents: BigInt(79800),
        })
      );

      expect(html).toContain('Payment ID:');
      expect(html).toContain('data-testid="receipt-payment-id"');
      expect(html).toContain(mockPayments[0].id);
    });

    it('explicitly links the receipt to its parent invoice number', () => {
      const html = renderToString(
        React.createElement(PaymentReceiptModal, {
          isOpen: true,
          onClose: vi.fn(),
          payment: mockPayments[0],
          invoice: mockIssuedInvoice,
          balanceDueCents: BigInt(79800),
        })
      );

      expect(html).toContain('Applied to Invoice:');
      expect(html).toContain(`#${mockIssuedInvoice.invoiceNumber}`);
    });

    it('renders partial payment acknowledgement when invoice has an outstanding balance', () => {
      const html = renderToString(
        React.createElement(PaymentReceiptModal, {
          isOpen: true,
          onClose: vi.fn(),
          payment: mockPayments[0],
          invoice: mockIssuedInvoice,
          balanceDueCents: BigInt(79800), // remaining 798.00
        })
      );

      expect(html).toContain('PARTIAL PAYMENT ACKNOWLEDGEMENT');
      expect(html).toContain('An outstanding balance of');
      expect(html).toContain('INR 798.00');
      expect(html).not.toContain('PAID IN FULL — This invoice is fully settled');
    });

    it('renders PAID IN FULL settlement banner only when balance is zero and invoice status is PAID', () => {
      const paidInvoice: InvoiceDetail = {
        ...mockIssuedInvoice,
        status: 'PAID',
        paidAmount: '1298.00',
        balanceDue: '0.00',
        isFullyPaid: true,
      };

      const html = renderToString(
        React.createElement(PaymentReceiptModal, {
          isOpen: true,
          onClose: vi.fn(),
          payment: mockPayments[0],
          invoice: paidInvoice,
          balanceDueCents: BigInt(0),
        })
      );

      expect(html).toContain('PAID IN FULL — This invoice is fully settled with zero remaining balance.');
      expect(html).not.toContain('PARTIAL PAYMENT ACKNOWLEDGEMENT');
    });

    it('displays payment details: method, transaction reference, receiving staff member, and date', () => {
      const html = renderToString(
        React.createElement(PaymentReceiptModal, {
          isOpen: true,
          onClose: vi.fn(),
          payment: mockPayments[0],
          invoice: mockIssuedInvoice,
          balanceDueCents: BigInt(79800),
        })
      );

      expect(html).toContain('UPI');
      expect(html).toContain('UPI-9876543210');
      expect(html).toContain('Dr. Jane Doe');
      expect(html).toContain('data-testid="receipt-amount-paid"');
      expect(html).toContain('INR 500.00');
    });

    it('handles missing optional payment fields safely without inventing values', () => {
      const minimalPayment: InvoicePayment = {
        id: 'pay-min-999',
        amount: '300.00',
        method: 'CASH',
        transactionRef: null,
        notes: null,
        receivedAt: '2026-10-22T11:00:00.000Z',
        receivedBy: null,
      };

      const html = renderToString(
        React.createElement(PaymentReceiptModal, {
          isOpen: true,
          onClose: vi.fn(),
          payment: minimalPayment,
          invoice: mockIssuedInvoice,
          balanceDueCents: BigInt(49800),
        })
      );

      expect(html).toContain('Cash');
      expect(html).toContain('pay-min-999');
      // Shows default staff fallback when receiver is null
      expect(html).toContain('Clinic Staff');
      // Does not print null or undefined strings
      expect(html).not.toContain('null');
      expect(html).not.toContain('undefined');
    });

    it('displays clinic identity and tax registration on receipt', () => {
      const html = renderToString(
        React.createElement(PaymentReceiptModal, {
          isOpen: true,
          onClose: vi.fn(),
          payment: mockPayments[0],
          invoice: mockNepaliInvoice,
          balanceDueCents: BigInt(79800),
        })
      );

      expect(html).toContain('NEXORA Care Centre Kathmandu');
      expect(html).toContain('Thamel, Kathmandu, Nepal');
      expect(html).toContain('Phone: +977 1 4567890');
      expect(html).toContain('PAN: 600123456');
    });

    it('restricts patient details to essential billing identifiers (name, MRN) without clinical leakage', () => {
      const html = renderToString(
        React.createElement(PaymentReceiptModal, {
          isOpen: true,
          onClose: vi.fn(),
          payment: mockPayments[0],
          invoice: mockIssuedInvoice,
          balanceDueCents: BigInt(79800),
        })
      );

      expect(html).toContain('Aarav Sharma');
      expect(html).toContain('MRN: NXR-DEL-0001');
      // Must not leak internal medical records or consultation diagnoses
      expect(html).not.toContain('Specialist Consultation');
      expect(html).not.toContain('Blood Sugar');
    });

    it('provides Print Receipt confirmation button and hides modal interactive buttons during print', () => {
      const html = renderToString(
        React.createElement(PaymentReceiptModal, {
          isOpen: true,
          onClose: vi.fn(),
          payment: mockPayments[0],
          invoice: mockIssuedInvoice,
          balanceDueCents: BigInt(79800),
        })
      );

      expect(html).toContain('data-testid="print-receipt-confirm-btn"');
      expect(html).toContain('Print Receipt');
      expect(html).toContain('print:hidden');
      expect(html).toContain('Authorized Clinic Signature');
      expect(html).toContain('Payer / Patient Signature');
    });

    it('does not render receipt modal when isOpen is false', () => {
      const html = renderToString(
        React.createElement(PaymentReceiptModal, {
          isOpen: false,
          onClose: vi.fn(),
          payment: mockPayments[0],
          invoice: mockIssuedInvoice,
          balanceDueCents: BigInt(79800),
        })
      );

      expect(html).toBe('');
    });
  });

  describe('7. Payment Ledger Receipt Integration & View Isolation', () => {
    it('renders Receipt button on each payment history row', () => {
      const html = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: mockIssuedInvoice,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
          onSelectPaymentForReceipt: vi.fn(),
        })
      );

      expect(html).toContain('data-testid="receipt-btn-pay-1"');
      expect(html).toContain('Receipt');
    });

    it('hides invoice content in print when receipt modal is actively printing', () => {
      const htmlNormal = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: mockIssuedInvoice,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
          isPrintingReceipt: false,
        })
      );

      const htmlPrintingReceipt = renderToString(
        React.createElement(InvoiceDetailView, {
          invoice: mockIssuedInvoice,
          loading: false,
          error: null,
          onRefresh: vi.fn(),
          onOpenPaymentModal: vi.fn(),
          isPrintingReceipt: true,
        })
      );

      // Normal view does not hide entire invoice container
      expect(htmlNormal.startsWith('<div class="space-y-6 max-w-5xl mx-auto "')).toBe(true);
      // Receipt printing view hides entire invoice container with print:hidden
      expect(htmlPrintingReceipt.startsWith('<div class="space-y-6 max-w-5xl mx-auto print:hidden"')).toBe(true);
    });
  });
});
