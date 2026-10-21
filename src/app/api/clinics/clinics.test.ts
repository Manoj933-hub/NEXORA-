import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { GET as getClinicHandler } from './[clinicId]/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { requireClinicAccess, AuthError } from '@/lib/auth/tenant';
import { ClinicRole } from '@/lib/auth/permissions';

describe('Tenant Isolation & Cross-Clinic Access Tests', () => {
  let userAId: string;
  let userAToken: string;
  let clinicAId: string;
  let clinicBId: string;
  let clinicCId: string;

  beforeAll(async () => {
    // Clean up past runs
    await prisma.user.deleteMany({
      where: { email: { in: ['usera@nexora.test', 'userb@nexora.test'] } },
    });

    // Create User A
    const userA = await prisma.user.create({
      data: {
        email: 'usera@nexora.test',
        name: 'Dr. User A',
        passwordHash: '$2a$12$fakehashfortesting123456789012345678901234567890',
      },
    });
    userAId = userA.id;

    // Create User B
    const userB = await prisma.user.create({
      data: {
        email: 'userb@nexora.test',
        name: 'Dr. User B',
        passwordHash: '$2a$12$fakehashfortesting123456789012345678901234567890',
      },
    });

    // Create Clinic A (User A is OWNER)
    const clinicA = await prisma.clinic.create({
      data: {
        name: 'Clinic A (Authorized)',
        slug: `clinic-a-${Date.now()}`,
        country: 'IN',
        currency: 'INR',
      },
    });
    clinicAId = clinicA.id;

    await prisma.membership.create({
      data: {
        userId: userAId,
        clinicId: clinicAId,
        role: 'OWNER',
        isActive: true,
      },
    });

    // Create Clinic B (User B is OWNER, User A is NOT a member)
    const clinicB = await prisma.clinic.create({
      data: {
        name: 'Clinic B (Foreign Tenant)',
        slug: `clinic-b-${Date.now()}`,
        country: 'NP',
        currency: 'NPR',
      },
    });
    clinicBId = clinicB.id;

    await prisma.membership.create({
      data: {
        userId: userB.id,
        clinicId: clinicBId,
        role: 'OWNER',
        isActive: true,
      },
    });

    // Create Clinic C (User A is member, but membership is DEACTIVATED)
    const clinicC = await prisma.clinic.create({
      data: {
        name: 'Clinic C (Deactivated Membership)',
        slug: `clinic-c-${Date.now()}`,
        country: 'IN',
        currency: 'INR',
      },
    });
    clinicCId = clinicC.id;

    await prisma.membership.create({
      data: {
        userId: userAId,
        clinicId: clinicCId,
        role: 'DOCTOR',
        isActive: false, // Inactive
      },
    });

    // Create active session for User A
    const { rawToken } = await createSession(userAId, clinicAId);
    userAToken = rawToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: ['usera@nexora.test', 'userb@nexora.test'] } },
    });
    await prisma.clinic.deleteMany({
      where: { id: { in: [clinicAId, clinicBId, clinicCId] } },
    });
  });

  it('allows access to clinic where user holds an active membership', async () => {
    const req = new Request(`http://localhost:3000/api/clinics/${clinicAId}`, {
      method: 'GET',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userAToken}`,
      },
    });

    const res = await getClinicHandler(req, {
      params: Promise.resolve({ clinicId: clinicAId }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.clinic.id).toBe(clinicAId);
    expect(data.membership.role).toBe('OWNER');
    expect(data.membership.isActive).toBe(true);
    expect(data.stats.totalActiveMembers).toBe(1);
  });

  it('strictly blocks cross-clinic access when user is NOT a member (403 Forbidden)', async () => {
    // User A attempts to inspect Clinic B
    const req = new Request(`http://localhost:3000/api/clinics/${clinicBId}`, {
      method: 'GET',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userAToken}`,
      },
    });

    const res = await getClinicHandler(req, {
      params: Promise.resolve({ clinicId: clinicBId }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain('Access denied');
    expect(data.clinic).toBeUndefined();
  });

  it('strictly blocks access when user membership in that clinic is inactive (403 Forbidden)', async () => {
    // User A attempts to inspect Clinic C where membership isActive = false
    const req = new Request(`http://localhost:3000/api/clinics/${clinicCId}`, {
      method: 'GET',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userAToken}`,
      },
    });

    const res = await getClinicHandler(req, {
      params: Promise.resolve({ clinicId: clinicCId }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain('Access denied');
  });

  it('blocks unauthenticated access to clinic endpoints with 401 Unauthorized', async () => {
    const req = new Request(`http://localhost:3000/api/clinics/${clinicAId}`, {
      method: 'GET',
    });

    const res = await getClinicHandler(req, {
      params: Promise.resolve({ clinicId: clinicAId }),
    });

    expect(res.status).toBe(401);
  });

  it('enforces requiredRole and rejects role lower than required', async () => {
    // Add user A to a clinic as RECEPTIONIST
    const clinicRoleTest = await prisma.clinic.create({
      data: {
        name: 'Role Test Clinic',
        slug: `role-test-clinic-${Date.now()}`,
      },
    });

    await prisma.membership.create({
      data: {
        userId: userAId,
        clinicId: clinicRoleTest.id,
        role: ClinicRole.RECEPTIONIST,
        isActive: true,
      },
    });

    const req = new Request(`http://localhost:3000/api/clinics/${clinicRoleTest.id}`, {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userAToken}`,
      },
    });

    // Attempt access requiring ADMIN role (RECEPTIONIST is lower than ADMIN)
    await expect(
      requireClinicAccess(req, clinicRoleTest.id, { requiredRole: ClinicRole.ADMIN })
    ).rejects.toThrowError(AuthError);

    try {
      await requireClinicAccess(req, clinicRoleTest.id, { requiredRole: ClinicRole.ADMIN });
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      const authErr = err as AuthError;
      expect(authErr.statusCode).toBe(403);
      expect(authErr.message).toContain('is lower than required role');
    }

    // Cleanup
    await prisma.clinic.delete({ where: { id: clinicRoleTest.id } });
  });

  it('accepts qualifying or superior role when requiredRole is supplied', async () => {
    const req = new Request(`http://localhost:3000/api/clinics/${clinicAId}`, {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userAToken}`,
      },
    });

    // User A is OWNER in Clinic A, which qualifies for ADMIN requirement (OWNER >= ADMIN)
    const context = await requireClinicAccess(req, clinicAId, {
      requiredRole: ClinicRole.ADMIN,
    });

    expect(context).toBeDefined();
    expect(context.role).toBe(ClinicRole.OWNER);
    expect(context.clinic.id).toBe(clinicAId);
  });
});
