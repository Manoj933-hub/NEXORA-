import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { GET as listAppointmentsHandler, POST as createAppointmentHandler } from './route';
import { GET as getAppointmentHandler, PATCH as updateAppointmentHandler } from './[appointmentId]/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { ClinicRole } from '@/lib/auth/permissions';
import { AppointmentStatus } from '@prisma/client';

describe('Task 004: Appointments Lifecycle, Scheduling Conflicts & RBAC Tests', () => {
  let clinicAId: string;
  let clinicBId: string;

  let doctorUserA: { id: string; email: string };
  let staffUserA: { id: string; email: string };
  let doctorUserB: { id: string; email: string };

  let doctorAToken: string;
  let staffAToken: string;
  let doctorBToken: string;

  let patientAId: string;
  let patientBId: string;

  let testAppointmentId: string;

  beforeAll(async () => {
    // Cleanup
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'doc.apt.a@nexora.test',
            'staff.apt.a@nexora.test',
            'doc.apt.b@nexora.test',
          ],
        },
      },
    });

    // Create users
    doctorUserA = await prisma.user.create({
      data: {
        email: 'doc.apt.a@nexora.test',
        name: 'Dr. Suresh Acharya',
        passwordHash: '$2a$12$fakehashforapt123456789012345678901234567890',
      },
    });

    staffUserA = await prisma.user.create({
      data: {
        email: 'staff.apt.a@nexora.test',
        name: 'Kopila Staff',
        passwordHash: '$2a$12$fakehashforapt123456789012345678901234567890',
      },
    });

    doctorUserB = await prisma.user.create({
      data: {
        email: 'doc.apt.b@nexora.test',
        name: 'Dr. Rajesh Regmi',
        passwordHash: '$2a$12$fakehashforapt123456789012345678901234567890',
      },
    });

    // Clinics
    const clinicA = await prisma.clinic.create({
      data: {
        name: 'Everest Medical Clinic',
        slug: `everest-med-${Date.now()}`,
        country: 'NP',
        currency: 'NPR',
      },
    });
    clinicAId = clinicA.id;

    const clinicB = await prisma.clinic.create({
      data: {
        name: 'Pokhara Community Hospital',
        slug: `pokhara-comm-${Date.now()}`,
        country: 'NP',
        currency: 'NPR',
      },
    });
    clinicBId = clinicB.id;

    // Memberships
    await prisma.membership.create({
      data: {
        userId: doctorUserA.id,
        clinicId: clinicAId,
        role: ClinicRole.DOCTOR,
        isActive: true,
      },
    });

    await prisma.membership.create({
      data: {
        userId: staffUserA.id,
        clinicId: clinicAId,
        role: ClinicRole.STAFF,
        isActive: true,
      },
    });

    await prisma.membership.create({
      data: {
        userId: doctorUserB.id,
        clinicId: clinicBId,
        role: ClinicRole.OWNER,
        isActive: true,
      },
    });

    // Patients
    const patA = await prisma.patient.create({
      data: {
        clinicId: clinicAId,
        mrn: `NX-${Date.now().toString().slice(-4)}`,
        name: 'Suman Shrestha',
        phone: '+977 9841001122',
      },
    });
    patientAId = patA.id;

    const patB = await prisma.patient.create({
      data: {
        clinicId: clinicBId,
        mrn: `NX-B001`,
        name: 'Foreign Patient B',
        phone: '+977 9841009988',
      },
    });
    patientBId = patB.id;

    // Sessions
    const sessA = await createSession(doctorUserA.id, clinicAId);
    doctorAToken = sessA.rawToken;

    const sessStaff = await createSession(staffUserA.id, clinicAId);
    staffAToken = sessStaff.rawToken;

    const sessB = await createSession(doctorUserB.id, clinicBId);
    doctorBToken = sessB.rawToken;
  });

  afterAll(async () => {
    await prisma.clinic.deleteMany({
      where: { id: { in: [clinicAId, clinicBId] } },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'doc.apt.a@nexora.test',
            'staff.apt.a@nexora.test',
            'doc.apt.b@nexora.test',
          ],
        },
      },
    });
  });

  describe('POST /api/appointments (Booking & Conflict Detection)', () => {
    it('creates an appointment for patient and doctor in the same clinic', async () => {
      const startTime = '2026-11-10T10:00:00.000Z';
      const endTime = '2026-11-10T10:30:00.000Z';

      const req = new Request('http://localhost:3000/api/appointments', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
        body: JSON.stringify({
          patientId: patientAId,
          doctorId: doctorUserA.id,
          startTime,
          endTime,
          reason: 'General Outpatient Checkup',
          notes: 'First time visit',
        }),
      });

      const res = await createAppointmentHandler(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.appointment).toBeDefined();
      expect(data.appointment.status).toBe(AppointmentStatus.SCHEDULED);
      expect(data.appointment.patient.id).toBe(patientAId);
      expect(data.appointment.doctor.id).toBe(doctorUserA.id);

      testAppointmentId = data.appointment.id;
    });

    it('detects scheduling conflict for the same doctor and rejects with 409 Conflict', async () => {
      // Overlapping slot: 10:15 - 10:45 (overlaps with 10:00 - 10:30)
      const overlappingStart = '2026-11-10T10:15:00.000Z';
      const overlappingEnd = '2026-11-10T10:45:00.000Z';

      const req = new Request('http://localhost:3000/api/appointments', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
        body: JSON.stringify({
          patientId: patientAId,
          doctorId: doctorUserA.id,
          startTime: overlappingStart,
          endTime: overlappingEnd,
          reason: 'Double-booking attempt',
        }),
      });

      const res = await createAppointmentHandler(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error).toContain('conflict');
    });

    it('strictly rejects booking for a patient belonging to a different clinic (cross-clinic boundary)', async () => {
      const req = new Request('http://localhost:3000/api/appointments', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`, // Doctor A operates in Clinic A
        },
        body: JSON.stringify({
          patientId: patientBId, // Patient B belongs to Clinic B!
          doctorId: doctorUserA.id,
          startTime: '2026-11-10T14:00:00.000Z',
          endTime: '2026-11-10T14:30:00.000Z',
        }),
      });

      const res = await createAppointmentHandler(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toContain('Patient not found in this clinic');
    });

    it('rejects booking by roles lacking reception:appointments:manage (e.g. STAFF) with 403 Forbidden', async () => {
      const req = new Request('http://localhost:3000/api/appointments', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${staffAToken}`,
        },
        body: JSON.stringify({
          patientId: patientAId,
          startTime: '2026-11-10T15:00:00.000Z',
          endTime: '2026-11-10T15:30:00.000Z',
        }),
      });

      const res = await createAppointmentHandler(req);
      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/appointments/[appointmentId] (Status Transitions & Rescheduling)', () => {
    it('successfully transitions SCHEDULED -> CHECKED_IN and stamps checkedInAt', async () => {
      const req = new Request(`http://localhost:3000/api/appointments/${testAppointmentId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
        body: JSON.stringify({
          status: 'CHECKED_IN',
        }),
      });

      const res = await updateAppointmentHandler(req, {
        params: Promise.resolve({ appointmentId: testAppointmentId }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.appointment.status).toBe('CHECKED_IN');
      expect(data.appointment.checkedInAt).toBeDefined();
    });

    it('successfully transitions CHECKED_IN -> IN_PROGRESS and IN_PROGRESS -> COMPLETED', async () => {
      // Step 1: CHECKED_IN -> IN_PROGRESS
      const req1 = new Request(`http://localhost:3000/api/appointments/${testAppointmentId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
        body: JSON.stringify({
          status: 'IN_PROGRESS',
        }),
      });

      const res1 = await updateAppointmentHandler(req1, {
        params: Promise.resolve({ appointmentId: testAppointmentId }),
      });
      const data1 = await res1.json();
      expect(res1.status).toBe(200);
      expect(data1.appointment.status).toBe('IN_PROGRESS');
      expect(data1.appointment.inProgressAt).toBeDefined();

      // Step 2: IN_PROGRESS -> COMPLETED
      const req2 = new Request(`http://localhost:3000/api/appointments/${testAppointmentId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
        body: JSON.stringify({
          status: 'COMPLETED',
        }),
      });

      const res2 = await updateAppointmentHandler(req2, {
        params: Promise.resolve({ appointmentId: testAppointmentId }),
      });
      const data2 = await res2.json();
      expect(res2.status).toBe(200);
      expect(data2.appointment.status).toBe('COMPLETED');
      expect(data2.appointment.completedAt).toBeDefined();
    });

    it('strictly rejects invalid status transition from terminal COMPLETED state with 400 Bad Request', async () => {
      // Attempt to move COMPLETED back to SCHEDULED
      const req = new Request(`http://localhost:3000/api/appointments/${testAppointmentId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
        body: JSON.stringify({
          status: 'SCHEDULED',
        }),
      });

      const res = await updateAppointmentHandler(req, {
        params: Promise.resolve({ appointmentId: testAppointmentId }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain('Invalid appointment status transition');
    });

    it('strictly blocks rescheduling a COMPLETED appointment', async () => {
      const req = new Request(`http://localhost:3000/api/appointments/${testAppointmentId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
        body: JSON.stringify({
          startTime: '2026-11-12T10:00:00.000Z',
          endTime: '2026-11-12T10:30:00.000Z',
        }),
      });

      const res = await updateAppointmentHandler(req, {
        params: Promise.resolve({ appointmentId: testAppointmentId }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("Cannot reschedule appointment with status 'COMPLETED'");
    });

    it('reschedules a SCHEDULED appointment and validates new time slot', async () => {
      // Create a fresh appointment to reschedule
      const newApt = await prisma.appointment.create({
        data: {
          clinicId: clinicAId,
          patientId: patientAId,
          doctorId: doctorUserA.id,
          startTime: new Date('2026-11-15T09:00:00.000Z'),
          endTime: new Date('2026-11-15T09:30:00.000Z'),
          status: AppointmentStatus.SCHEDULED,
        },
      });

      const req = new Request(`http://localhost:3000/api/appointments/${newApt.id}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
        body: JSON.stringify({
          startTime: '2026-11-15T11:00:00.000Z',
          endTime: '2026-11-15T11:30:00.000Z',
          reason: 'Rescheduled upon patient request',
        }),
      });

      const res = await updateAppointmentHandler(req, {
        params: Promise.resolve({ appointmentId: newApt.id }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(new Date(data.appointment.startTime).toISOString()).toBe('2026-11-15T11:00:00.000Z');
      expect(new Date(data.appointment.endTime).toISOString()).toBe('2026-11-15T11:30:00.000Z');

      // Now cancel it
      const cancelReq = new Request(`http://localhost:3000/api/appointments/${newApt.id}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
        body: JSON.stringify({
          status: 'CANCELLED',
          cancelledReason: 'Patient called in sick',
        }),
      });

      const cancelRes = await updateAppointmentHandler(cancelReq, {
        params: Promise.resolve({ appointmentId: newApt.id }),
      });
      const cancelData = await cancelRes.json();

      expect(cancelRes.status).toBe(200);
      expect(cancelData.appointment.status).toBe('CANCELLED');
      expect(cancelData.appointment.cancelledReason).toBe('Patient called in sick');
    });

    it('strictly blocks cross-clinic access: Doctor in Clinic B cannot modify Appointment in Clinic A', async () => {
      const req = new Request(`http://localhost:3000/api/appointments/${testAppointmentId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorBToken}`, // Doctor B in Clinic B
        },
        body: JSON.stringify({
          status: 'CANCELLED',
        }),
      });

      const res = await updateAppointmentHandler(req, {
        params: Promise.resolve({ appointmentId: testAppointmentId }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/appointments and GET /api/appointments/[appointmentId]', () => {
    it('lists appointments for active clinic', async () => {
      const req = new Request('http://localhost:3000/api/appointments', {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
      });

      const res = await listAppointmentsHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(Array.isArray(data.appointments)).toBe(true);
      expect(data.appointments.length).toBeGreaterThanOrEqual(1);
    });

    it('retrieves appointment details by ID', async () => {
      const req = new Request(`http://localhost:3000/api/appointments/${testAppointmentId}`, {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
      });

      const res = await getAppointmentHandler(req, {
        params: Promise.resolve({ appointmentId: testAppointmentId }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.appointment.id).toBe(testAppointmentId);
      expect(data.appointment.patient.name).toBe('Suman Shrestha');
    });
  });
});
