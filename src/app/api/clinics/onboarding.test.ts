import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { GET as listClinicsHandler, POST as createClinicHandler } from './route';
import { PATCH as updateClinicHandler } from './[clinicId]/route';
import { POST as switchClinicHandler } from '@/app/api/auth/switch-clinic/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { ClinicRole } from '@/lib/auth/permissions';

describe('Task 003: Clinic Onboarding, Selection & Profile Management Tests', () => {
  let doctorUser: { id: string; email: string };
  let staffUser: { id: string; email: string };
  let foreignUser: { id: string; email: string };

  let doctorToken: string;
  let staffToken: string;
  let foreignToken: string;

  let createdClinicId: string;
  let secondaryClinicId: string;

  beforeAll(async () => {
    // Clean up test records
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'onboarding.doctor@nexora.test',
            'onboarding.staff@nexora.test',
            'onboarding.foreign@nexora.test',
          ],
        },
      },
    });

    // Create test doctor user
    doctorUser = await prisma.user.create({
      data: {
        email: 'onboarding.doctor@nexora.test',
        name: 'Dr. Onboarding Test',
        passwordHash: '$2a$12$fakehashforonboardingtesting123456789012345678901234567890',
      },
    });

    // Create test staff user
    staffUser = await prisma.user.create({
      data: {
        email: 'onboarding.staff@nexora.test',
        name: 'Staff Member Test',
        passwordHash: '$2a$12$fakehashforonboardingtesting123456789012345678901234567890',
      },
    });

    // Create foreign user
    foreignUser = await prisma.user.create({
      data: {
        email: 'onboarding.foreign@nexora.test',
        name: 'Foreign Doctor',
        passwordHash: '$2a$12$fakehashforonboardingtesting123456789012345678901234567890',
      },
    });

    // Create sessions
    const docSession = await createSession(doctorUser.id);
    doctorToken = docSession.rawToken;

    const staffSession = await createSession(staffUser.id);
    staffToken = staffSession.rawToken;

    const foreignSession = await createSession(foreignUser.id);
    foreignToken = foreignSession.rawToken;
  });

  afterAll(async () => {
    // Clean up created data
    if (createdClinicId || secondaryClinicId) {
      await prisma.clinic.deleteMany({
        where: {
          id: { in: [createdClinicId, secondaryClinicId].filter(Boolean) },
        },
      });
    }

    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'onboarding.doctor@nexora.test',
            'onboarding.staff@nexora.test',
            'onboarding.foreign@nexora.test',
          ],
        },
      },
    });
  });

  describe('POST /api/clinics (Clinic Onboarding)', () => {
    it('creates a new clinic, assigns OWNER role to user, and sets session activeClinicId', async () => {
      const req = new Request('http://localhost:3000/api/clinics', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorToken}`,
        },
        body: JSON.stringify({
          name: 'Himalayan Health Center',
          country: 'NP',
          currency: 'NPR',
          phone: '+977 9841234567',
          address: 'Lakeside Ward 6, Pokhara',
        }),
      });

      const res = await createClinicHandler(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.clinic).toBeDefined();
      expect(data.clinic.name).toBe('Himalayan Health Center');
      expect(data.clinic.country).toBe('NP');
      expect(data.clinic.currency).toBe('NPR');
      expect(data.clinic.role).toBe(ClinicRole.OWNER);

      createdClinicId = data.clinic.id;

      // Verify database record
      const membership = await prisma.membership.findUnique({
        where: {
          userId_clinicId: {
            userId: doctorUser.id,
            clinicId: createdClinicId,
          },
        },
      });
      expect(membership).toBeDefined();
      expect(membership?.role).toBe(ClinicRole.OWNER);
      expect(membership?.isActive).toBe(true);

      // Verify session activeClinicId was updated
      const session = await prisma.session.findFirst({
        where: { userId: doctorUser.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(session?.activeClinicId).toBe(createdClinicId);
    });

    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const req = new Request('http://localhost:3000/api/clinics', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Unauth Clinic',
          country: 'IN',
          currency: 'INR',
        }),
      });

      const res = await createClinicHandler(req);
      expect(res.status).toBe(401);
    });

    it('rejects invalid inputs with 400 Bad Request', async () => {
      const req = new Request('http://localhost:3000/api/clinics', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorToken}`,
        },
        body: JSON.stringify({
          name: '', // Empty name fails validation
          country: 'INVALID_COUNTRY',
          currency: 'USD',
        }),
      });

      const res = await createClinicHandler(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Validation failed');
      expect(data.details).toBeDefined();
    });

    it('rejects cross-origin requests with 403 Forbidden', async () => {
      const req = new Request('http://localhost:3000/api/clinics', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'https://malicious-site.com',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorToken}`,
        },
        body: JSON.stringify({
          name: 'Valid Clinic',
          country: 'IN',
          currency: 'INR',
        }),
      });

      const res = await createClinicHandler(req);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/clinics (List User Clinics)', () => {
    it('returns all active clinics the user belongs to', async () => {
      // Create a second clinic for doctorUser
      const secReq = new Request('http://localhost:3000/api/clinics', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorToken}`,
        },
        body: JSON.stringify({
          name: 'Delhi Metro Medical Clinic',
          country: 'IN',
          currency: 'INR',
          phone: '+91 9811223344',
          address: 'Connaught Place, New Delhi',
        }),
      });

      const secRes = await createClinicHandler(secReq);
      const secData = await secRes.json();
      expect(secRes.status).toBe(201);
      secondaryClinicId = secData.clinic.id;

      // Query GET /api/clinics
      const getReq = new Request('http://localhost:3000/api/clinics', {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${doctorToken}`,
        },
      });

      const res = await listClinicsHandler(getReq);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(Array.isArray(data.clinics)).toBe(true);
      expect(data.clinics.length).toBeGreaterThanOrEqual(2);

      const clinicIds = data.clinics.map((c: { id: string }) => c.id);
      expect(clinicIds).toContain(createdClinicId);
      expect(clinicIds).toContain(secondaryClinicId);
    });
  });

  describe('PATCH /api/clinics/[clinicId] (Clinic Profile Updates & RBAC)', () => {
    beforeAll(async () => {
      // Add staffUser as STAFF to createdClinicId
      await prisma.membership.create({
        data: {
          userId: staffUser.id,
          clinicId: createdClinicId,
          role: ClinicRole.STAFF,
          isActive: true,
        },
      });
    });

    it('allows OWNER to update clinic profile details', async () => {
      const req = new Request(`http://localhost:3000/api/clinics/${createdClinicId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorToken}`,
        },
        body: JSON.stringify({
          name: 'Himalayan Care Specialty Hospital',
          phone: '+977 9851122334',
          address: 'Lakeside North, Pokhara 33700',
        }),
      });

      const res = await updateClinicHandler(req, {
        params: Promise.resolve({ clinicId: createdClinicId }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.clinic.name).toBe('Himalayan Care Specialty Hospital');
      expect(data.clinic.phone).toBe('+977 9851122334');
      expect(data.clinic.address).toBe('Lakeside North, Pokhara 33700');
    });

    it('rejects updates from roles without clinic:update permission (e.g. STAFF) with 403 Forbidden', async () => {
      const req = new Request(`http://localhost:3000/api/clinics/${createdClinicId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${staffToken}`,
        },
        body: JSON.stringify({
          name: 'Unauthorized Rename Attempt',
        }),
      });

      const res = await updateClinicHandler(req, {
        params: Promise.resolve({ clinicId: createdClinicId }),
      });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain("Insufficient permissions: Role STAFF does not have 'clinic:update'");
    });

    it('rejects updates from non-members with 403 Forbidden', async () => {
      const req = new Request(`http://localhost:3000/api/clinics/${createdClinicId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${foreignToken}`,
        },
        body: JSON.stringify({
          name: 'Hacker Takeover Clinic',
        }),
      });

      const res = await updateClinicHandler(req, {
        params: Promise.resolve({ clinicId: createdClinicId }),
      });

      expect(res.status).toBe(403);
    });

    it('rejects invalid fields on update with 400 Bad Request', async () => {
      const req = new Request(`http://localhost:3000/api/clinics/${createdClinicId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorToken}`,
        },
        body: JSON.stringify({
          phone: 'not-a-valid-phone-number-format-1234567890123456789012345',
        }),
      });

      const res = await updateClinicHandler(req, {
        params: Promise.resolve({ clinicId: createdClinicId }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Validation failed');
    });
  });

  describe('POST /api/auth/switch-clinic (Multi-Clinic Context Switching)', () => {
    it('successfully switches active clinic context for authorized memberships', async () => {
      const req = new Request('http://localhost:3000/api/auth/switch-clinic', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorToken}`,
        },
        body: JSON.stringify({
          clinicId: secondaryClinicId,
        }),
      });

      const res = await switchClinicHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.activeClinic.id).toBe(secondaryClinicId);

      // Verify in session table
      const session = await prisma.session.findFirst({
        where: { userId: doctorUser.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(session?.activeClinicId).toBe(secondaryClinicId);
    });

    it('strictly rejects switching to a clinic where user has NO membership', async () => {
      const req = new Request('http://localhost:3000/api/auth/switch-clinic', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${foreignToken}`,
        },
        body: JSON.stringify({
          clinicId: createdClinicId, // Foreign user has no membership here
        }),
      });

      const res = await switchClinicHandler(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('Access denied');
    });
  });
});
