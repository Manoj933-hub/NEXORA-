import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as sendNotificationHandler } from './route';
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

describe('POST /api/notifications/send Route Handler Suite', () => {
  const clinicId = 'clinic-alpha-123';
  const patientId = '123e4567-e89b-12d3-a456-426614174000';

  const mockUser = {
    id: 'user-001',
    email: 'doctor@nexora.test',
    name: 'Dr. Aditi',
  };

  const mockClinic = {
    id: clinicId,
    name: 'Apollo Care',
    slug: 'apollo-care',
  };

  const mockTenantContext = {
    user: mockUser,
    session: { id: 'sess-1', activeClinicId: clinicId },
    clinic: mockClinic,
    membership: { id: 'mem-1', role: 'DOCTOR' },
    role: 'DOCTOR',
  };

  const validBody = {
    patientId,
    channel: 'SMS',
    eventType: 'APPOINTMENT_BOOKED',
    appointmentId: '123e4567-e89b-12d3-a456-426614174001',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tenantAuth.requireAuth).mockResolvedValue({
      user: mockUser,
      session: { id: 'sess-1', activeClinicId: clinicId },
      activeClinic: mockClinic,
    } as unknown as Awaited<ReturnType<typeof tenantAuth.requireAuth>>);
    vi.mocked(tenantAuth.requireClinicAccess).mockResolvedValue(
      mockTenantContext as unknown as tenantAuth.TenantContext
    );
  });

  it('rejects state-changing requests with invalid CSRF origin (403)', async () => {
    const request = new Request('http://localhost:3000/api/notifications/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: 'localhost:3000',
        origin: 'https://malicious-website.com',
      },
      body: JSON.stringify(validBody),
    });

    const response = await sendNotificationHandler(request);
    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toMatch(/origin/i);
  });

  it('rejects unauthenticated requests with 401', async () => {
    vi.mocked(tenantAuth.requireClinicAccess).mockRejectedValue(
      new tenantAuth.AuthError('Authentication required', 401)
    );

    const request = new Request('http://localhost:3000/api/notifications/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify(validBody),
    });

    const response = await sendNotificationHandler(request);
    expect(response.status).toBe(401);
  });

  it('rejects users lacking patients:write permission (e.g. unauthorized role)', async () => {
    vi.mocked(tenantAuth.requireClinicAccess).mockRejectedValue(
      new tenantAuth.AuthError('Forbidden: Insufficient clinic permissions', 403)
    );

    const request = new Request('http://localhost:3000/api/notifications/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify(validBody),
    });

    const response = await sendNotificationHandler(request);
    expect(response.status).toBe(403);
  });

  it('returns 400 when request body fails Zod schema validation', async () => {
    const request = new Request('http://localhost:3000/api/notifications/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({ patientId: 'not-a-uuid' }),
    });

    const response = await sendNotificationHandler(request);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Validation failed');
  });

  it('dispatches notification and returns 201 when caller is authorized', async () => {
    const dispatchSpy = vi
      .spyOn(notificationService, 'dispatchPatientNotification')
      .mockResolvedValue({
        success: true,
        notificationId: 'log-new-1',
        status: 'SENT',
        recipientPhone: '+919876543210',
        channel: 'SMS',
      });

    const request = new Request('http://localhost:3000/api/notifications/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify(validBody),
    });

    const response = await sendNotificationHandler(request);
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.message).toBe('Notification processed successfully');
    expect(json.notification.success).toBe(true);
    expect(json.notification.notificationId).toBe('log-new-1');

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId,
        patientId: validBody.patientId,
        channel: 'SMS',
        eventType: 'APPOINTMENT_BOOKED',
        appointmentId: validBody.appointmentId,
        createdById: 'user-001',
      })
    );
  });

  it('maps NotificationServiceError to corresponding HTTP status code (429, 403, 404)', async () => {
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
      body: JSON.stringify(validBody),
    });

    const response = await sendNotificationHandler(request);
    expect(response.status).toBe(429);
    const json = await response.json();
    expect(json.code).toBe('PATIENT_RATE_LIMIT_EXCEEDED');
  });
});
