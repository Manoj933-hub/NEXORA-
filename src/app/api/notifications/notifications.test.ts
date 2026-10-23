import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as getNotificationsHandler, POST as sendNotificationHandler } from './route';
import { prisma } from '@/lib/prisma';
import * as tenantAuth from '@/lib/auth/tenant';
import * as notificationService from '@/lib/notifications/service';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notificationLog: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof tenantAuth>();
  return {
    ...actual,
    requireAuth: vi.fn(),
    requireClinicAccess: vi.fn(),
  };
});

describe('Notifications API Routes Suite (/api/notifications)', () => {
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

  describe('GET /api/notifications', () => {
    it('returns paginated notification logs scoped to active clinic', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          clinicId,
          channel: 'SMS',
          eventType: 'APPOINTMENT_BOOKED',
          recipientPhone: '+919876543210',
          messageBody: 'Appointment confirmed.',
          status: 'SENT',
          providerMessageId: 'mock_1',
          providerName: 'MOCK',
          errorMessage: null,
          sentAt: new Date(),
          deliveredAt: null,
          createdAt: new Date(),
          patient: { id: patientId, mrn: 'NX-001', name: 'Rahul Sharma', phone: '+919876543210' },
          createdBy: { id: 'user-001', name: 'Dr. Aditi', email: 'doctor@nexora.test' },
          appointmentId: null,
          prescriptionId: null,
          invoiceId: null,
          paymentId: null,
        },
      ];

      vi.mocked(prisma.notificationLog.count).mockResolvedValue(1);
      vi.mocked(prisma.notificationLog.findMany).mockResolvedValue(
        mockLogs as unknown as Awaited<ReturnType<typeof prisma.notificationLog.findMany>>
      );

      const request = new Request('http://localhost:3000/api/notifications?page=1&limit=20');
      const response = await getNotificationsHandler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.logs).toHaveLength(1);
      expect(json.logs[0].id).toBe('log-1');
      expect(json.logs[0].recipientPhone).toBe('+9198****3210');
      expect(json.logs[0].patient.phone).toBe('+9198****3210');
      expect(json.pagination.total).toBe(1);
      expect(json.clinicId).toBe(clinicId);

      expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            clinicId,
          }),
        })
      );
    });

    it('rejects unauthenticated requests with 401', async () => {
      vi.mocked(tenantAuth.requireClinicAccess).mockRejectedValue(
        new tenantAuth.AuthError('Authentication required', 401)
      );

      const request = new Request('http://localhost:3000/api/notifications');
      const response = await getNotificationsHandler(request);

      expect(response.status).toBe(401);
    });

    it('returns 400 on invalid query parameters', async () => {
      const request = new Request('http://localhost:3000/api/notifications?page=-5');
      const response = await getNotificationsHandler(request);
      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/notifications/send', () => {
    const validBody = {
      patientId,
      channel: 'SMS',
      eventType: 'APPOINTMENT_BOOKED',
      appointmentId: '123e4567-e89b-12d3-a456-426614174001',
    };

    it('rejects state-changing requests with invalid CSRF origin (403)', async () => {
      const request = new Request('http://localhost:3000/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
          origin: 'https://malicious-site.com',
        },
        body: JSON.stringify(validBody),
      });

      const response = await sendNotificationHandler(request);
      expect(response.status).toBe(403);
    });

    it('dispatches notification and returns 201 when inputs and consent are valid', async () => {
      const mockResult = {
        success: true,
        notificationId: 'log-123',
        status: 'SENT' as const,
        recipientPhone: '+919876543210',
        channel: 'SMS' as const,
      };

      vi.spyOn(notificationService, 'dispatchPatientNotification').mockResolvedValue(mockResult);

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
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.message).toBe('Notification processed successfully');
      expect(json.notification.success).toBe(true);
      expect(json.notification.notificationId).toBe('log-123');
    });

    it('returns 400 when validation fails (invalid UUID / missing required field)', async () => {
      const request = new Request('http://localhost:3000/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({
          patientId: 'not-a-uuid',
          channel: 'SMS',
          eventType: 'APPOINTMENT_BOOKED',
        }),
      });

      const response = await sendNotificationHandler(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe('Validation failed');
    });

    it('maps consent denial to 403 Forbidden with CONSENT_DENIED code', async () => {
      vi.spyOn(notificationService, 'dispatchPatientNotification').mockRejectedValue(
        new notificationService.NotificationServiceError(
          'Patient has not provided consent for SMS notifications',
          403,
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
        body: JSON.stringify(validBody),
      });

      const response = await sendNotificationHandler(request);
      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.code).toBe('CONSENT_DENIED');
      expect(json.error).toContain('consent');
    });

    it('maps rate limit exceeded to 429 Too Many Requests', async () => {
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
});
