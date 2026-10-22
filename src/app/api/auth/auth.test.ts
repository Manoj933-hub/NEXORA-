import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { POST as registerHandler } from './register/route';
import { POST as loginHandler } from './login/route';
import { POST as logoutHandler } from './logout/route';
import { GET as meHandler } from './me/route';
import { POST as switchClinicHandler } from './switch-clinic/route';
import { SESSION_COOKIE_NAME, hashSessionToken } from '@/lib/auth/session';

describe('Auth & Session Integration Tests', () => {
  const testEmail = `doctor.test.${Date.now()}@nexora.local`;
  const testPassword = 'Password123!';
  let userToken: string;
  let userClinicId: string;
  let otherClinicId: string;

  beforeAll(async () => {
    // Clean up any previous test artifacts
    await prisma.authRateLimit.deleteMany({});
    await prisma.user.deleteMany({
      where: { email: { contains: 'doctor.test.' } },
    });

    // Create an independent clinic to test cross-clinic boundaries
    const otherClinic = await prisma.clinic.create({
      data: {
        name: 'Unrelated City Clinic',
        slug: `unrelated-clinic-${Date.now()}`,
        country: 'NP',
        currency: 'NPR',
      },
    });
    otherClinicId = otherClinic.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: 'doctor.test.' } },
    });
    if (otherClinicId) {
      await prisma.clinic.deleteMany({
        where: { id: otherClinicId },
      });
    }
  });

  it('registers a user, clinic, and OWNER membership atomically', async () => {
    const req = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: 'Dr. Manoj Sharma',
        clinicName: 'Aarogya Health Center',
        country: 'IN',
        currency: 'INR',
      }),
    });

    const res = await registerHandler(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.message).toBe('Registration successful');
    expect(data.user.email).toBe(testEmail);
    expect(data.clinic.role).toBe('OWNER');
    expect(data.user.passwordHash).toBeUndefined();

    userClinicId = data.clinic.id;

    // Verify session cookie was attached
    const setCookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(setCookie).toBeDefined();
    expect(setCookie?.value).toHaveLength(64);
    expect(setCookie?.httpOnly).toBe(true);

    userToken = setCookie!.value;
  });

  it('rejects duplicate registration with 409 Conflict', async () => {
    const req = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: 'Dr. Duplicate',
        clinicName: 'Second Clinic',
      }),
    });

    const res = await registerHandler(req);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain('already exists');
  });

  it('rejects registration with weak password', async () => {
    const req = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `weak.${Date.now()}@nexora.local`,
        password: 'weak',
        name: 'Dr. Weak',
        clinicName: 'Test Clinic',
      }),
    });

    const res = await registerHandler(req);
    expect(res.status).toBe(400);
  });

  it('logs in successfully with valid credentials and sets session cookie', async () => {
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    const res = await loginHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toBe('Login successful');
    expect(data.user.email).toBe(testEmail);
    expect(data.activeClinic.id).toBe(userClinicId);
    expect(data.user.passwordHash).toBeUndefined();

    const cookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBeDefined();
    userToken = cookie!.value;
  });

  it('rejects login with invalid password with 401', async () => {
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'WrongPassword!',
      }),
    });

    const res = await loginHandler(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Invalid email address or password');
  });

  it('returns current user and authorized clinics via /api/auth/me', async () => {
    const req = new Request('http://localhost:3000/api/auth/me', {
      method: 'GET',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userToken}`,
      },
    });

    const res = await meHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user.email).toBe(testEmail);
    expect(data.activeClinic.id).toBe(userClinicId);
    expect(Array.isArray(data.clinics)).toBe(true);
    expect(data.clinics[0].id).toBe(userClinicId);
  });

  it('rejects unauthenticated requests to /api/auth/me with 401', async () => {
    const req = new Request('http://localhost:3000/api/auth/me', {
      method: 'GET',
    });

    const res = await meHandler(req);
    expect(res.status).toBe(401);
  });

  it('allows switching active clinic when user is an active member', async () => {
    // Add user as a DOCTOR to otherClinic
    const user = await prisma.user.findUniqueOrThrow({ where: { email: testEmail } });
    await prisma.membership.create({
      data: {
        userId: user.id,
        clinicId: otherClinicId,
        role: 'DOCTOR',
        isActive: true,
      },
    });

    const req = new Request('http://localhost:3000/api/auth/switch-clinic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${SESSION_COOKIE_NAME}=${userToken}`,
      },
      body: JSON.stringify({ clinicId: otherClinicId }),
    });

    const res = await switchClinicHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.activeClinic.id).toBe(otherClinicId);
    expect(data.activeClinic.role).toBe('DOCTOR');
  });

  it('rejects switching to a clinic where user has NO membership with 403', async () => {
    const fakeClinicId = '00000000-0000-0000-0000-000000000000';

    const req = new Request('http://localhost:3000/api/auth/switch-clinic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${SESSION_COOKIE_NAME}=${userToken}`,
      },
      body: JSON.stringify({ clinicId: fakeClinicId }),
    });

    const res = await switchClinicHandler(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Access denied');
  });

  it('rejects switching to a clinic where membership is inactive', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: testEmail } });
    await prisma.membership.update({
      where: {
        userId_clinicId: {
          userId: user.id,
          clinicId: otherClinicId,
        },
      },
      data: { isActive: false },
    });

    const req = new Request('http://localhost:3000/api/auth/switch-clinic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${SESSION_COOKIE_NAME}=${userToken}`,
      },
      body: JSON.stringify({ clinicId: otherClinicId }),
    });

    const res = await switchClinicHandler(req);
    expect(res.status).toBe(403);
  });

  it('rejects access when session is expired', async () => {
    // Force session to expire in database
    const tokenHash = hashSessionToken(userToken);
    await prisma.session.update({
      where: { tokenHash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const req = new Request('http://localhost:3000/api/auth/me', {
      method: 'GET',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${userToken}`,
      },
    });

    const res = await meHandler(req);
    expect(res.status).toBe(401);
  });

  it('logs out and revokes session', async () => {
    // Re-login to get fresh session
    const loginReq = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });
    const loginRes = await loginHandler(loginReq);
    const freshToken = loginRes.cookies.get(SESSION_COOKIE_NAME)!.value;

    const logoutReq = new Request('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${freshToken}`,
      },
    });

    const logoutRes = await logoutHandler(logoutReq);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.cookies.get(SESSION_COOKIE_NAME)?.value).toBe('');

    // Verify session revoked in database
    const tokenHash = hashSessionToken(freshToken);
    const dbSession = await prisma.session.findUnique({ where: { tokenHash } });
    expect(dbSession).toBeNull();
  });
});
