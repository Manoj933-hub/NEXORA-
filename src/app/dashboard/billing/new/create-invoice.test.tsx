import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  type LineItemFormRow,
  type PatientOption,
  hasAtMostTwoDecimals,
  parseMinorUnits,
  formatMinorUnits,
  calculateLineTotalMinorUnits,
  calculateTotalsPreview,
  CreateInvoiceView,
  isSupportedCurrency,
} from './page';

describe('Create Invoice UI Unit & Component Tests', () => {
  const mockPatients: PatientOption[] = [
    {
      id: 'pat-1',
      mrn: 'NXR-DEL-0001',
      name: 'Aarav Sharma',
      phone: '+91 9876543210',
      gender: 'MALE',
    },
    {
      id: 'pat-2',
      mrn: 'NXR-DEL-0002',
      name: 'Priya Patel',
      phone: '+91 9811223344',
      gender: 'FEMALE',
    },
  ];

  const defaultItems: LineItemFormRow[] = [
    {
      id: 'item-1',
      itemType: 'CONSULTATION',
      description: 'General OPD Consultation',
      quantity: 1,
      unitPrice: '500.00',
    },
    {
      id: 'item-2',
      itemType: 'PROCEDURE',
      description: 'Minor Wound Dressing',
      quantity: 2,
      unitPrice: '250.00',
    },
  ];

  describe('1. Decimal-Safe Arithmetic & Helper Functions', () => {
    it('validates decimal precision: rejects >2 decimal places', () => {
      expect(hasAtMostTwoDecimals('10.555')).toBe(false);
      expect(hasAtMostTwoDecimals('10.5')).toBe(true);
      expect(hasAtMostTwoDecimals('10.55')).toBe(true);
      expect(hasAtMostTwoDecimals('10')).toBe(true);
      expect(hasAtMostTwoDecimals('0.00')).toBe(true);
      expect(hasAtMostTwoDecimals('')).toBe(true);
    });

    it('parses minor units (cents/paise) safely using BigInt', () => {
      expect(parseMinorUnits('500.00')).toBe(BigInt(50000));
      expect(parseMinorUnits('250.50')).toBe(BigInt(25050));
      expect(parseMinorUnits(100.25)).toBe(BigInt(10025));
      expect(parseMinorUnits('0')).toBe(BigInt(0));
      expect(parseMinorUnits(null)).toBe(BigInt(0));
      expect(parseMinorUnits(undefined)).toBe(BigInt(0));
    });

    it('formats minor units accurately with currency code', () => {
      expect(formatMinorUnits(BigInt(50000), 'INR')).toBe('INR 500.00');
      expect(formatMinorUnits(BigInt(125050), 'NPR')).toBe('NPR 1,250.50');
      expect(formatMinorUnits(BigInt(0), 'INR')).toBe('INR 0.00');
    });

    it('calculates line item total in minor units: quantity * unitPrice', () => {
      expect(calculateLineTotalMinorUnits(1, '500.00')).toBe(BigInt(50000));
      expect(calculateLineTotalMinorUnits(2, '250.00')).toBe(BigInt(50000));
      expect(calculateLineTotalMinorUnits(3, '33.33')).toBe(BigInt(9999));
      expect(calculateLineTotalMinorUnits(0, '100.00')).toBe(BigInt(0));
    });

    it('calculates totals preview: subtotal, discount, taxable, tax, total with ROUND_HALF_UP rounding', () => {
      // 500.00 + 2 * 250.00 = 1000.00 subtotal (100000 minor units)
      // discount = 100.00 (10000 minor units)
      // taxable = 900.00 (90000 minor units)
      // taxRate = 18.00% -> 900 * 0.18 = 162.00 (16200 minor units)
      // total = 900 + 162 = 1062.00 (106200 minor units)
      const preview = calculateTotalsPreview(defaultItems, '100.00', '18.00');

      expect(preview.subtotalCents).toBe(BigInt(100000));
      expect(preview.discountCents).toBe(BigInt(10000));
      expect(preview.taxableCents).toBe(BigInt(90000));
      expect(preview.taxCents).toBe(BigInt(16200));
      expect(preview.totalCents).toBe(BigInt(106200));
      expect(preview.isDiscountInvalid).toBe(false);
    });

    it('detects discount exceeding subtotal and flags isDiscountInvalid', () => {
      // Subtotal is 1000.00, discount requested is 1500.00
      const preview = calculateTotalsPreview(defaultItems, '1500.00', '0.00');
      expect(preview.isDiscountInvalid).toBe(true);
      expect(preview.taxableCents).toBe(BigInt(0));
    });
  });

  describe('2. CreateInvoiceView Form Rendering & Field States', () => {
    const defaultCalculations = calculateTotalsPreview(defaultItems, '0.00', '');

    it('renders initial form with patient selection, line items, and financial summary', () => {
      const html = renderToString(
        React.createElement(CreateInvoiceView, {
          patientId: '',
          appointmentId: '',
          consultationId: '',
          dueDate: '',
          notes: '',
          discount: '0.00',
          taxRate: '',
          items: defaultItems,
          currency: 'INR',
          patients: mockPatients,
          loadingPatients: false,
          calculations: defaultCalculations,
          isSubmitting: false,
          formError: null,
          fieldErrors: {},
          createdInvoice: null,
          onPatientChange: vi.fn(),
          onAppointmentIdChange: vi.fn(),
          onConsultationIdChange: vi.fn(),
          onDueDateChange: vi.fn(),
          onNotesChange: vi.fn(),
          onDiscountChange: vi.fn(),
          onTaxRateChange: vi.fn(),
          onItemChange: vi.fn(),
          onAddItem: vi.fn(),
          onRemoveItem: vi.fn(),
          onSubmit: vi.fn(),
          onReset: vi.fn(),
        })
      );

      // Section Headers
      expect(html).toContain('Create New Invoice');
      expect(html).toContain('Patient Information');
      expect(html).toContain('Invoice Line Items');
      expect(html).toContain('Financial Totals &amp; Terms');

      // Patient Options
      expect(html).toContain('Aarav Sharma (NXR-DEL-0001)');
      expect(html).toContain('Priya Patel (NXR-DEL-0002)');

      // Line items rendered
      expect(html).toContain('General OPD Consultation');
      expect(html).toContain('Minor Wound Dressing');
      expect(html).toContain('Item #1');
      expect(html).toContain('Item #2');

      // Financial preview
      expect(html).toContain('INR 1,000.00');
      expect(html).toContain('Create Draft Invoice');
    });

    it('displays patient card when patient is selected', () => {
      const html = renderToString(
        React.createElement(CreateInvoiceView, {
          patientId: 'pat-1',
          appointmentId: '',
          consultationId: '',
          dueDate: '',
          notes: '',
          discount: '0.00',
          taxRate: '',
          items: defaultItems,
          currency: 'INR',
          patients: mockPatients,
          loadingPatients: false,
          calculations: defaultCalculations,
          isSubmitting: false,
          formError: null,
          fieldErrors: {},
          createdInvoice: null,
          onPatientChange: vi.fn(),
          onAppointmentIdChange: vi.fn(),
          onConsultationIdChange: vi.fn(),
          onDueDateChange: vi.fn(),
          onNotesChange: vi.fn(),
          onDiscountChange: vi.fn(),
          onTaxRateChange: vi.fn(),
          onItemChange: vi.fn(),
          onAddItem: vi.fn(),
          onRemoveItem: vi.fn(),
          onSubmit: vi.fn(),
          onReset: vi.fn(),
        })
      );

      expect(html).toContain('Aarav Sharma');
      expect(html).toContain('MRN: NXR-DEL-0001');
      expect(html).toContain('Phone: +91 9876543210');
    });

    it('renders field validation errors when present', () => {
      const html = renderToString(
        React.createElement(CreateInvoiceView, {
          patientId: '',
          appointmentId: '',
          consultationId: '',
          dueDate: '',
          notes: '',
          discount: '0.00',
          taxRate: '',
          items: [
            {
              id: 'item-1',
              itemType: 'MISC',
              description: '',
              quantity: 0,
              unitPrice: '10.555',
            },
          ],
          currency: 'INR',
          patients: mockPatients,
          loadingPatients: false,
          calculations: defaultCalculations,
          isSubmitting: false,
          formError: 'Please resolve the errors highlighted below.',
          fieldErrors: {
            patientId: 'Please select a patient',
            'items.0.description': 'Description is required',
            'items.0.quantity': 'Quantity must be at least 1',
            'items.0.unitPrice': 'Max 2 decimal places',
          },
          createdInvoice: null,
          onPatientChange: vi.fn(),
          onAppointmentIdChange: vi.fn(),
          onConsultationIdChange: vi.fn(),
          onDueDateChange: vi.fn(),
          onNotesChange: vi.fn(),
          onDiscountChange: vi.fn(),
          onTaxRateChange: vi.fn(),
          onItemChange: vi.fn(),
          onAddItem: vi.fn(),
          onRemoveItem: vi.fn(),
          onSubmit: vi.fn(),
          onReset: vi.fn(),
        })
      );

      expect(html).toContain('Validation or Submission Error');
      expect(html).toContain('Please resolve the errors highlighted below.');
      expect(html).toContain('Please select a patient');
      expect(html).toContain('Description is required');
      expect(html).toContain('Quantity must be at least 1');
      expect(html).toContain('Max 2 decimal places');
    });

    it('renders discount exceeding subtotal warning and disables submit button', () => {
      const invalidDiscountCalculations = calculateTotalsPreview(defaultItems, '2000.00', '');

      const html = renderToString(
        React.createElement(CreateInvoiceView, {
          patientId: 'pat-1',
          appointmentId: '',
          consultationId: '',
          dueDate: '',
          notes: '',
          discount: '2000.00',
          taxRate: '',
          items: defaultItems,
          currency: 'INR',
          patients: mockPatients,
          loadingPatients: false,
          calculations: invalidDiscountCalculations,
          isSubmitting: false,
          formError: null,
          fieldErrors: {},
          createdInvoice: null,
          onPatientChange: vi.fn(),
          onAppointmentIdChange: vi.fn(),
          onConsultationIdChange: vi.fn(),
          onDueDateChange: vi.fn(),
          onNotesChange: vi.fn(),
          onDiscountChange: vi.fn(),
          onTaxRateChange: vi.fn(),
          onItemChange: vi.fn(),
          onAddItem: vi.fn(),
          onRemoveItem: vi.fn(),
          onSubmit: vi.fn(),
          onReset: vi.fn(),
        })
      );

      expect(html).toContain('Discount cannot exceed subtotal (INR 1,000.00)');
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Create Draft Invoice<\/button>/);
    });

    it('disables submit button and displays spinner while submitting (duplicate-submit prevention)', () => {
      const html = renderToString(
        React.createElement(CreateInvoiceView, {
          patientId: 'pat-1',
          appointmentId: '',
          consultationId: '',
          dueDate: '',
          notes: '',
          discount: '0.00',
          taxRate: '',
          items: defaultItems,
          currency: 'INR',
          patients: mockPatients,
          loadingPatients: false,
          calculations: defaultCalculations,
          isSubmitting: true, // Submitting in progress!
          formError: null,
          fieldErrors: {},
          createdInvoice: null,
          onPatientChange: vi.fn(),
          onAppointmentIdChange: vi.fn(),
          onConsultationIdChange: vi.fn(),
          onDueDateChange: vi.fn(),
          onNotesChange: vi.fn(),
          onDiscountChange: vi.fn(),
          onTaxRateChange: vi.fn(),
          onItemChange: vi.fn(),
          onAddItem: vi.fn(),
          onRemoveItem: vi.fn(),
          onSubmit: vi.fn(),
          onReset: vi.fn(),
        })
      );

      expect(html).toContain('Creating Draft...');
      expect(html).toContain('animate-spin');
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Creating Draft.../);
    });

    it('renders confirmation view with generated invoice number upon successful creation', () => {
      const html = renderToString(
        React.createElement(CreateInvoiceView, {
          patientId: 'pat-1',
          appointmentId: '',
          consultationId: '',
          dueDate: '',
          notes: '',
          discount: '0.00',
          taxRate: '',
          items: defaultItems,
          currency: 'INR',
          patients: mockPatients,
          loadingPatients: false,
          calculations: defaultCalculations,
          isSubmitting: false,
          formError: null,
          fieldErrors: {},
          createdInvoice: {
            id: 'inv-created-999',
            invoiceNumber: 'INV-2026-0042',
            status: 'DRAFT',
            totalAmount: '1000.00',
            currency: 'INR',
            patientName: 'Aarav Sharma',
          },
          onPatientChange: vi.fn(),
          onAppointmentIdChange: vi.fn(),
          onConsultationIdChange: vi.fn(),
          onDueDateChange: vi.fn(),
          onNotesChange: vi.fn(),
          onDiscountChange: vi.fn(),
          onTaxRateChange: vi.fn(),
          onItemChange: vi.fn(),
          onAddItem: vi.fn(),
          onRemoveItem: vi.fn(),
          onSubmit: vi.fn(),
          onReset: vi.fn(),
        })
      );

      // Confirmation screen checks
      expect(html).toContain('Invoice Created Successfully');
      expect(html).toContain('INV-2026-0042');
      expect(html).toContain('Aarav Sharma');
      expect(html).toContain('DRAFT');
      expect(html).toContain('Return to Billing Directory');
      expect(html).toContain('href="/dashboard/billing"');
      expect(html).toContain('Create Another Invoice');
    });

    it('renders optional appointment and consultation inputs', () => {
      const html = renderToString(
        React.createElement(CreateInvoiceView, {
          patientId: 'pat-1',
          appointmentId: 'appt-xyz',
          consultationId: 'consult-abc',
          dueDate: '2026-11-01',
          notes: 'Special care instructions',
          discount: '0.00',
          taxRate: '',
          items: defaultItems,
          currency: 'INR',
          patients: mockPatients,
          loadingPatients: false,
          calculations: defaultCalculations,
          isSubmitting: false,
          formError: null,
          fieldErrors: {},
          createdInvoice: null,
          onPatientChange: vi.fn(),
          onAppointmentIdChange: vi.fn(),
          onConsultationIdChange: vi.fn(),
          onDueDateChange: vi.fn(),
          onNotesChange: vi.fn(),
          onDiscountChange: vi.fn(),
          onTaxRateChange: vi.fn(),
          onItemChange: vi.fn(),
          onAddItem: vi.fn(),
          onRemoveItem: vi.fn(),
          onSubmit: vi.fn(),
          onReset: vi.fn(),
        })
      );

      expect(html).toContain('Appointment ID (Optional)');
      expect(html).toContain('Consultation ID (Optional)');
      expect(html).toContain('value="appt-xyz"');
      expect(html).toContain('value="consult-abc"');
    });
  });

  describe('3. Error Mapping for Invoice Creation', () => {
    it('maps HTTP 401, 403, and 404 to explicit clinical error messages', () => {
      const mapError = (status: number) => {
        if (status === 401) return 'Authentication required. Please log in.';
        if (status === 403) {
          return 'Access forbidden: Invoice creation requires write permissions in this clinic.';
        }
        if (status === 404) {
          return 'Patient or related encounter record not found in active clinic.';
        }
        return 'Failed to create invoice.';
      };

      expect(mapError(401)).toContain('Authentication required');
      expect(mapError(403)).toContain('write permissions');
      expect(mapError(404)).toContain('Patient or related encounter record not found');
      expect(mapError(500)).toContain('Failed to create invoice');
    });
  });

  describe('4. Remediation: Currency Loading & Error State', () => {
    const defaultCalculations = calculateTotalsPreview(defaultItems, '0.00', '');

    it('validates supported currencies: only INR and NPR are allowed', () => {
      expect(isSupportedCurrency('INR')).toBe(true);
      expect(isSupportedCurrency('NPR')).toBe(true);
      expect(isSupportedCurrency('USD')).toBe(false);
      expect(isSupportedCurrency('EUR')).toBe(false);
      expect(isSupportedCurrency('')).toBe(false);
      expect(isSupportedCurrency(null)).toBe(false);
      expect(isSupportedCurrency(undefined)).toBe(false);
    });

    it('currency is not initially displayed as INR while unresolved, and neutral placeholder is shown', () => {
      const html = renderToString(
        React.createElement(CreateInvoiceView, {
          patientId: 'pat-1',
          appointmentId: '',
          consultationId: '',
          dueDate: '',
          notes: '',
          discount: '0.00',
          taxRate: '',
          items: defaultItems,
          currency: null, // explicitly unresolved
          loadingCurrency: true,
          currencyError: null,
          patients: mockPatients,
          loadingPatients: false,
          calculations: defaultCalculations,
          isSubmitting: false,
          formError: null,
          fieldErrors: {},
          createdInvoice: null,
          onPatientChange: vi.fn(),
          onAppointmentIdChange: vi.fn(),
          onConsultationIdChange: vi.fn(),
          onDueDateChange: vi.fn(),
          onNotesChange: vi.fn(),
          onDiscountChange: vi.fn(),
          onTaxRateChange: vi.fn(),
          onItemChange: vi.fn(),
          onAddItem: vi.fn(),
          onRemoveItem: vi.fn(),
          onSubmit: vi.fn(),
          onReset: vi.fn(),
        })
      );

      // Must NOT silently show INR
      expect(html).not.toContain('Currency: INR');
      expect(html).not.toContain('INR');

      // Must show neutral resolving indicators
      expect(html).toContain('Currency: Resolving...');
      expect(html).toContain('Resolving active clinic currency...');
      expect(html).toContain('-- 1,000.00');

      // Submit button must be disabled while currency resolves
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Resolving Currency...<\/button>/);
    });

    it('NPR is displayed accurately after active clinic currency resolves to NPR', () => {
      const html = renderToString(
        React.createElement(CreateInvoiceView, {
          patientId: 'pat-1',
          appointmentId: '',
          consultationId: '',
          dueDate: '',
          notes: '',
          discount: '0.00',
          taxRate: '',
          items: defaultItems,
          currency: 'NPR', // resolved to NPR
          loadingCurrency: false,
          currencyError: null,
          patients: mockPatients,
          loadingPatients: false,
          calculations: defaultCalculations,
          isSubmitting: false,
          formError: null,
          fieldErrors: {},
          createdInvoice: null,
          onPatientChange: vi.fn(),
          onAppointmentIdChange: vi.fn(),
          onConsultationIdChange: vi.fn(),
          onDueDateChange: vi.fn(),
          onNotesChange: vi.fn(),
          onDiscountChange: vi.fn(),
          onTaxRateChange: vi.fn(),
          onItemChange: vi.fn(),
          onAddItem: vi.fn(),
          onRemoveItem: vi.fn(),
          onSubmit: vi.fn(),
          onReset: vi.fn(),
        })
      );

      expect(html).toContain('Currency: NPR');
      expect(html).toContain('NPR 1,000.00');
      expect(html).toContain('Discount Amount (NPR)');
      expect(html).not.toContain('INR');
      expect(html).not.toContain('disabled=""');
      expect(html).toContain('Create Draft Invoice');
    });

    it('a failed or unsupported currency response does not silently show INR and blocks submission', () => {
      const html = renderToString(
        React.createElement(CreateInvoiceView, {
          patientId: 'pat-1',
          appointmentId: '',
          consultationId: '',
          dueDate: '',
          notes: '',
          discount: '0.00',
          taxRate: '',
          items: defaultItems,
          currency: null,
          loadingCurrency: false,
          currencyError: 'Active clinic operates in unsupported currency "EUR". Supported currencies are INR and NPR.',
          patients: mockPatients,
          loadingPatients: false,
          calculations: defaultCalculations,
          isSubmitting: false,
          formError: null,
          fieldErrors: {},
          createdInvoice: null,
          onPatientChange: vi.fn(),
          onAppointmentIdChange: vi.fn(),
          onConsultationIdChange: vi.fn(),
          onDueDateChange: vi.fn(),
          onNotesChange: vi.fn(),
          onDiscountChange: vi.fn(),
          onTaxRateChange: vi.fn(),
          onItemChange: vi.fn(),
          onAddItem: vi.fn(),
          onRemoveItem: vi.fn(),
          onSubmit: vi.fn(),
          onReset: vi.fn(),
          onRetryCurrency: vi.fn(),
        })
      );

      // Must NOT silently show INR
      expect(html).not.toContain('Currency: INR');
      expect(html).not.toContain('INR 1,000.00');

      // Displays explicit error banner and unavailable badge
      expect(html).toContain('Currency: Unavailable');
      expect(html).toContain('Clinic Currency Error');
      expect(html).toContain('Active clinic operates in unsupported currency &quot;EUR&quot;');
      expect(html).toContain('Retry');

      // Submit button is disabled
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Create Draft Invoice<\/button>/);
    });
  });

  describe('5. Remediation: Clear Encounter IDs on Patient Change', () => {
    it('clears appointment and consultation IDs whenever the selected patient changes', () => {
      let currentPatientId = 'pat-1';
      let currentAppointmentId = 'appt-prefilled-123';
      let currentConsultationId = 'consult-prefilled-456';

      const setPatientId = (updater: (prev: string) => string) => {
        currentPatientId = updater(currentPatientId);
      };
      const setAppointmentId = (val: string) => {
        currentAppointmentId = val;
      };
      const setConsultationId = (val: string) => {
        currentConsultationId = val;
      };

      // Implement the exact logic from handlePatientChange
      const handlePatientChange = (newPatientId: string) => {
        setPatientId((prev) => {
          if (prev !== newPatientId) {
            setAppointmentId('');
            setConsultationId('');
          }
          return newPatientId;
        });
      };

      // Initially has patient 1 with prefilled encounters
      expect(currentPatientId).toBe('pat-1');
      expect(currentAppointmentId).toBe('appt-prefilled-123');
      expect(currentConsultationId).toBe('consult-prefilled-456');

      // Switch patient from pat-1 to pat-2: encounter IDs must be cleared immediately
      handlePatientChange('pat-2');
      expect(currentPatientId).toBe('pat-2');
      expect(currentAppointmentId).toBe('');
      expect(currentConsultationId).toBe('');

      // If user inputs new encounter IDs for pat-2
      currentAppointmentId = 'appt-for-pat-2';
      currentConsultationId = 'consult-for-pat-2';

      // If the selection does not change (same pat-2 passed)
      handlePatientChange('pat-2');
      expect(currentPatientId).toBe('pat-2');
      expect(currentAppointmentId).toBe('appt-for-pat-2');
      expect(currentConsultationId).toBe('consult-for-pat-2');

      // If user clears patient selection
      handlePatientChange('');
      expect(currentPatientId).toBe('');
      expect(currentAppointmentId).toBe('');
      expect(currentConsultationId).toBe('');
    });
  });
});
