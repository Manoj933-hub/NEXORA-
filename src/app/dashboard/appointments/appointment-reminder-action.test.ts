import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as sendNotificationHandler } from '@/app/api/notifications/send/route';
import * as tenantAuth from '@/lib/auth/tenant';
import * as notificationService from '@/lib/notifications/service';

vi.mock('@/lib/prisma', () => ({
  prisma: {},
}));

vi.mock('@/lib/auth/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof tenantAuth>();
  return {
    ...actual,
    requireAuth: vi.fn(),
    requireClinicAccess: vi.fn(),
  };
});

describe('Front-Desk Manual Appointment Reminder Action Tests', () => {
  const clinicId = 'clinic-alpha-123';
  const patientId = '123e4567-e89b-12d3-a456-426614174000';
  const appointmentId = '123e4567-e89b-12d3-a456-426614174001';
  const staffUserId = 'user-staff-777';

  const mockStaffContext = {
    user: { id: staffUserId, email: 'reception@nexora.test', name: 'Receptionist Kopila' },
    session: { id: 'sess-1', activeClinicId: clinicId },
    clinic: { id: clinicId, name: 'Apollo Care', slug: 'apollo-care' },
    membership: { id: 'mem-1', role: 'RECEPTIONIST' },
    role: 'RECEPTIONIST',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tenantAuth.requireAuth).mockResolvedValue({
      user: mockStaffContext.user,
      session: mockStaffContext.session,
      activeClinic: mockStaffContext.clinic,
    } as unknown as Awaited<ReturnType<typeof tenantAuth.requireAuth>>);
    vi.mocked(tenantAuth.requireClinicAccess).mockResolvedValue(
      mockStaffContext as unknown as tenantAuth.TenantContext
    );
  });

  it('successfully dispatches manual appointment reminder via existing notification service', async () => {
    const dispatchSpy = vi
      .spyOn(notificationService, 'dispatchPatientNotification')
      .mockResolvedValue({
        success: true,
        notificationId: 'log-remind-001',
        recipientPhone: '+977-98****3456',
        channel: 'WHATSAPP',
        status: 'SENT',
      });

    const request = new Request('http://localhost:3000/api/notifications/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        patientId,
        appointmentId,
        channel: 'WHATSAPP',
        eventType: 'APPOINTMENT_REMINDER',
      }),
    });

    const response = await sendNotificationHandler(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.notification.success).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId,
        patientId,
        channel: 'WHATSAPP',
        eventType: 'APPOINTMENT_REMINDER',
        appointmentId,
        createdById: staffUserId,
      })
    );
  });

  it('truthfully reports duplicate suppression to front desk without error', async () => {
    vi.spyOn(notificationService, 'dispatchPatientNotification').mockRejectedValue(
      new notificationService.NotificationServiceError(
        'Notification suppressed: identical notification already dispatched within the last 5 minutes',
        429,
        'DUPLICATE_SUPPRESSED'
      )
    );

    const request = new Request('http://localhost:3000/api/notifications/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        patientId,
        appointmentId,
        channel: 'WHATSAPP',
        eventType: 'APPOINTMENT_REMINDER',
      }),
    });

    const response = await sendNotificationHandler(request);
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.code).toBe('DUPLICATE_SUPPRESSED');
    expect(json.error).toMatch(/suppressed/i);
  });

  it('truthfully reports missing consent to front desk (does not bypass consent for manual actions)', async () => {
    vi.spyOn(notificationService, 'dispatchPatientNotification').mockRejectedValue(
      new notificationService.NotificationServiceError(
        'Patient has not opted in to SMS messages',
        400,
        'CONSENT_DENIED'
      )
    );

    const request = new Request('http://localhost:3000/api/notifications/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        patientId,
        appointmentId,
        channel: 'SMS',
        eventType: 'APPOINTMENT_REMINDER',
      }),
    });

    const response = await sendNotificationHandler(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe('CONSENT_DENIED');
  });

  it('truthfully reports patient hourly rate limit exceeded (maximum 3/hr)', async () => {
    vi.spyOn(notificationService, 'dispatchPatientNotification').mockRejectedValue(
      new notificationService.NotificationServiceError(
        'Hourly rate limit exceeded: maximum 3 notifications allowed per patient per hour',
        429,
        'PATIENT_RATE_LIMIT_EXCEEDED'
      )
    );

    const request = new Request('http://localhost:3000/api/notifications/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        patientId,
        appointmentId,
        channel: 'WHATSAPP',
        eventType: 'APPOINTMENT_REMINDER',
      }),
    });

    const response = await sendNotificationHandler(request);
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.code).toBe('PATIENT_RATE_LIMIT_EXCEEDED');
  });
});
