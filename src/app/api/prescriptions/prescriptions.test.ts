import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { GET as listPrescriptionsHandler } from './route';
import { GET as getPrescriptionByIdHandler, PATCH as updatePrescriptionHandler } from './[prescriptionId]/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { ClinicRole } from '@/lib/auth/permissions';
import { PrescriptionStatus } from '@prisma/client';

describe('Task 006: Prescription Lifecycle, Security & Tenant-Isolation Suite', () => {
  let clinicAId: string;
  let clinicBId: string;

  let doctorUserA: { id: string; email: string; name: string };
  let receptionistUserA: { id: string; email: string; name: string };
  let staffUserA: { id: string; email: string; name: string };
  let doctorUserB: { id: string; email: string; name: string };

  let doctorAToken: string;
  let receptionistAToken: string;
  let staffAToken: string;
  let doctorBToken: string;

  let patientAId: string;
  let patientBId: string;

  let activeRxAId: string;
  let completedRxAId: string;
  let discontinuedRxAId: string;
  let cancelledRxAId: string;
  let activeRxBId: string;

  async function cleanupTestData() {
    const existingUsers = await prisma.user.findMany({
      where: {
        email: {
          in: [
            'doc.rx.a@nexora.test',
            'rec.rx.a@nexora.test',
            'staff.rx.a@nexora.test',
            'doc.rx.b@nexora.test',
          ],
        },
      },
      select: { id: true },
    });
    const userIds = existingUsers.map((u) => u.id);

    if (userIds.length > 0) {
      await prisma.clinicalAuditLog.deleteMany({
        where: { actorId: { in: userIds } },
      }).catch(() => {});
      await prisma.consultationVersion.deleteMany({
        where: { OR: [{ doctorId: { in: userIds } }, { amendedById: { in: userIds } }] },
      }).catch(() => {});
      await prisma.prescriptionItem.deleteMany({
        where: { prescription: { doctorId: { in: userIds } } },
      }).catch(() => {});
      await prisma.prescription.deleteMany({
        where: { doctorId: { in: userIds } },
      }).catch(() => {});
      await prisma.observation.deleteMany({
        where: { consultation: { doctorId: { in: userIds } } },
      }).catch(() => {});
      await prisma.diagnosis.deleteMany({
        where: { consultation: { doctorId: { in: userIds } } },
      }).catch(() => {});
      await prisma.consultation.deleteMany({
        where: { doctorId: { in: userIds } },
      }).catch(() => {});
      await prisma.appointment.deleteMany({
        where: { doctorId: { in: userIds } },
      }).catch(() => {});
      await prisma.patient.deleteMany({
        where: { clinic: { memberships: { some: { userId: { in: userIds } } } } },
      }).catch(() => {});
      await prisma.membership.deleteMany({
        where: { userId: { in: userIds } },
      }).catch(() => {});
      await prisma.session.deleteMany({
        where: { userId: { in: userIds } },
      }).catch(() => {});
      await prisma.clinic.deleteMany({
        where: { memberships: { some: { userId: { in: userIds } } } },
      }).catch(() => {});
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      }).catch(() => {});
    }
  }

  beforeAll(async () => {
    await cleanupTestData();

    // Create test users
    doctorUserA = await prisma.user.create({
      data: {
        email: 'doc.rx.a@nexora.test',
        name: 'Dr. Rx Specialist A',
        passwordHash: '$2a$12$fakehashforrxspec123456789012345678901234567890',
      },
    });

    receptionistUserA = await prisma.user.create({
      data: {
        email: 'rec.rx.a@nexora.test',
        name: 'Frontdesk Rx A',
        passwordHash: '$2a$12$fakehashforrxspec123456789012345678901234567890',
      },
    });

    staffUserA = await prisma.user.create({
      data: {
        email: 'staff.rx.a@nexora.test',
        name: 'Staff Rx A',
        passwordHash: '$2a$12$fakehashforrxspec123456789012345678901234567890',
      },
    });

    doctorUserB = await prisma.user.create({
      data: {
        email: 'doc.rx.b@nexora.test',
        name: 'Dr. Rx Specialist B',
        passwordHash: '$2a$12$fakehashforrxspec123456789012345678901234567890',
      },
    });

    // Create clinics
    const clinicA = await prisma.clinic.create({
      data: {
        name: 'Apex Rx Health A',
        slug: `apex-rx-clinic-a-${Date.now()}`,
        country: 'IN',
        currency: 'INR',
        memberships: {
          create: [
            { userId: doctorUserA.id, role: ClinicRole.DOCTOR },
            { userId: receptionistUserA.id, role: ClinicRole.RECEPTIONIST },
            { userId: staffUserA.id, role: ClinicRole.STAFF },
          ],
        },
      },
    });
    clinicAId = clinicA.id;

    const clinicB = await prisma.clinic.create({
      data: {
        name: 'Himalayan Rx Health B',
        slug: `himalayan-rx-clinic-b-${Date.now()}`,
        country: 'NP',
        currency: 'NPR',
        memberships: {
          create: [{ userId: doctorUserB.id, role: ClinicRole.DOCTOR }],
        },
      },
    });
    clinicBId = clinicB.id;

    // Create patients
    const patientA = await prisma.patient.create({
      data: {
        clinicId: clinicAId,
        mrn: 'RX-PAT-001',
        name: 'Devraj Bhandari',
        gender: 'MALE',
        dateOfBirth: new Date('1990-01-15'),
        phone: '+919988776655',
      },
    });
    patientAId = patientA.id;

    const patientB = await prisma.patient.create({
      data: {
        clinicId: clinicBId,
        mrn: 'RX-PAT-002',
        name: 'Kavita Acharya',
        gender: 'FEMALE',
        dateOfBirth: new Date('1992-06-20'),
        phone: '+9779812345678',
      },
    });
    patientBId = patientB.id;

    // Create baseline test prescriptions for Clinic A
    const rx1 = await prisma.prescription.create({
      data: {
        clinicId: clinicAId,
        patientId: patientAId,
        doctorId: doctorUserA.id,
        status: PrescriptionStatus.ACTIVE,
        version: 1,
        notes: 'Active prescription for hypertension',
        items: {
          create: [
            {
              medicationName: 'Amlodipine',
              strength: '5mg',
              route: 'ORAL',
              frequency: 'ONCE_DAILY',
              duration: '30 days',
              quantity: '30 tablets',
              instructions: 'Take in the morning',
            },
          ],
        },
      },
    });
    activeRxAId = rx1.id;

    const rx2 = await prisma.prescription.create({
      data: {
        clinicId: clinicAId,
        patientId: patientAId,
        doctorId: doctorUserA.id,
        status: PrescriptionStatus.COMPLETED,
        version: 1,
        notes: 'Completed antibiotic course',
        items: {
          create: [
            {
              medicationName: 'Azithromycin',
              strength: '500mg',
              route: 'ORAL',
              frequency: 'ONCE_DAILY',
              duration: '5 days',
              quantity: '5 tablets',
            },
          ],
        },
      },
    });
    completedRxAId = rx2.id;

    const rx3 = await prisma.prescription.create({
      data: {
        clinicId: clinicAId,
        patientId: patientAId,
        doctorId: doctorUserA.id,
        status: PrescriptionStatus.DISCONTINUED,
        version: 1,
        notes: 'Discontinued due to allergic rash',
        items: {
          create: [
            {
              medicationName: 'Amoxicillin',
              strength: '500mg',
              route: 'ORAL',
              frequency: 'TID',
              duration: '7 days',
            },
          ],
        },
      },
    });
    discontinuedRxAId = rx3.id;

    const rx4 = await prisma.prescription.create({
      data: {
        clinicId: clinicAId,
        patientId: patientAId,
        doctorId: doctorUserA.id,
        status: PrescriptionStatus.CANCELLED,
        version: 1,
        notes: 'Cancelled duplicate order',
        items: {
          create: [
            {
              medicationName: 'Paracetamol',
              strength: '650mg',
              route: 'ORAL',
              frequency: 'PRN',
              duration: '3 days',
            },
          ],
        },
      },
    });
    cancelledRxAId = rx4.id;

    // Create prescription for Clinic B
    const rxB = await prisma.prescription.create({
      data: {
        clinicId: clinicBId,
        patientId: patientBId,
        doctorId: doctorUserB.id,
        status: PrescriptionStatus.ACTIVE,
        version: 1,
        notes: 'Clinic B active prescription',
        items: {
          create: [
            {
              medicationName: 'Metformin',
              strength: '500mg',
              route: 'ORAL',
              frequency: 'BID',
              duration: '60 days',
            },
          ],
        },
      },
    });
    activeRxBId = rxB.id;

    // Create sessions
    const sDocA = await createSession(doctorUserA.id, clinicAId);
    doctorAToken = sDocA.rawToken;

    const sRecA = await createSession(receptionistUserA.id, clinicAId);
    receptionistAToken = sRecA.rawToken;

    const sStaffA = await createSession(staffUserA.id, clinicAId);
    staffAToken = sStaffA.rawToken;

    const sDocB = await createSession(doctorUserB.id, clinicBId);
    doctorBToken = sDocB.rawToken;
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  function makeRequest(
    urlStr: string,
    method: string,
    token?: string,
    body?: Record<string, unknown>,
    headers?: Record<string, string>
  ) {
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Host: 'localhost:3000',
      Origin: 'http://localhost:3000',
      ...headers,
    };
    if (token) {
      reqHeaders.Cookie = `${SESSION_COOKIE_NAME}=${token}`;
    }

    return new Request(urlStr, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  describe('1. Authentication & Role Permissions (GET /api/prescriptions)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const req = makeRequest('http://localhost:3000/api/prescriptions', 'GET');
      const res = await listPrescriptionsHandler(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Authentication required');
    });

    it('rejects STAFF role with 403 Forbidden (missing clinical:records:read)', async () => {
      const req = makeRequest('http://localhost:3000/api/prescriptions', 'GET', staffAToken);
      const res = await listPrescriptionsHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Insufficient permissions');
    });

    it('rejects RECEPTIONIST role with 403 Forbidden (missing clinical:records:read)', async () => {
      const req = makeRequest('http://localhost:3000/api/prescriptions', 'GET', receptionistAToken);
      const res = await listPrescriptionsHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Insufficient permissions');
    });

    it('allows DOCTOR role to list prescriptions', async () => {
      const req = makeRequest('http://localhost:3000/api/prescriptions', 'GET', doctorAToken);
      const res = await listPrescriptionsHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.prescriptions)).toBe(true);
      expect(json.prescriptions.length).toBeGreaterThanOrEqual(4);
      // All returned prescriptions must belong to Clinic A
      for (const rx of json.prescriptions) {
        expect(rx.clinicId).toBe(clinicAId);
      }
    });
  });

  describe('2. Query Filtering & Clinic Isolation (GET /api/prescriptions)', () => {
    it('filters prescriptions by status=ACTIVE', async () => {
      const req = makeRequest('http://localhost:3000/api/prescriptions?status=ACTIVE', 'GET', doctorAToken);
      const res = await listPrescriptionsHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.prescriptions.length).toBeGreaterThanOrEqual(1);
      expect(json.prescriptions.every((p: { status: string }) => p.status === 'ACTIVE')).toBe(true);
    });

    it('filters prescriptions by status=COMPLETED', async () => {
      const req = makeRequest('http://localhost:3000/api/prescriptions?status=COMPLETED', 'GET', doctorAToken);
      const res = await listPrescriptionsHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.prescriptions.length).toBeGreaterThanOrEqual(1);
      expect(json.prescriptions.every((p: { status: string }) => p.status === 'COMPLETED')).toBe(true);
    });

    it('filters prescriptions by valid patientId', async () => {
      const req = makeRequest(`http://localhost:3000/api/prescriptions?patientId=${patientAId}`, 'GET', doctorAToken);
      const res = await listPrescriptionsHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.prescriptions.every((p: { patientId: string }) => p.patientId === patientAId)).toBe(true);
    });

    it('returns 404 when querying patientId belonging to another clinic (tenant isolation without info leak)', async () => {
      const req = makeRequest(`http://localhost:3000/api/prescriptions?patientId=${patientBId}`, 'GET', doctorAToken);
      const res = await listPrescriptionsHandler(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Patient not found in active clinic');
    });

    it('returns 403 when user attempts to pass another clinicId via query param without membership', async () => {
      const req = makeRequest(`http://localhost:3000/api/prescriptions?clinicId=${clinicBId}`, 'GET', doctorAToken);
      const res = await listPrescriptionsHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Access denied');
    });
  });

  describe('3. Single Prescription Retrieval (GET /api/prescriptions/[prescriptionId])', () => {
    it('returns 401 when unauthenticated', async () => {
      const req = makeRequest(`http://localhost:3000/api/prescriptions/${activeRxAId}`, 'GET');
      const res = await getPrescriptionByIdHandler(req, {
        params: Promise.resolve({ prescriptionId: activeRxAId }),
      });
      expect(res.status).toBe(401);
    });

    it('returns 403 when accessed by RECEPTIONIST', async () => {
      const req = makeRequest(`http://localhost:3000/api/prescriptions/${activeRxAId}`, 'GET', receptionistAToken);
      const res = await getPrescriptionByIdHandler(req, {
        params: Promise.resolve({ prescriptionId: activeRxAId }),
      });
      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent prescription ID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const req = makeRequest(`http://localhost:3000/api/prescriptions/${nonExistentId}`, 'GET', doctorAToken);
      const res = await getPrescriptionByIdHandler(req, {
        params: Promise.resolve({ prescriptionId: nonExistentId }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Prescription record not found in active clinic');
    });

    it('returns 404 when Doctor B attempts to view Clinic A prescription ID (cross-tenant protection)', async () => {
      const req = makeRequest(`http://localhost:3000/api/prescriptions/${activeRxAId}`, 'GET', doctorBToken);
      const res = await getPrescriptionByIdHandler(req, {
        params: Promise.resolve({ prescriptionId: activeRxAId }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Prescription record not found in active clinic');
    });

    it('returns 404 when Doctor A attempts to view Clinic B prescription ID (cross-tenant bidirectional protection)', async () => {
      const req = makeRequest(`http://localhost:3000/api/prescriptions/${activeRxBId}`, 'GET', doctorAToken);
      const res = await getPrescriptionByIdHandler(req, {
        params: Promise.resolve({ prescriptionId: activeRxBId }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Prescription record not found in active clinic');
    });

    it('successfully returns prescription with patient, doctor, and items for authorized doctor', async () => {
      const req = makeRequest(`http://localhost:3000/api/prescriptions/${activeRxAId}`, 'GET', doctorAToken);
      const res = await getPrescriptionByIdHandler(req, {
        params: Promise.resolve({ prescriptionId: activeRxAId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.prescription).toBeDefined();
      expect(json.prescription.id).toBe(activeRxAId);
      expect(json.prescription.patient.name).toBe('Devraj Bhandari');
      expect(json.prescription.doctor.name).toBe('Dr. Rx Specialist A');
      expect(json.prescription.items.length).toBe(1);
      expect(json.prescription.items[0].medicationName).toBe('Amlodipine');
    });
  });

  describe('4. Mutation Validation & Security (PATCH /api/prescriptions/[prescriptionId])', () => {
    it('returns 401 when unauthenticated', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/prescriptions/${activeRxAId}`,
        'PATCH',
        undefined,
        { status: 'COMPLETED' }
      );
      const res = await updatePrescriptionHandler(req, {
        params: Promise.resolve({ prescriptionId: activeRxAId }),
      });
      expect(res.status).toBe(401);
    });

    it('returns 403 when origin header is invalid / untrusted (CSRF defense)', async () => {
      const req = new Request(`http://localhost:3000/api/prescriptions/${activeRxAId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Host: 'localhost:3000',
          Origin: 'http://malicious-site.com',
          Cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
      const res = await updatePrescriptionHandler(req, {
        params: Promise.resolve({ prescriptionId: activeRxAId }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Origin header does not match Host');
    });

    it('returns 403 when RECEPTIONIST attempts to update prescription', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/prescriptions/${activeRxAId}`,
        'PATCH',
        receptionistAToken,
        { status: 'COMPLETED' }
      );
      const res = await updatePrescriptionHandler(req, {
        params: Promise.resolve({ prescriptionId: activeRxAId }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Insufficient permissions');
    });

    it('returns 404 when Doctor B attempts to update Clinic A prescription', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/prescriptions/${activeRxAId}`,
        'PATCH',
        doctorBToken,
        { status: 'COMPLETED' }
      );
      const res = await updatePrescriptionHandler(req, {
        params: Promise.resolve({ prescriptionId: activeRxAId }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Prescription record not found in active clinic');
    });

    it('returns 400 when body is invalid JSON', async () => {
      const req = new Request(`http://localhost:3000/api/prescriptions/${activeRxAId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          Cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
        body: 'NOT_VALID_JSON{',
      });
      const res = await updatePrescriptionHandler(req, {
        params: Promise.resolve({ prescriptionId: activeRxAId }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Invalid JSON request body');
    });

    it('returns 400 when invalid status enum is passed', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/prescriptions/${activeRxAId}`,
        'PATCH',
        doctorAToken,
        { status: 'EXPIRED' }
      );
      const res = await updatePrescriptionHandler(req, {
        params: Promise.resolve({ prescriptionId: activeRxAId }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Validation failed');
    });

    it('returns 400 when notes exceeds 1000 characters', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/prescriptions/${activeRxAId}`,
        'PATCH',
        doctorAToken,
        { status: 'COMPLETED', notes: 'A'.repeat(1001) }
      );
      const res = await updatePrescriptionHandler(req, {
        params: Promise.resolve({ prescriptionId: activeRxAId }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Validation failed');
    });
  });

  describe('5. State Machine & Terminal State Integrity (PATCH /api/prescriptions/[prescriptionId])', () => {
    it('successfully transitions ACTIVE -> COMPLETED, increments version, and creates UPDATE audit log', async () => {
      const rxToComplete = await prisma.prescription.create({
        data: {
          clinicId: clinicAId,
          patientId: patientAId,
          doctorId: doctorUserA.id,
          status: PrescriptionStatus.ACTIVE,
          version: 1,
          notes: 'Test active for completion',
        },
      });

      const req = makeRequest(
        `http://localhost:3000/api/prescriptions/${rxToComplete.id}`,
        'PATCH',
        doctorAToken,
        { status: 'COMPLETED', notes: 'Patient finished treatment' }
      );
      const res = await updatePrescriptionHandler(req, {
        params: Promise.resolve({ prescriptionId: rxToComplete.id }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.prescription.status).toBe('COMPLETED');
      expect(json.prescription.version).toBe(2);
      expect(json.prescription.notes).toBe('Patient finished treatment');

      // Verify audit log
      const audit = await prisma.clinicalAuditLog.findFirst({
        where: { recordId: rxToComplete.id, action: 'UPDATE' },
      });
      expect(audit).toBeDefined();
      expect(audit?.details).toContain('COMPLETED');
    });

    it('successfully transitions ACTIVE -> DISCONTINUED and creates DISCONTINUE audit log', async () => {
      const rxToDiscontinue = await prisma.prescription.create({
        data: {
          clinicId: clinicAId,
          patientId: patientAId,
          doctorId: doctorUserA.id,
          status: PrescriptionStatus.ACTIVE,
          version: 1,
        },
      });

      const req = makeRequest(
        `http://localhost:3000/api/prescriptions/${rxToDiscontinue.id}`,
        'PATCH',
        doctorAToken,
        { status: 'DISCONTINUED', notes: 'Adverse side-effects observed' }
      );
      const res = await updatePrescriptionHandler(req, {
        params: Promise.resolve({ prescriptionId: rxToDiscontinue.id }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.prescription.status).toBe('DISCONTINUED');

      // Verify audit log
      const audit = await prisma.clinicalAuditLog.findFirst({
        where: { recordId: rxToDiscontinue.id, action: 'DISCONTINUE' },
      });
      expect(audit).toBeDefined();
    });

    it('successfully transitions ACTIVE -> CANCELLED and creates CANCEL audit log', async () => {
      const rxToCancel = await prisma.prescription.create({
        data: {
          clinicId: clinicAId,
          patientId: patientAId,
          doctorId: doctorUserA.id,
          status: PrescriptionStatus.ACTIVE,
          version: 1,
        },
      });

      const req = makeRequest(
        `http://localhost:3000/api/prescriptions/${rxToCancel.id}`,
        'PATCH',
        doctorAToken,
        { status: 'CANCELLED', notes: 'Wrong dosage prescribed' }
      );
      const res = await updatePrescriptionHandler(req, {
        params: Promise.resolve({ prescriptionId: rxToCancel.id }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.prescription.status).toBe('CANCELLED');

      // Verify audit log
      const audit = await prisma.clinicalAuditLog.findFirst({
        where: { recordId: rxToCancel.id, action: 'CANCEL' },
      });
      expect(audit).toBeDefined();
    });

    it('rejects invalid transition from COMPLETED -> ACTIVE with 400 Bad Request', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/prescriptions/${completedRxAId}`,
        'PATCH',
        doctorAToken,
        { status: 'ACTIVE' }
      );
      const res = await updatePrescriptionHandler(req, {
        params: Promise.resolve({ prescriptionId: completedRxAId }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Invalid prescription status transition');
      expect(json.error).toContain('terminal state');
    });

    it('rejects invalid transition from DISCONTINUED -> COMPLETED with 400 Bad Request', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/prescriptions/${discontinuedRxAId}`,
        'PATCH',
        doctorAToken,
        { status: 'COMPLETED' }
      );
      const res = await updatePrescriptionHandler(req, {
        params: Promise.resolve({ prescriptionId: discontinuedRxAId }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('terminal state');
    });

    it('rejects invalid transition from CANCELLED -> ACTIVE with 400 Bad Request', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/prescriptions/${cancelledRxAId}`,
        'PATCH',
        doctorAToken,
        { status: 'ACTIVE' }
      );
      const res = await updatePrescriptionHandler(req, {
        params: Promise.resolve({ prescriptionId: cancelledRxAId }),
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('terminal state');
    });
  });

  describe('6. Concurrency & Stale Version Handling (PATCH /api/prescriptions/[prescriptionId])', () => {
    it('returns 409 Conflict when expectedVersion does not match database version', async () => {
      const occRx = await prisma.prescription.create({
        data: {
          clinicId: clinicAId,
          patientId: patientAId,
          doctorId: doctorUserA.id,
          status: PrescriptionStatus.ACTIVE,
          version: 3,
        },
      });

      const req = makeRequest(
        `http://localhost:3000/api/prescriptions/${occRx.id}`,
        'PATCH',
        doctorAToken,
        { status: 'COMPLETED', expectedVersion: 2 }
      );
      const res = await updatePrescriptionHandler(req, {
        params: Promise.resolve({ prescriptionId: occRx.id }),
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain('version conflict');
      expect(json.error).toContain('current version is 3');
    });

    it('safely handles competing concurrent updates: first succeeds and second gets 409 Conflict', async () => {
      const raceRx = await prisma.prescription.create({
        data: {
          clinicId: clinicAId,
          patientId: patientAId,
          doctorId: doctorUserA.id,
          status: PrescriptionStatus.ACTIVE,
          version: 1,
        },
      });

      const req1 = makeRequest(
        `http://localhost:3000/api/prescriptions/${raceRx.id}`,
        'PATCH',
        doctorAToken,
        { status: 'COMPLETED', expectedVersion: 1 }
      );
      const req2 = makeRequest(
        `http://localhost:3000/api/prescriptions/${raceRx.id}`,
        'PATCH',
        doctorAToken,
        { status: 'DISCONTINUED', expectedVersion: 1 }
      );

      const [res1, res2] = await Promise.all([
        updatePrescriptionHandler(req1, { params: Promise.resolve({ prescriptionId: raceRx.id }) }),
        updatePrescriptionHandler(req2, { params: Promise.resolve({ prescriptionId: raceRx.id }) }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      // Confirm only one audit record was written for the winning request
      const auditCount = await prisma.clinicalAuditLog.count({
        where: { recordId: raceRx.id },
      });
      expect(auditCount).toBe(1);

      // Confirm final database state has version 2
      const finalRx = await prisma.prescription.findUnique({ where: { id: raceRx.id } });
      expect(finalRx?.version).toBe(2);
    });
  });
});
