import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as getSettingsHandler, PATCH as updateSettingsHandler } from './route';
import { prisma } from '@/lib/prisma';
import * as tenantAuth from '@/lib/auth/tenant';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clinicNotificationSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
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

describe('Clinic Notification Settings API (/api/clinics/[clinicId]/notification-settings)', () => {
  const clinicId = 'clinic-alpha-123';

  const mockAdminContext = {
    user: { id: 'admin-1', email: 'admin@nexora.test' },
    clinic: { id: clinicId, name: 'Apollo Care' },
    membership: { id: 'mem-1', role: 'ADMIN' },
    role: 'ADMIN',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    it('returns clinic notification settings when user has clinic:read permission', async () => {
      vi.mocked(tenantAuth.requireClinicAccess).mockResolvedValue(
        mockAdminContext as unknown as tenantAuth.TenantContext
      );
      vi.mocked(prisma.clinicNotificationSetting.findUnique).mockResolvedValue({
        id: 'set-1',
        clinicId,
        smsEnabled: true,
        whatsappEnabled: false,
        appointmentAlerts: true,
        prescriptionAlerts: true,
        billingAlerts: true,
        senderName: 'Apollo Alert',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new Request(
        `http://localhost:3000/api/clinics/${clinicId}/notification-settings`
      );
      const params = Promise.resolve({ clinicId });

      const response = await getSettingsHandler(request, { params });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.settings.smsEnabled).toBe(true);
      expect(json.settings.whatsappEnabled).toBe(false);
      expect(json.settings.senderName).toBe('Apollo Alert');
    });

    it('returns default settings when clinic has not configured settings yet', async () => {
      vi.mocked(tenantAuth.requireClinicAccess).mockResolvedValue(
        mockAdminContext as unknown as tenantAuth.TenantContext
      );
      vi.mocked(prisma.clinicNotificationSetting.findUnique).mockResolvedValue(null);

      const request = new Request(
        `http://localhost:3000/api/clinics/${clinicId}/notification-settings`
      );
      const params = Promise.resolve({ clinicId });

      const response = await getSettingsHandler(request, { params });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.settings.smsEnabled).toBe(true);
      expect(json.settings.whatsappEnabled).toBe(true);
      expect(json.settings.senderName).toBeNull();
    });

    it('rejects unauthenticated requests with 401', async () => {
      vi.mocked(tenantAuth.requireClinicAccess).mockRejectedValue(
        new tenantAuth.AuthError('Authentication required', 401)
      );

      const request = new Request(
        `http://localhost:3000/api/clinics/${clinicId}/notification-settings`
      );
      const params = Promise.resolve({ clinicId });

      const response = await getSettingsHandler(request, { params });
      expect(response.status).toBe(401);
    });
  });

  describe('PATCH', () => {
    it('rejects update when CSRF origin check fails (403)', async () => {
      const request = new Request(
        `http://localhost:3000/api/clinics/${clinicId}/notification-settings`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            host: 'localhost:3000',
            origin: 'https://evil-site.com',
          },
          body: JSON.stringify({ smsEnabled: false }),
        }
      );
      const params = Promise.resolve({ clinicId });

      const response = await updateSettingsHandler(request, { params });
      expect(response.status).toBe(403);
    });

    it('rejects update when user lacks clinic:update permission (e.g. STAFF role)', async () => {
      vi.mocked(tenantAuth.requireClinicAccess).mockRejectedValue(
        new tenantAuth.AuthError('Forbidden: Insufficient clinic permissions', 403)
      );

      const request = new Request(
        `http://localhost:3000/api/clinics/${clinicId}/notification-settings`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
          },
          body: JSON.stringify({ smsEnabled: false }),
        }
      );
      const params = Promise.resolve({ clinicId });

      const response = await updateSettingsHandler(request, { params });
      expect(response.status).toBe(403);
    });

    it('updates notification settings and returns 200 when caller is OWNER or ADMIN', async () => {
      vi.mocked(tenantAuth.requireClinicAccess).mockResolvedValue(
        mockAdminContext as unknown as tenantAuth.TenantContext
      );
      vi.mocked(prisma.clinicNotificationSetting.upsert).mockResolvedValue({
        id: 'set-1',
        clinicId,
        smsEnabled: false,
        whatsappEnabled: true,
        appointmentAlerts: true,
        prescriptionAlerts: true,
        billingAlerts: true,
        senderName: 'Apollo Care',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new Request(
        `http://localhost:3000/api/clinics/${clinicId}/notification-settings`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
          },
          body: JSON.stringify({ smsEnabled: false, senderName: 'Apollo Care' }),
        }
      );
      const params = Promise.resolve({ clinicId });

      const response = await updateSettingsHandler(request, { params });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.message).toBe('Clinic notification settings updated successfully');
      expect(json.settings.smsEnabled).toBe(false);
      expect(json.settings.senderName).toBe('Apollo Care');
    });

    it('returns 400 when payload is empty or invalid', async () => {
      vi.mocked(tenantAuth.requireClinicAccess).mockResolvedValue(
        mockAdminContext as unknown as tenantAuth.TenantContext
      );

      const request = new Request(
        `http://localhost:3000/api/clinics/${clinicId}/notification-settings`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
          },
          body: JSON.stringify({}), // empty
        }
      );
      const params = Promise.resolve({ clinicId });

      const response = await updateSettingsHandler(request, { params });
      expect(response.status).toBe(400);
    });
  });
});
