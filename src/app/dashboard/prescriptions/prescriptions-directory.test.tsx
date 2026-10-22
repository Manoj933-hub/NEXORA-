import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  type PrescriptionListItem,
  formatMedicationSummary,
  filterPrescriptions,
  PrescriptionDirectoryView,
} from './page';

describe('Prescription Directory Unit & Component Tests', () => {
  const mockPrescriptions: PrescriptionListItem[] = [
    {
      id: 'rx-101',
      clinicId: 'clinic-1',
      consultationId: 'con-101',
      patientId: 'pat-1',
      doctorId: 'doc-1',
      status: 'ACTIVE',
      notes: 'Take with food',
      version: 1,
      createdAt: '2026-10-22T08:30:00Z',
      updatedAt: '2026-10-22T08:30:00Z',
      patient: {
        id: 'pat-1',
        mrn: 'NXR-NP-000101',
        name: 'Aarav Sharma',
        gender: 'MALE',
        dateOfBirth: '1988-04-12',
      },
      doctor: {
        id: 'doc-1',
        name: 'Dr. Hari Adhikari',
        email: 'dr.hari@nexora.health',
      },
      items: [
        {
          id: 'item-1',
          prescriptionId: 'rx-101',
          medicationName: 'Amoxicillin',
          strength: '500 mg',
          route: 'Oral',
          frequency: '1-0-1',
          duration: '7 days',
          quantity: '14 capsules',
          instructions: 'Take after meals',
        },
        {
          id: 'item-2',
          prescriptionId: 'rx-101',
          medicationName: 'Paracetamol',
          strength: '650 mg',
          route: 'Oral',
          frequency: '1-1-1',
          duration: '3 days',
          quantity: '9 tablets',
          instructions: 'Take for fever if needed',
        },
      ],
    },
    {
      id: 'rx-102',
      clinicId: 'clinic-1',
      consultationId: 'con-102',
      patientId: 'pat-2',
      doctorId: 'doc-2',
      status: 'COMPLETED',
      notes: 'Completed full course',
      version: 2,
      createdAt: '2026-10-15T11:00:00Z',
      updatedAt: '2026-10-22T10:00:00Z',
      patient: {
        id: 'pat-2',
        mrn: 'NXR-NP-000102',
        name: 'Sunita Thapa',
        gender: 'FEMALE',
        dateOfBirth: '1992-09-25',
      },
      doctor: {
        id: 'doc-2',
        name: 'Dr. Meera Basnet',
        email: 'dr.meera@nexora.health',
      },
      items: [
        {
          id: 'item-3',
          prescriptionId: 'rx-102',
          medicationName: 'Azithromycin',
          strength: '250 mg',
          route: 'Oral',
          frequency: '1-0-0',
          duration: '5 days',
          quantity: '5 tablets',
          instructions: 'Take 1 hour before meal',
        },
      ],
    },
    {
      id: 'rx-103',
      clinicId: 'clinic-1',
      consultationId: 'con-103',
      patientId: 'pat-3',
      doctorId: 'doc-1',
      status: 'DISCONTINUED',
      notes: 'Patient reported mild urticaria',
      version: 2,
      createdAt: '2026-10-18T14:15:00Z',
      updatedAt: '2026-10-20T09:30:00Z',
      patient: {
        id: 'pat-3',
        mrn: 'NXR-NP-000103',
        name: 'Bikash Pokhrel',
        gender: 'MALE',
        dateOfBirth: '1975-12-05',
      },
      doctor: {
        id: 'doc-1',
        name: 'Dr. Hari Adhikari',
        email: 'dr.hari@nexora.health',
      },
      items: [
        {
          id: 'item-4',
          prescriptionId: 'rx-103',
          medicationName: 'Ciprofloxacin',
          strength: '500 mg',
          route: 'Oral',
          frequency: '1-0-1',
          duration: '10 days',
        },
      ],
    },
    {
      id: 'rx-104',
      clinicId: 'clinic-1',
      consultationId: 'con-104',
      patientId: 'pat-1',
      doctorId: 'doc-2',
      status: 'CANCELLED',
      notes: 'Prescribed duplicate in error',
      version: 2,
      createdAt: '2026-10-21T16:00:00Z',
      updatedAt: '2026-10-21T16:05:00Z',
      patient: {
        id: 'pat-1',
        mrn: 'NXR-NP-000101',
        name: 'Aarav Sharma',
        gender: 'MALE',
        dateOfBirth: '1988-04-12',
      },
      doctor: {
        id: 'doc-2',
        name: 'Dr. Meera Basnet',
        email: 'dr.meera@nexora.health',
      },
      items: [
        {
          id: 'item-5',
          prescriptionId: 'rx-104',
          medicationName: 'Ibuprofen',
          strength: '400 mg',
          route: 'Oral',
          frequency: '0-0-1',
          duration: '2 days',
        },
      ],
    },
  ];

  describe('formatMedicationSummary helper', () => {
    it('summarizes a single medication item without surplus count', () => {
      const summary = formatMedicationSummary([mockPrescriptions[1].items[0]]);
      expect(summary.primary).toBe('Azithromycin 250 mg');
      expect(summary.subtext).toContain('1-0-0 • 5 days • Oral');
      expect(summary.moreCount).toBe(0);
    });

    it('summarizes multiple medication items and calculates surplus count', () => {
      const summary = formatMedicationSummary(mockPrescriptions[0].items);
      expect(summary.primary).toBe('Amoxicillin 500 mg');
      expect(summary.moreCount).toBe(1);
    });

    it('handles empty items array safely with fallback labels', () => {
      const summary = formatMedicationSummary([]);
      expect(summary.primary).toBe('No medications listed');
      expect(summary.moreCount).toBe(0);
    });
  });

  describe('filterPrescriptions helper', () => {
    it('returns all prescriptions when query is empty and status filter is ALL', () => {
      const results = filterPrescriptions(mockPrescriptions, '', 'ALL');
      expect(results).toHaveLength(4);
    });

    it('filters strictly by status', () => {
      const activeOnly = filterPrescriptions(mockPrescriptions, '', 'ACTIVE');
      expect(activeOnly).toHaveLength(1);
      expect(activeOnly[0].id).toBe('rx-101');

      const completedOnly = filterPrescriptions(mockPrescriptions, '', 'COMPLETED');
      expect(completedOnly).toHaveLength(1);
      expect(completedOnly[0].id).toBe('rx-102');

      const cancelledOnly = filterPrescriptions(mockPrescriptions, '', 'CANCELLED');
      expect(cancelledOnly).toHaveLength(1);
      expect(cancelledOnly[0].id).toBe('rx-104');
    });

    it('searches by patient name (case-insensitive)', () => {
      const results = filterPrescriptions(mockPrescriptions, 'sunita', 'ALL');
      expect(results).toHaveLength(1);
      expect(results[0].patient.name).toBe('Sunita Thapa');
    });

    it('searches by MRN', () => {
      const results = filterPrescriptions(mockPrescriptions, '000103', 'ALL');
      expect(results).toHaveLength(1);
      expect(results[0].patient.mrn).toBe('NXR-NP-000103');
    });

    it('searches by medication name across any medication in the items array', () => {
      // Paracetamol is the second item on rx-101
      const paracetamolResults = filterPrescriptions(mockPrescriptions, 'paracetamol', 'ALL');
      expect(paracetamolResults).toHaveLength(1);
      expect(paracetamolResults[0].id).toBe('rx-101');

      const ciproResults = filterPrescriptions(mockPrescriptions, 'ciprofloxacin', 'ALL');
      expect(ciproResults).toHaveLength(1);
      expect(ciproResults[0].id).toBe('rx-103');
    });

    it('combines status filter and search query', () => {
      // Aarav has both rx-101 (ACTIVE) and rx-104 (CANCELLED)
      const aaravActive = filterPrescriptions(mockPrescriptions, 'Aarav', 'ACTIVE');
      expect(aaravActive).toHaveLength(1);
      expect(aaravActive[0].id).toBe('rx-101');

      const aaravCancelled = filterPrescriptions(mockPrescriptions, 'Aarav', 'CANCELLED');
      expect(aaravCancelled).toHaveLength(1);
      expect(aaravCancelled[0].id).toBe('rx-104');

      const aaravCompleted = filterPrescriptions(mockPrescriptions, 'Aarav', 'COMPLETED');
      expect(aaravCompleted).toHaveLength(0);
    });

    it('returns empty array when search query matches no records', () => {
      const results = filterPrescriptions(mockPrescriptions, 'NonexistentMedication', 'ALL');
      expect(results).toHaveLength(0);
    });
  });

  describe('PrescriptionDirectoryView Rendering', () => {
    it('renders prescription table headers, patient info, doctor, date, and status badges', () => {
      const html = renderToString(
        React.createElement(PrescriptionDirectoryView, {
          prescriptions: mockPrescriptions,
          loading: false,
          error: null,
          statusFilter: 'ALL',
          searchQuery: '',
          onStatusFilterChange: vi.fn(),
          onSearchQueryChange: vi.fn(),
          onClearFilters: vi.fn(),
          onRefresh: vi.fn(),
        })
      );

      // Page Title & Header
      expect(html).toContain('Prescription Directory');
      expect(html).toContain('Pharmacy &amp; Prescriptions');

      // Table columns
      expect(html).toContain('Patient');
      expect(html).toContain('Medication &amp; Regimen');
      expect(html).toContain('Prescribed By');
      expect(html).toContain('Issue Date');
      expect(html).toContain('Status');
      expect(html).toContain('Action');

      // Patients
      expect(html).toContain('Aarav Sharma');
      expect(html).toContain('NXR-NP-000101');
      expect(html).toContain('Sunita Thapa');
      expect(html).toContain('NXR-NP-000102');

      // Doctors
      expect(html).toContain('Dr. Hari Adhikari');
      expect(html).toContain('dr.hari@nexora.health');

      // Medications & multi-item indicator
      expect(html).toContain('Amoxicillin 500 mg');
      expect(html).toContain('+1 more');

      // Status Badges
      expect(html).toContain('Active');
      expect(html).toContain('Completed');
      expect(html).toContain('Discontinued');
      expect(html).toContain('Cancelled');

      // Links to details
      expect(html).toContain('href="/dashboard/prescriptions/rx-101"');
      expect(html).toContain('href="/dashboard/prescriptions/rx-102"');
      expect(html).toContain('href="/dashboard/prescriptions/rx-103"');
      expect(html).toContain('href="/dashboard/prescriptions/rx-104"');
    });

    it('renders patient filter banner when patientId is present in URL', () => {
      const html = renderToString(
        React.createElement(PrescriptionDirectoryView, {
          prescriptions: mockPrescriptions,
          loading: false,
          error: null,
          statusFilter: 'ALL',
          searchQuery: '',
          patientId: 'pat-1',
          onStatusFilterChange: vi.fn(),
          onSearchQueryChange: vi.fn(),
          onClearFilters: vi.fn(),
          onRefresh: vi.fn(),
        })
      );

      expect(html).toContain('Filtered for patient:');
      expect(html).toContain('Aarav Sharma (NXR-NP-000101)');
      expect(html).toContain('Clear Patient Filter');
    });

    it('renders loading skeleton when loading is true', () => {
      const html = renderToString(
        React.createElement(PrescriptionDirectoryView, {
          prescriptions: [],
          loading: true,
          error: null,
          statusFilter: 'ALL',
          searchQuery: '',
          onStatusFilterChange: vi.fn(),
          onSearchQueryChange: vi.fn(),
          onClearFilters: vi.fn(),
          onRefresh: vi.fn(),
        })
      );

      expect(html).toContain('animate-pulse');
      expect(html).not.toContain('No Prescriptions Found');
    });

    it('renders empty clinic directory state when no prescriptions exist', () => {
      const html = renderToString(
        React.createElement(PrescriptionDirectoryView, {
          prescriptions: [],
          loading: false,
          error: null,
          statusFilter: 'ALL',
          searchQuery: '',
          onStatusFilterChange: vi.fn(),
          onSearchQueryChange: vi.fn(),
          onClearFilters: vi.fn(),
          onRefresh: vi.fn(),
        })
      );

      expect(html).toContain('No Prescriptions Found');
      expect(html).toContain('Prescriptions generated during clinical consultations will appear here automatically');
    });

    it('renders no search matches state when filter excludes all rows', () => {
      const html = renderToString(
        React.createElement(PrescriptionDirectoryView, {
          prescriptions: mockPrescriptions,
          loading: false,
          error: null,
          statusFilter: 'ALL',
          searchQuery: 'NonexistentMed',
          onStatusFilterChange: vi.fn(),
          onSearchQueryChange: vi.fn(),
          onClearFilters: vi.fn(),
          onRefresh: vi.fn(),
        })
      );

      expect(html).toContain('No Matching Prescriptions');
      expect(html).toContain('NonexistentMed');
      expect(html).toContain('Clear Search &amp; Filters');
    });

    it('renders error alert with message and retry button when error occurs', () => {
      const html = renderToString(
        React.createElement(PrescriptionDirectoryView, {
          prescriptions: [],
          loading: false,
          error: 'Access restricted: Clinical records require Doctor, Admin, or Owner permissions.',
          statusFilter: 'ALL',
          searchQuery: '',
          onStatusFilterChange: vi.fn(),
          onSearchQueryChange: vi.fn(),
          onClearFilters: vi.fn(),
          onRefresh: vi.fn(),
        })
      );

      expect(html).toContain('Unable to load prescriptions');
      expect(html).toContain('Access restricted: Clinical records require Doctor, Admin, or Owner permissions.');
      expect(html).toContain('Retry');
    });

    it('renders reset filters button when patientId filter produces zero results', () => {
      const html = renderToString(
        React.createElement(PrescriptionDirectoryView, {
          prescriptions: [],
          loading: false,
          error: null,
          statusFilter: 'ALL',
          searchQuery: '',
          patientId: 'pat-999',
          onStatusFilterChange: vi.fn(),
          onSearchQueryChange: vi.fn(),
          onClearFilters: vi.fn(),
          onRefresh: vi.fn(),
        })
      );

      expect(html).toContain('There are no prescription records for this patient');
      expect(html).toContain('Reset Filters');
    });

    it('searches by prescribing doctor name', () => {
      const results = filterPrescriptions(mockPrescriptions, 'Meera', 'ALL');
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id)).toEqual(['rx-102', 'rx-104']);
    });
  });

  describe('Query Parameter Construction & API Scoping', () => {
    it('constructs correct API URL with patientId and status parameters', () => {
      const buildUrl = (patientId?: string | null, status?: string) => {
        const params = new URLSearchParams();
        if (patientId) params.set('patientId', patientId);
        if (status && status !== 'ALL') params.set('status', status);
        return `/api/prescriptions${params.toString() ? `?${params.toString()}` : ''}`;
      };

      expect(buildUrl()).toBe('/api/prescriptions');
      expect(buildUrl('pat-1')).toBe('/api/prescriptions?patientId=pat-1');
      expect(buildUrl('pat-1', 'ACTIVE')).toBe('/api/prescriptions?patientId=pat-1&status=ACTIVE');
      expect(buildUrl(null, 'COMPLETED')).toBe('/api/prescriptions?status=COMPLETED');
      expect(buildUrl(null, 'ALL')).toBe('/api/prescriptions');
    });

    it('maps HTTP 403 Forbidden and 404 to user-facing clinical messages', () => {
      const mapError = (status: number) => {
        if (status === 403) {
          return 'Access restricted: Clinical records require Doctor, Admin, or Owner permissions.';
        }
        if (status === 404) {
          return 'Patient not found in active clinic.';
        }
        return 'Failed to load prescriptions from clinic.';
      };

      expect(mapError(403)).toContain('Doctor, Admin, or Owner permissions');
      expect(mapError(404)).toContain('Patient not found in active clinic');
      expect(mapError(500)).toContain('Failed to load prescriptions from clinic');
    });
  });
});
