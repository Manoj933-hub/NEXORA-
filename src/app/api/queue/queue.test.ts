import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { GET as getQueueHandler } from './route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { ClinicRole } from '@/lib/auth/permissions';
import { AppointmentStatus } from '@prisma/client';

describe('Task 004: Reception Queue & Lobby Management Tests', () => {
  let clinicId: string;
  let receptionistUser: { id: string; email: string };
  let staffUser: { id: string; email: string };
  let receptionistToken: string;
  let staffToken: string;

  const targetDate = '2026-11-20';

  beforeAll(async () => {
    // Cleanup
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['rec.queue@nexora.test', 'staff.queue@nexora.test'],
        },
      },
    });

    // Create users
    receptionistUser = await prisma.user.create({
      data: {
        email: 'rec.queue@nexora.test',
        name: 'Mina Receptionist',
        passwordHash: '$2a$12$fakehashforqueue123456789012345678901234567890',
      },
    });

    staffUser = await prisma.user.create({
      data: {
        email: 'staff.queue@nexora.test',
        name: 'Staff Queue Test',
        passwordHash: '$2a$12$fakehashforqueue123456789012345678901234567890',
      },
    });

    // Clinic
    const clinic = await prisma.clinic.create({
      data: {
        name: 'Chitwan Community Hospital',
        slug: `chitwan-hosp-${Date.now()}`,
        country: 'NP',
        currency: 'NPR',
      },
    });
    clinicId = clinic.id;

    // Memberships
    await prisma.membership.create({
      data: {
        userId: receptionistUser.id,
        clinicId,
        role: ClinicRole.RECEPTIONIST,
        isActive: true,
      },
    });

    await prisma.membership.create({
      data: {
        userId: staffUser.id,
        clinicId,
        role: ClinicRole.STAFF,
        isActive: true,
      },
    });

    // Patient
    const patient = await prisma.patient.create({
      data: {
        clinicId,
        mrn: 'NX-9901',
        name: 'Aayush Shrestha',
      },
    });

    // Seed Appointments on targetDate with different statuses
    await prisma.appointment.createMany({
      data: [
        {
          clinicId,
          patientId: patient.id,
          startTime: new Date(`${targetDate}T09:00:00.000Z`),
          endTime: new Date(`${targetDate}T09:30:00.000Z`),
          status: AppointmentStatus.SCHEDULED,
        },
        {
          clinicId,
          patientId: patient.id,
          startTime: new Date(`${targetDate}T10:00:00.000Z`),
          endTime: new Date(`${targetDate}T10:30:00.000Z`),
          status: AppointmentStatus.CHECKED_IN,
          checkedInAt: new Date(`${targetDate}T09:55:00.000Z`),
        },
        {
          clinicId,
          patientId: patient.id,
          startTime: new Date(`${targetDate}T11:00:00.000Z`),
          endTime: new Date(`${targetDate}T11:30:00.000Z`),
          status: AppointmentStatus.IN_PROGRESS,
          checkedInAt: new Date(`${targetDate}T10:50:00.000Z`),
          inProgressAt: new Date(`${targetDate}T11:05:00.000Z`),
        },
        {
          clinicId,
          patientId: patient.id,
          startTime: new Date(`${targetDate}T12:00:00.000Z`),
          endTime: new Date(`${targetDate}T12:30:00.000Z`),
          status: AppointmentStatus.COMPLETED,
          checkedInAt: new Date(`${targetDate}T11:55:00.000Z`),
          inProgressAt: new Date(`${targetDate}T12:05:00.000Z`),
          completedAt: new Date(`${targetDate}T12:28:00.000Z`),
        },
        {
          clinicId,
          patientId: patient.id,
          startTime: new Date(`${targetDate}T14:00:00.000Z`),
          endTime: new Date(`${targetDate}T14:30:00.000Z`),
          status: AppointmentStatus.CANCELLED,
          cancelledReason: 'Patient missed appointment',
        },
      ],
    });

    // Sessions
    const recSess = await createSession(receptionistUser.id, clinicId);
    receptionistToken = recSess.rawToken;

    const staffSess = await createSession(staffUser.id, clinicId);
    staffToken = staffSess.rawToken;
  });

  afterAll(async () => {
    await prisma.clinic.deleteMany({
      where: { id: clinicId },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['rec.queue@nexora.test', 'staff.queue@nexora.test'],
        },
      },
    });
  });

  it('retrieves reception queue for specified date with accurate status metrics', async () => {
    const req = new Request(`http://localhost:3000/api/queue?date=${targetDate}`, {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${receptionistToken}`,
      },
    });

    const res = await getQueueHandler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.date).toBe(targetDate);
    expect(data.queue.length).toBe(5);

    // Verify metrics
    expect(data.metrics.total).toBe(5);
    expect(data.metrics.scheduled).toBe(1);
    expect(data.metrics.checkedIn).toBe(1);
    expect(data.metrics.inProgress).toBe(1);
    expect(data.metrics.completed).toBe(1);
    expect(data.metrics.cancelled).toBe(1);
  });

  it('rejects queue access from roles lacking reception:queue:manage (e.g. STAFF) with 403 Forbidden', async () => {
    const req = new Request(`http://localhost:3000/api/queue?date=${targetDate}`, {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${staffToken}`,
      },
    });

    const res = await getQueueHandler(req);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain('reception:queue:manage');
  });

  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    const req = new Request(`http://localhost:3000/api/queue?date=${targetDate}`);
    const res = await getQueueHandler(req);
    expect(res.status).toBe(401);
  });
});
