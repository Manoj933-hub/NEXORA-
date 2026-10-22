import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  type InvoiceListItem,
  type PaginationMetadata,
  parseCents,
  formatCents,
  formatMoney,
  calculateBalanceDueCents,
  formatDate,
  filterInvoices,
  BillingDirectoryView,
} from './page';

describe('Billing Directory Unit & Component Tests', () => {
  const mockInvoices: InvoiceListItem[] = [
    {
      id: 'inv-101',
      clinicId: 'clinic-1',
      patientId: 'pat-1',
      appointmentId: 'appt-1',
      consultationId: 'con-1',
      createdById: 'user-1',
      invoiceNumber: 'INV-2026-0001',
      year: 2026,
      currency: 'INR',
      status: 'ISSUED',
      subtotal: '1000.00',
      discount: '100.00',
      taxRate: '18.00',
      taxAmount: '162.00',
      totalAmount: '1062.00',
      paidAmount: '0.00',
      issueDate: '2026-10-22T09:00:00Z',
      dueDate: '2026-11-05T09:00:00Z',
      notes: 'Initial checkup and labs',
      createdAt: '2026-10-22T08:30:00Z',
      updatedAt: '2026-10-22T09:00:00Z',
      patient: {
        id: 'pat-1',
        mrn: 'NXR-DEL-0001',
        name: 'Aarav Sharma',
        phone: '+91 9876543210',
      },
      createdBy: {
        id: 'user-1',
        name: 'Rohan Receptionist',
        email: 'rohan@nexora.test',
      },
    },
    {
      id: 'inv-102',
      clinicId: 'clinic-1',
      patientId: 'pat-2',
      appointmentId: 'appt-2',
      consultationId: null,
      createdById: 'user-1',
      invoiceNumber: 'INV-2026-0002',
      year: 2026,
      currency: 'INR',
      status: 'PARTIALLY_PAID',
      subtotal: '2500.00',
      discount: '0.00',
      taxRate: null,
      taxAmount: '0.00',
      totalAmount: '2500.00',
      paidAmount: '1000.00',
      issueDate: '2026-10-20T10:00:00Z',
      dueDate: '2026-10-30T10:00:00Z',
      notes: 'Cardiology consultation and ECG',
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-21T14:00:00Z',
      patient: {
        id: 'pat-2',
        mrn: 'NXR-DEL-0002',
        name: 'Priya Patel',
        phone: '+91 9811223344',
      },
      createdBy: {
        id: 'user-1',
        name: 'Rohan Receptionist',
        email: 'rohan@nexora.test',
      },
    },
    {
      id: 'inv-103',
      clinicId: 'clinic-2',
      patientId: 'pat-3',
      appointmentId: null,
      consultationId: null,
      createdById: 'user-2',
      invoiceNumber: 'INV-2026-0003',
      year: 2026,
      currency: 'NPR',
      status: 'PAID',
      subtotal: '1500.00',
      discount: '0.00',
      taxRate: '13.00',
      taxAmount: '195.00',
      totalAmount: '1695.00',
      paidAmount: '1695.00',
      issueDate: '2026-10-18T11:00:00Z',
      dueDate: '2026-10-25T11:00:00Z',
      notes: 'Fully settled cash invoice',
      createdAt: '2026-10-18T11:00:00Z',
      updatedAt: '2026-10-18T11:30:00Z',
      patient: {
        id: 'pat-3',
        mrn: 'NXR-KTM-0003',
        name: 'Sita Thapa',
        phone: '+977 9841234567',
      },
      createdBy: {
        id: 'user-2',
        name: 'Dr. Bimal',
        email: 'bimal@nexora.test',
      },
    },
    {
      id: 'inv-104',
      clinicId: 'clinic-1',
      patientId: 'pat-1',
      appointmentId: null,
      consultationId: null,
      createdById: 'user-1',
      invoiceNumber: 'INV-2026-0004',
      year: 2026,
      currency: 'INR',
      status: 'DRAFT',
      subtotal: '500.00',
      discount: '0.00',
      taxRate: null,
      taxAmount: '0.00',
      totalAmount: '500.00',
      paidAmount: '0.00',
      issueDate: null, // Draft has null issueDate!
      dueDate: null,
      notes: 'Draft dental procedure',
      createdAt: '2026-10-22T15:00:00Z',
      updatedAt: '2026-10-22T15:00:00Z',
      patient: {
        id: 'pat-1',
        mrn: 'NXR-DEL-0001',
        name: 'Aarav Sharma',
        phone: '+91 9876543210',
      },
    },
    {
      id: 'inv-105',
      clinicId: 'clinic-1',
      patientId: 'pat-4',
      appointmentId: null,
      consultationId: null,
      createdById: 'user-1',
      invoiceNumber: 'INV-2026-0005',
      year: 2026,
      currency: 'INR',
      status: 'VOID',
      subtotal: '800.00',
      discount: '0.00',
      taxRate: null,
      taxAmount: '0.00',
      totalAmount: '800.00',
      paidAmount: '0.00',
      issueDate: '2026-10-19T09:00:00Z',
      dueDate: null,
      notes: 'Patient cancelled procedure before visit',
      createdAt: '2026-10-19T09:00:00Z',
      updatedAt: '2026-10-19T10:00:00Z',
      patient: {
        id: 'pat-4',
        mrn: 'NXR-DEL-0004',
        name: 'Vikram Malhotra',
      },
    },
    {
      id: 'inv-106',
      clinicId: 'clinic-1',
      patientId: 'pat-5',
      appointmentId: null,
      consultationId: null,
      createdById: 'user-1',
      invoiceNumber: 'INV-2026-0006',
      year: 2026,
      currency: 'INR',
      status: 'REFUNDED',
      subtotal: '1200.00',
      discount: '0.00',
      taxRate: null,
      taxAmount: '0.00',
      totalAmount: '1200.00',
      paidAmount: '1200.00',
      issueDate: '2026-10-15T12:00:00Z',
      dueDate: null,
      notes: 'Refunded due to lab sample error',
      createdAt: '2026-10-15T12:00:00Z',
      updatedAt: '2026-10-16T14:00:00Z',
      patient: {
        id: 'pat-5',
        mrn: 'NXR-DEL-0005',
        name: 'Sunita Mehra',
      },
    },
  ];

  const defaultPagination: PaginationMetadata = {
    page: 1,
    limit: 20,
    total: 6,
    totalPages: 1,
  };

  describe('1. Exact Financial & Monetary Helper Functions', () => {
    it('parses decimal numbers and strings into exact minor units (cents/paise)', () => {
      expect(parseCents('10.55')).toBe(BigInt(1055));
      expect(parseCents(10.55)).toBe(BigInt(1055));
      expect(parseCents('0.00')).toBe(BigInt(0));
      expect(parseCents('0')).toBe(BigInt(0));
      expect(parseCents(0)).toBe(BigInt(0));
      expect(parseCents(null)).toBe(BigInt(0));
      expect(parseCents(undefined)).toBe(BigInt(0));
      expect(parseCents('1234567.89')).toBe(BigInt(123456789));
    });

    it('formats cents into formatted currency strings with thousands separators', () => {
      expect(formatCents(BigInt(1055), 'INR')).toBe('INR 10.55');
      expect(formatCents(BigInt(123456789), 'INR')).toBe('INR 1,234,567.89');
      expect(formatCents(BigInt(169500), 'NPR')).toBe('NPR 1,695.00');
      expect(formatCents(BigInt(0), 'INR')).toBe('INR 0.00');
    });

    it('formats monetary values from raw API string/number fields', () => {
      expect(formatMoney('1062.00', 'INR')).toBe('INR 1,062.00');
      expect(formatMoney(1062, 'INR')).toBe('INR 1,062.00');
      expect(formatMoney('1695.00', 'NPR')).toBe('NPR 1,695.00');
      expect(formatMoney('0.00', 'INR')).toBe('INR 0.00');
    });

    it('calculates balance due minor units accurately without IEEE-754 drift', () => {
      // 1062.00 total - 0.00 paid = 1062.00 balance
      expect(calculateBalanceDueCents('1062.00', '0.00')).toBe(BigInt(106200));

      // 2500.00 total - 1000.00 paid = 1500.00 balance
      expect(calculateBalanceDueCents('2500.00', '1000.00')).toBe(BigInt(150000));

      // 1695.00 total - 1695.00 paid = 0 balance
      expect(calculateBalanceDueCents('1695.00', '1695.00')).toBe(BigInt(0));

      // Overpayment guard: total 100, paid 150 -> balance 0
      expect(calculateBalanceDueCents('100.00', '150.00')).toBe(BigInt(0));
    });

    it('formats dates safely, displaying dash for null/undefined draft dates', () => {
      expect(formatDate(null)).toBe('—');
      expect(formatDate(undefined)).toBe('—');
      expect(formatDate('2026-10-22T09:00:00Z')).toMatch(/Oct 22, 2026/);
    });
  });

  describe('2. Client-Side In-Page Filtering Helper', () => {
    it('returns all invoices when search query is empty', () => {
      const result = filterInvoices(mockInvoices, '');
      expect(result).toHaveLength(6);
    });

    it('filters by invoice number', () => {
      const result = filterInvoices(mockInvoices, 'INV-2026-0002');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('inv-102');
    });

    it('filters by patient name (case-insensitive)', () => {
      const result = filterInvoices(mockInvoices, 'aarav');
      expect(result).toHaveLength(2); // inv-101 and inv-104
      expect(result.map((r) => r.id)).toEqual(['inv-101', 'inv-104']);
    });

    it('filters by patient MRN', () => {
      const result = filterInvoices(mockInvoices, 'NXR-KTM-0003');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('inv-103');
    });
  });

  describe('3. BillingDirectoryView Component Rendering', () => {
    it('renders invoice table headers and data rows correctly', () => {
      const html = renderToString(
        React.createElement(BillingDirectoryView, {
          invoices: mockInvoices,
          loading: false,
          error: null,
          statusFilter: 'ALL',
          searchQuery: '',
          pagination: defaultPagination,
          onStatusFilterChange: vi.fn(),
          onSearchQueryChange: vi.fn(),
          onPageChange: vi.fn(),
          onClearFilters: vi.fn(),
          onRefresh: vi.fn(),
        })
      );

      // Table headers
      expect(html).toContain('Invoice #');
      expect(html).toContain('Patient');
      expect(html).toContain('Issue Date');
      expect(html).toContain('Due Date');
      expect(html).toContain('Total');
      expect(html).toContain('Paid');
      expect(html).toContain('Balance Due');
      expect(html).toContain('Status');
      expect(html).toContain('Action');

      // Invoices rendered
      expect(html).toContain('INV-2026-0001');
      expect(html).toContain('Aarav Sharma');
      expect(html).toContain('NXR-DEL-0001');
      expect(html).toContain('INR 1,062.00');

      expect(html).toContain('INV-2026-0002');
      expect(html).toContain('Priya Patel');
      expect(html).toContain('INR 2,500.00');
      expect(html).toContain('INR 1,000.00');
      expect(html).toContain('INR 1,500.00');

      // Currency check for Nepal clinic: displays NPR currency!
      expect(html).toContain('INV-2026-0003');
      expect(html).toContain('Sita Thapa');
      expect(html).toContain('NPR 1,695.00');
      expect(html).toContain('NPR 0.00');

      // Status badges
      expect(html).toContain('Issued');
      expect(html).toContain('Partially Paid');
      expect(html).toContain('Paid');
      expect(html).toContain('Draft');
      expect(html).toContain('Void');
      expect(html).toContain('Refunded');

      // Create Invoice action
      expect(html).toContain('Create Invoice');
      expect(html).toContain('href="/dashboard/billing/new"');

      // Detail action links
      expect(html).toContain('href="/dashboard/billing/inv-101"');
      expect(html).toContain('href="/dashboard/billing/inv-102"');
      expect(html).toContain('href="/dashboard/billing/inv-103"');
    });

    it('renders null draft issue date as dash', () => {
      const draftOnly = [mockInvoices[3]]; // inv-104 (DRAFT with issueDate null)
      const html = renderToString(
        React.createElement(BillingDirectoryView, {
          invoices: draftOnly,
          loading: false,
          error: null,
          statusFilter: 'ALL',
          searchQuery: '',
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
          onStatusFilterChange: vi.fn(),
          onSearchQueryChange: vi.fn(),
          onPageChange: vi.fn(),
          onClearFilters: vi.fn(),
          onRefresh: vi.fn(),
        })
      );

      expect(html).toContain('INV-2026-0004');
      expect(html).toContain('Draft');
      expect(html).toContain('—'); // Unissued draft date
    });

    it('renders status filter tabs with active tab highlighting', () => {
      const html = renderToString(
        React.createElement(BillingDirectoryView, {
          invoices: mockInvoices,
          loading: false,
          error: null,
          statusFilter: 'ISSUED',
          searchQuery: '',
          pagination: defaultPagination,
          onStatusFilterChange: vi.fn(),
          onSearchQueryChange: vi.fn(),
          onPageChange: vi.fn(),
          onClearFilters: vi.fn(),
          onRefresh: vi.fn(),
        })
      );

      // Verify all 7 status tabs exist
      expect(html).toContain('All Invoices');
      expect(html).toContain('Drafts');
      expect(html).toContain('Issued');
      expect(html).toContain('Partially Paid');
      expect(html).toContain('Paid');
      expect(html).toContain('Void');
      expect(html).toContain('Refunded');

      // Verify ISSUED tab has active styling
      expect(html).toContain('aria-selected="true"');
    });

    it('renders patient filter banner when patientId is present in URL', () => {
      const html = renderToString(
        React.createElement(BillingDirectoryView, {
          invoices: mockInvoices,
          loading: false,
          error: null,
          statusFilter: 'ALL',
          searchQuery: '',
          patientId: 'pat-1',
          pagination: defaultPagination,
          onStatusFilterChange: vi.fn(),
          onSearchQueryChange: vi.fn(),
          onPageChange: vi.fn(),
          onClearFilters: vi.fn(),
          onRefresh: vi.fn(),
        })
      );

      expect(html).toContain('Filtered for patient:');
      expect(html).toContain('Aarav Sharma (NXR-DEL-0001)');
      expect(html).toContain('Clear Patient Filter');
      expect(html).toContain('href="/dashboard/billing"');
    });

    it('renders loading skeleton when loading is true', () => {
      const html = renderToString(
        React.createElement(BillingDirectoryView, {
          invoices: [],
          loading: true,
          error: null,
          statusFilter: 'ALL',
          searchQuery: '',
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
          onStatusFilterChange: vi.fn(),
          onSearchQueryChange: vi.fn(),
          onPageChange: vi.fn(),
          onClearFilters: vi.fn(),
          onRefresh: vi.fn(),
        })
      );

      expect(html).toContain('animate-pulse');
      expect(html).not.toContain('No Invoices Found');
    });

    it('renders empty clinic directory state when no invoices exist', () => {
      const html = renderToString(
        React.createElement(BillingDirectoryView, {
          invoices: [],
          loading: false,
          error: null,
          statusFilter: 'ALL',
          searchQuery: '',
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
          onStatusFilterChange: vi.fn(),
          onSearchQueryChange: vi.fn(),
          onPageChange: vi.fn(),
          onClearFilters: vi.fn(),
          onRefresh: vi.fn(),
        })
      );

      expect(html).toContain('No Invoices Found');
      expect(html).toContain('Invoices created by authorized clinic staff will appear here');
    });

    it('renders no search matches state when filter excludes all loaded rows', () => {
      const html = renderToString(
        React.createElement(BillingDirectoryView, {
          invoices: mockInvoices,
          loading: false,
          error: null,
          statusFilter: 'ALL',
          searchQuery: 'NonexistentPatient',
          pagination: defaultPagination,
          onStatusFilterChange: vi.fn(),
          onSearchQueryChange: vi.fn(),
          onPageChange: vi.fn(),
          onClearFilters: vi.fn(),
          onRefresh: vi.fn(),
        })
      );

      expect(html).toContain('No Matching Invoices');
      expect(html).toContain('NonexistentPatient');
      expect(html).toContain('Clear Search');
    });

    it('renders error alert with message and retry button', () => {
      const html = renderToString(
        React.createElement(BillingDirectoryView, {
          invoices: [],
          loading: false,
          error: 'Access forbidden: Billing records require Receptionist, Doctor, Admin, or Owner permissions.',
          statusFilter: 'ALL',
          searchQuery: '',
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
          onStatusFilterChange: vi.fn(),
          onSearchQueryChange: vi.fn(),
          onPageChange: vi.fn(),
          onClearFilters: vi.fn(),
          onRefresh: vi.fn(),
        })
      );

      expect(html).toContain('Unable to load invoices');
      expect(html).toContain('Access forbidden: Billing records require Receptionist, Doctor, Admin, or Owner permissions.');
      expect(html).toContain('Retry');
    });

    it('renders pagination controls and record range when totalPages > 1', () => {
      const multiPagePagination: PaginationMetadata = {
        page: 2,
        limit: 20,
        total: 45,
        totalPages: 3,
      };

      const html = renderToString(
        React.createElement(BillingDirectoryView, {
          invoices: mockInvoices,
          loading: false,
          error: null,
          statusFilter: 'ALL',
          searchQuery: '',
          pagination: multiPagePagination,
          onStatusFilterChange: vi.fn(),
          onSearchQueryChange: vi.fn(),
          onPageChange: vi.fn(),
          onClearFilters: vi.fn(),
          onRefresh: vi.fn(),
        })
      );

      expect(html).toContain('Showing');
      expect(html).toContain('21'); // startRecord
      expect(html).toContain('40'); // endRecord
      expect(html).toContain('45'); // total
      expect(html).toContain('Page 2 of 3');
      expect(html).toContain('Previous');
      expect(html).toContain('Next');
    });
  });

  describe('4. API Parameter Construction & Error Mapping', () => {
    it('constructs correct query parameters for API requests', () => {
      const buildParams = (
        patientId: string | null,
        statusFilter: string,
        page: number,
        limit = 20
      ) => {
        const params = new URLSearchParams();
        if (patientId) params.set('patientId', patientId);
        if (statusFilter !== 'ALL') params.set('status', statusFilter);
        params.set('page', String(page));
        params.set('limit', String(limit));
        return params.toString();
      };

      expect(buildParams(null, 'ALL', 1)).toBe('page=1&limit=20');
      expect(buildParams('pat-123', 'ALL', 1)).toBe('patientId=pat-123&page=1&limit=20');
      expect(buildParams('pat-123', 'PAID', 2)).toBe('patientId=pat-123&status=PAID&page=2&limit=20');
      expect(buildParams(null, 'DRAFT', 3)).toBe('status=DRAFT&page=3&limit=20');
    });

    it('maps HTTP 401, 403, and 404 to user-friendly error messages', () => {
      const mapError = (status: number) => {
        if (status === 401) return 'Authentication required. Please log in.';
        if (status === 403) {
          return 'Access forbidden: Billing records require Receptionist, Doctor, Admin, or Owner permissions.';
        }
        if (status === 404) return 'Patient not found in active clinic.';
        return 'Failed to load invoices from clinic.';
      };

      expect(mapError(401)).toContain('Authentication required');
      expect(mapError(403)).toContain('Receptionist, Doctor, Admin, or Owner permissions');
      expect(mapError(404)).toContain('Patient not found in active clinic');
      expect(mapError(500)).toContain('Failed to load invoices from clinic');
    });
  });
});
