import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH as updateAppointmentHandler } from './[appointmentId]/route';
import { prisma } from '@/lib/prisma';
import * as tenantAuth from '@/lib/auth/tenant';
import * as workflowTriggers from '@/lib/notifications/workflow-triggers';
import { AppointmentStatus } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    appointment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof tenantAuth>();
  return {
    ...actual,
    requireClinicAccess: vi.fn(),
  };
});

vi.mock('@/lib/notifications/workflow-triggers', () => ({
  notifyAppointmentRescheduled: vi.fn(),
  notifyAppointmentCancelled: vi.fn(),
}));

describe('Appointment Reschedule Notification Semantics (Regression Tests)', () => {
  const clinicId = 'clinic-alpha-999';
  const appointmentId = 'apt-12345';
  const patientId = 'pat-54321';
  const doctorId = 'doc-67890';
  const userId = 'user-staff-1';

  const mockContext = {
    user: { id: userId, email: 'reception@nexora.test' },
    clinic: { id: clinicId, name: 'Apollo Health' },
    membership: { id: 'mem-1', role: 'RECEPTIONIST' },
    role: 'RECEPTIONIST',
  };

  const persistedStartTime = new Date('2026-11-01T10:00:00.000Z');
  const persistedEndTime = new Date('2026-11-01T10:30:00.000Z');

  const baseAppointment = {
    id: appointmentId,
    clinicId,
    patientId,
    doctorId,
    startTime: persistedStartTime,
    endTime: persistedEndTime,
    status: AppointmentStatus.SCHEDULED,
    reason: 'Initial checkup',
    notes: 'Patient requested morning',
    cancelledReason: null,
    checkedInAt: null,
    inProgressAt: null,
    completedAt: null,
    createdAt: new Date('2026-10-20T10:00:00Z'),
    updatedAt: new Date('2026-10-20T10:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tenantAuth.requireClinicAccess).mockResolvedValue(
      mockContext as unknown as tenantAuth.TenantContext
    );
  });

  it('does NOT dispatch reschedule notification when startTime and endTime are identical to persisted times', async () => {
    vi.mocked(prisma.appointment.findFirst)
      .mockResolvedValueOnce(baseAppointment) // initial fetch
      .mockResolvedValueOnce(null); // conflict check returns no conflict

    vi.mocked(prisma.appointment.update).mockResolvedValue({
      ...baseAppointment,
      reason: 'Updated reason without changing time',
      patient: { id: patientId, mrn: 'MRN-001', name: 'John Doe', phone: '+977-9841234567' },
      doctor: { id: doctorId, name: 'Dr. Suresh', email: 'suresh@nexora.test' },
    } as unknown as Awaited<ReturnType<typeof prisma.appointment.update>>);

    const request = new Request(`http://localhost:3000/api/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-clinic-id': clinicId },
      body: JSON.stringify({
        startTime: '2026-11-01T10:00:00.000Z',
        endTime: '2026-11-01T10:30:00.000Z',
        reason: 'Updated reason without changing time',
      }),
    });

    const params = Promise.resolve({ appointmentId });
    const response = await updateAppointmentHandler(request, { params });

    expect(response.status).toBe(200);
    expect(workflowTriggers.notifyAppointmentRescheduled).not.toHaveBeenCalled();
  });

  it('dispatches reschedule notification when there is a genuine start time change', async () => {
    vi.mocked(prisma.appointment.findFirst)
      .mockResolvedValueOnce(baseAppointment) // initial fetch
      .mockResolvedValueOnce(null); // conflict check returns no conflict

    const newStartTime = new Date('2026-11-01T11:00:00.000Z');
    const newEndTime = new Date('2026-11-01T11:30:00.000Z');

    vi.mocked(prisma.appointment.update).mockResolvedValue({
      ...baseAppointment,
      startTime: newStartTime,
      endTime: newEndTime,
      patient: { id: patientId, mrn: 'MRN-001', name: 'John Doe', phone: '+977-9841234567' },
      doctor: { id: doctorId, name: 'Dr. Suresh', email: 'suresh@nexora.test' },
    } as unknown as Awaited<ReturnType<typeof prisma.appointment.update>>);

    const request = new Request(`http://localhost:3000/api/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-clinic-id': clinicId },
      body: JSON.stringify({
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString(),
      }),
    });

    const params = Promise.resolve({ appointmentId });
    const response = await updateAppointmentHandler(request, { params });

    expect(response.status).toBe(200);
    expect(workflowTriggers.notifyAppointmentRescheduled).toHaveBeenCalledTimes(1);
    expect(workflowTriggers.notifyAppointmentRescheduled).toHaveBeenCalledWith({
      clinicId,
      patientId,
      appointmentId,
      createdById: userId,
    });
  });

  it('dispatches reschedule notification when start time is unchanged but end time changes', async () => {
    vi.mocked(prisma.appointment.findFirst)
      .mockResolvedValueOnce(baseAppointment) // initial fetch
      .mockResolvedValueOnce(null); // conflict check

    const extendedEndTime = new Date('2026-11-01T10:45:00.000Z');

    vi.mocked(prisma.appointment.update).mockResolvedValue({
      ...baseAppointment,
      endTime: extendedEndTime,
      patient: { id: patientId, mrn: 'MRN-001', name: 'John Doe', phone: '+977-9841234567' },
      doctor: { id: doctorId, name: 'Dr. Suresh', email: 'suresh@nexora.test' },
    } as unknown as Awaited<ReturnType<typeof prisma.appointment.update>>);

    const request = new Request(`http://localhost:3000/api/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-clinic-id': clinicId },
      body: JSON.stringify({
        startTime: persistedStartTime.toISOString(),
        endTime: extendedEndTime.toISOString(),
      }),
    });

    const params = Promise.resolve({ appointmentId });
    const response = await updateAppointmentHandler(request, { params });

    expect(response.status).toBe(200);
    expect(workflowTriggers.notifyAppointmentRescheduled).toHaveBeenCalledTimes(1);
  });

  it('does NOT dispatch reschedule notification for status transitions (e.g. CHECKED_IN)', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValueOnce(baseAppointment);

    vi.mocked(prisma.appointment.update).mockResolvedValue({
      ...baseAppointment,
      status: AppointmentStatus.CHECKED_IN,
      patient: { id: patientId, mrn: 'MRN-001', name: 'John Doe', phone: '+977-9841234567' },
      doctor: { id: doctorId, name: 'Dr. Suresh', email: 'suresh@nexora.test' },
    } as unknown as Awaited<ReturnType<typeof prisma.appointment.update>>);

    const request = new Request(`http://localhost:3000/api/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-clinic-id': clinicId },
      body: JSON.stringify({
        status: AppointmentStatus.CHECKED_IN,
      }),
    });

    const params = Promise.resolve({ appointmentId });
    const response = await updateAppointmentHandler(request, { params });

    expect(response.status).toBe(200);
    expect(workflowTriggers.notifyAppointmentRescheduled).not.toHaveBeenCalled();
    expect(workflowTriggers.notifyAppointmentCancelled).not.toHaveBeenCalled();
  });
});
