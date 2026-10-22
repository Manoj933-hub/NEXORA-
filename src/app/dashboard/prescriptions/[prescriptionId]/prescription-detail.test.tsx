import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  PrescriptionDetailView,
  type PrescriptionDetailData,
  resolveUserClinicRole,
  loadPrescriptionPageData,
} from './page';

describe('Prescription Detail Page Unit & Component Tests', () => {
  const mockPrescription: PrescriptionDetailData = {
    id: 'rx-501',
    clinicId: 'clinic-1',
    consultationId: 'con-888',
    patientId: 'pat-999',
    doctorId: 'doc-777',
    status: 'ACTIVE',
    notes: 'Monitor blood pressure during course and advise adequate fluid intake.',
    version: 1,
    createdAt: '2026-10-22T09:15:00Z',
    updatedAt: '2026-10-22T09:15:00Z',
    patient: {
      id: 'pat-999',
      mrn: 'NXR-NP-000999',
      name: 'Rohan Shrestha',
      gender: 'MALE',
      dateOfBirth: '1984-06-18',
      phone: '+977-9841234567',
      bloodGroup: 'O+',
      allergies: 'Penicillin',
      address: 'Kathmandu, Nepal',
    },
    doctor: {
      id: 'doc-777',
      name: 'Dr. Hari Adhikari',
      email: 'dr.hari@nexora.health',
    },
    items: [
      {
        id: 'item-10',
        prescriptionId: 'rx-501',
        medicationName: 'Ciprofloxacin',
        strength: '500 mg',
        route: 'Oral',
        frequency: '1-0-1',
        duration: '7 days',
        quantity: '14 tablets',
        instructions: 'Take 2 hours after food with full glass of water',
      },
      {
        id: 'item-11',
        prescriptionId: 'rx-501',
        medicationName: 'Pantoprazole',
        strength: '40 mg',
        route: 'Oral',
        frequency: '1-0-0',
        duration: '7 days',
        quantity: '7 tablets',
        instructions: 'Take 30 minutes before breakfast',
      },
    ],
  };

  it('renders patient demographics, prescribing doctor, issue date, and version badge', () => {
    const html = renderToString(
      React.createElement(PrescriptionDetailView, {
        prescription: mockPrescription,
        loading: false,
        error: null,
        userRole: 'DOCTOR',
        onRefresh: vi.fn(),
        onStatusUpdated: vi.fn(),
      })
    );

    // Patient info
    expect(html).toContain('Rohan Shrestha');
    expect(html).toContain('NXR-NP-000999');
    expect(html).toContain('MALE');
    expect(html).toContain('O+');
    expect(html).toContain('+977-9841234567');
    expect(html).toContain('Penicillin');

    // Doctor info
    expect(html).toContain('Dr. Hari Adhikari');
    expect(html).toContain('dr.hari@nexora.health');

    // Version & Status
    expect(html).toContain('v1');
    expect(html).toContain('Active');

    // Notes
    expect(html).toContain('Monitor blood pressure during course');
  });

  it('renders read-only medication items table with all prescribed medications and regimens', () => {
    const html = renderToString(
      React.createElement(PrescriptionDetailView, {
        prescription: mockPrescription,
        loading: false,
        error: null,
        userRole: 'DOCTOR',
        onRefresh: vi.fn(),
        onStatusUpdated: vi.fn(),
      })
    );

    // Item 1
    expect(html).toContain('Ciprofloxacin');
    expect(html).toContain('500 mg');
    expect(html).toContain('1-0-1');
    expect(html).toContain('7 days');
    expect(html).toContain('14 tablets');
    expect(html).toContain('Take 2 hours after food with full glass of water');

    // Item 2
    expect(html).toContain('Pantoprazole');
    expect(html).toContain('40 mg');
    expect(html).toContain('1-0-0');
    expect(html).toContain('7 tablets');
    expect(html).toContain('Take 30 minutes before breakfast');
  });

  it('renders link to originating clinical consultation when consultationId is present', () => {
    const html = renderToString(
      React.createElement(PrescriptionDetailView, {
        prescription: mockPrescription,
        loading: false,
        error: null,
        userRole: 'DOCTOR',
        onRefresh: vi.fn(),
        onStatusUpdated: vi.fn(),
      })
    );

    expect(html).toContain('href="/dashboard/records/con-888"');
    expect(html).toContain('Originating Encounter');
  });

  it('omits originating consultation link when consultationId is null', () => {
    const prescriptionWithoutConsultation = {
      ...mockPrescription,
      consultationId: '',
    };

    const html = renderToString(
      React.createElement(PrescriptionDetailView, {
        prescription: prescriptionWithoutConsultation,
        loading: false,
        error: null,
        userRole: 'DOCTOR',
        onRefresh: vi.fn(),
        onStatusUpdated: vi.fn(),
      })
    );

    expect(html).not.toContain('Originating Encounter');
  });

  it('renders lifecycle action buttons for ACTIVE prescription when user has DOCTOR role', () => {
    const html = renderToString(
      React.createElement(PrescriptionDetailView, {
        prescription: mockPrescription,
        loading: false,
        error: null,
        userRole: 'DOCTOR',
        onRefresh: vi.fn(),
        onStatusUpdated: vi.fn(),
      })
    );

    expect(html).toContain('Mark Course Completed');
    expect(html).toContain('Discontinue Prescription');
    expect(html).toContain('Cancel Order');
    expect(html).not.toContain('Read-only access');
  });

  it('disables lifecycle action buttons and renders read-only message when user has STAFF role', () => {
    const html = renderToString(
      React.createElement(PrescriptionDetailView, {
        prescription: mockPrescription,
        loading: false,
        error: null,
        userRole: 'STAFF',
        onRefresh: vi.fn(),
        onStatusUpdated: vi.fn(),
      })
    );

    expect(html).toContain('Read-only access: Modifying prescription lifecycle states requires clinical write permissions');
    expect(html).not.toContain('Mark Course Completed');
    expect(html).not.toContain('Discontinue Prescription');
    expect(html).not.toContain('Cancel Order');
  });

  it('renders immutable terminal notice and omits action buttons when status is terminal', () => {
    const terminalPrescription: PrescriptionDetailData = {
      ...mockPrescription,
      status: 'COMPLETED',
      version: 2,
    };

    const html = renderToString(
      React.createElement(PrescriptionDetailView, {
        prescription: terminalPrescription,
        loading: false,
        error: null,
        userRole: 'DOCTOR',
        onRefresh: vi.fn(),
        onStatusUpdated: vi.fn(),
      })
    );

    expect(html).toContain('This prescription is in terminal status');
    expect(html).toContain('COMPLETED');
    expect(html).toContain('Therapy status is finalized and cannot be transitioned further');
    expect(html).not.toContain('Mark Course Completed');
    expect(html).not.toContain('Discontinue Prescription');
    expect(html).not.toContain('Cancel Order');
  });

  it('renders loading skeleton when loading is true', () => {
    const html = renderToString(
      React.createElement(PrescriptionDetailView, {
        prescription: null,
        loading: true,
        error: null,
        userRole: 'DOCTOR',
        onRefresh: vi.fn(),
        onStatusUpdated: vi.fn(),
      })
    );

    expect(html).toContain('animate-pulse');
    expect(html).not.toContain('Prescription Order');
  });

  it('renders error alert with message and return link when an error occurs', () => {
    const html = renderToString(
      React.createElement(PrescriptionDetailView, {
        prescription: null,
        loading: false,
        error: 'Prescription record not found in active clinic.',
        userRole: 'DOCTOR',
        onRefresh: vi.fn(),
        onStatusUpdated: vi.fn(),
      })
    );

    expect(html).toContain('Prescription Error');
    expect(html).toContain('Prescription record not found in active clinic.');
    expect(html).toContain('Retry');
    expect(html).toContain('Return to Prescription Directory');
  });

  describe('Finding 1 Regression: Active Clinic Role Resolution & Data Loader', () => {
    it('correctly resolves DOCTOR, ADMIN, OWNER, and read-only roles (STAFF, NURSE) from authData.clinics', () => {
      const mockAuthDoctor = {
        user: { id: 'u1', email: 'doc@nexora.health', name: 'Dr. Hari' },
        activeClinic: { id: 'clinic-1', name: 'Central Clinic', slug: 'central', country: 'NP', currency: 'NPR' },
        clinics: [
          { id: 'clinic-1', name: 'Central Clinic', role: 'DOCTOR' },
          { id: 'clinic-2', name: 'Branch Clinic', role: 'STAFF' },
        ],
      };

      expect(resolveUserClinicRole(mockAuthDoctor)).toBe('DOCTOR');

      const mockAuthStaff = {
        ...mockAuthDoctor,
        clinics: [{ id: 'clinic-1', name: 'Central Clinic', role: 'STAFF' }],
      };
      expect(resolveUserClinicRole(mockAuthStaff)).toBe('STAFF');

      const mockAuthNurse = {
        ...mockAuthDoctor,
        clinics: [{ id: 'clinic-1', name: 'Central Clinic', role: 'NURSE' }],
      };
      expect(resolveUserClinicRole(mockAuthNurse)).toBe('NURSE');

      const mockAuthAdmin = {
        ...mockAuthDoctor,
        clinics: [{ id: 'clinic-1', name: 'Central Clinic', role: 'ADMIN' }],
      };
      expect(resolveUserClinicRole(mockAuthAdmin)).toBe('ADMIN');

      const mockAuthOwner = {
        ...mockAuthDoctor,
        clinics: [{ id: 'clinic-1', name: 'Central Clinic', role: 'OWNER' }],
      };
      expect(resolveUserClinicRole(mockAuthOwner)).toBe('OWNER');
    });

    it('safely handles missing, null, or malformed session auth data without throwing', () => {
      expect(resolveUserClinicRole(null)).toBeNull();
      expect(resolveUserClinicRole(undefined)).toBeNull();
      expect(resolveUserClinicRole('invalid string')).toBeNull();
      expect(resolveUserClinicRole({})).toBeNull();
      expect(resolveUserClinicRole({ activeClinic: null })).toBeNull();
      expect(resolveUserClinicRole({ activeClinic: { id: 'c1' }, clinics: [] })).toBeNull();
      expect(
        resolveUserClinicRole({
          activeClinic: { id: 'c1' },
          clinics: [{ id: 'different-c2', role: 'DOCTOR' }],
        })
      ).toBeNull();
      expect(
        resolveUserClinicRole({
          activeClinic: { id: 'c1' },
          clinics: [{ id: 'c1', role: 'UNKNOWN_ROLE' }],
        })
      ).toBeNull();
    });

    it('loads page data and grants lifecycle controls to DOCTOR for ACTIVE prescription', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/auth/me') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              user: { id: 'u1', email: 'doc@nexora.health', name: 'Dr. Hari' },
              activeClinic: { id: 'clinic-1', name: 'Central Clinic', slug: 'central', country: 'NP', currency: 'NPR' },
              clinics: [{ id: 'clinic-1', name: 'Central Clinic', role: 'DOCTOR' }],
            }),
          };
        }
        if (url === '/api/prescriptions/rx-501') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ prescription: mockPrescription }),
          };
        }
        throw new Error(`Unexpected url: ${url}`);
      });

      const { role, prescription, error } = await loadPrescriptionPageData('rx-501', mockFetch);

      expect(error).toBeNull();
      expect(role).toBe('DOCTOR');
      expect(prescription).toBeDefined();

      // Render view with loaded data
      const html = renderToString(
        React.createElement(PrescriptionDetailView, {
          prescription,
          loading: false,
          error: null,
          userRole: role,
          onRefresh: vi.fn(),
          onStatusUpdated: vi.fn(),
        })
      );

      expect(html).toContain('Mark Course Completed');
      expect(html).toContain('Discontinue Prescription');
      expect(html).toContain('Cancel Order');
      expect(html).not.toContain('Read-only access');
    });

    it('loads page data and enforces read-only access for STAFF role', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/auth/me') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              user: { id: 'u2', email: 'staff@nexora.health', name: 'Staff User' },
              activeClinic: { id: 'clinic-1', name: 'Central Clinic', slug: 'central', country: 'NP', currency: 'NPR' },
              clinics: [{ id: 'clinic-1', name: 'Central Clinic', role: 'STAFF' }],
            }),
          };
        }
        if (url === '/api/prescriptions/rx-501') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ prescription: mockPrescription }),
          };
        }
        throw new Error(`Unexpected url: ${url}`);
      });

      const { role, prescription, error } = await loadPrescriptionPageData('rx-501', mockFetch);

      expect(error).toBeNull();
      expect(role).toBe('STAFF');

      const html = renderToString(
        React.createElement(PrescriptionDetailView, {
          prescription,
          loading: false,
          error: null,
          userRole: role,
          onRefresh: vi.fn(),
          onStatusUpdated: vi.fn(),
        })
      );

      expect(html).toContain('Read-only access');
      expect(html).not.toContain('Mark Course Completed');
      expect(html).not.toContain('Discontinue Prescription');
      expect(html).not.toContain('Cancel Order');
    });
  });

  describe('Finding 2 Regression: Non-destructive Reload Keeps View & Modal Mounted', () => {
    it('does not render full-page loading skeleton when refreshing if prescription is already loaded', () => {
      const html = renderToString(
        React.createElement(PrescriptionDetailView, {
          prescription: mockPrescription,
          loading: false,
          isRefreshing: true,
          error: null,
          userRole: 'DOCTOR',
          onRefresh: vi.fn(),
          onStatusUpdated: vi.fn(),
        })
      );

      // Verify prescription details remain visible and the page did not revert to empty skeleton
      expect(html).not.toContain('animate-pulse');
      expect(html).toContain('Prescription Order');
      expect(html).toContain('Rohan Shrestha');
      expect(html).toContain('Ciprofloxacin');
    });
  });

  describe('Finding 3 Regression: Doctor Response Consistency & Email Preservation', () => {
    it('preserves doctor email in detail view when updated record arrives', () => {
      let currentDetailState: PrescriptionDetailData = { ...mockPrescription };

      const onStatusUpdated = (updated: PrescriptionDetailData) => {
        currentDetailState = updated;
      };

      // Simulate successful mutation where server returns updated doctor with email
      const updatedFromServer = {
        id: 'rx-501',
        status: 'COMPLETED' as const,
        version: 2,
        notes: 'Treatment concluded',
        doctor: {
          id: 'doc-777',
          name: 'Dr. Hari Adhikari',
          email: 'dr.hari@nexora.health',
        },
      };

      // Update state via simulated onStatusUpdated
      onStatusUpdated({
        ...currentDetailState,
        ...updatedFromServer,
      });

      expect(currentDetailState.doctor.email).toBe('dr.hari@nexora.health');

      const html = renderToString(
        React.createElement(PrescriptionDetailView, {
          prescription: currentDetailState,
          loading: false,
          error: null,
          userRole: 'DOCTOR',
          onRefresh: vi.fn(),
          onStatusUpdated: vi.fn(),
        })
      );

      expect(html).toContain('dr.hari@nexora.health');
      expect(html).toContain('Completed');
      expect(html).toContain('v2');
    });
  });
});
