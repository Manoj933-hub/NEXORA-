import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { GET as listPatientsHandler, POST as createPatientHandler } from './route';
import { GET as getPatientHandler, PATCH as updatePatientHandler } from './[patientId]/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { ClinicRole } from '@/lib/auth/permissions';

describe('Task 004: Patient Management & Tenant Isolation Integration Tests', () => {
  let clinicAId: string;
  let clinicBId: string;

  let doctorUserA: { id: string; email: string };
  let staffUserA: { id: string; email: string };
  let doctorUserB: { id: string; email: string };

  let doctorAToken: string;
  let staffAToken: string;
  let doctorBToken: string;

  let createdPatientAId: string;
  let createdPatientAMRN: string;

  beforeAll(async () => {
    // Cleanup
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'doc.patient.a@nexora.test',
            'staff.patient.a@nexora.test',
            'doc.patient.b@nexora.test',
          ],
        },
      },
    });

    // Create Doctor in Clinic A
    doctorUserA = await prisma.user.create({
      data: {
        email: 'doc.patient.a@nexora.test',
        name: 'Dr. Anita Joshi',
        passwordHash: '$2a$12$fakehashforpatienttesting123456789012345678901234567890',
      },
    });

    // Create Staff in Clinic A
    staffUserA = await prisma.user.create({
      data: {
        email: 'staff.patient.a@nexora.test',
        name: 'Sunil Staff',
        passwordHash: '$2a$12$fakehashforpatienttesting123456789012345678901234567890',
      },
    });

    // Create Doctor in Clinic B
    doctorUserB = await prisma.user.create({
      data: {
        email: 'doc.patient.b@nexora.test',
        name: 'Dr. Bimal Thapa',
        passwordHash: '$2a$12$fakehashforpatienttesting123456789012345678901234567890',
      },
    });

    // Create Clinic A
    const clinicA = await prisma.clinic.create({
      data: {
        name: 'Kathmandu PolyCare Hospital',
        slug: `kathmandu-polycare-${Date.now()}`,
        country: 'NP',
        currency: 'NPR',
      },
    });
    clinicAId = clinicA.id;

    // Create Clinic B
    const clinicB = await prisma.clinic.create({
      data: {
        name: 'Lalitpur Health Center',
        slug: `lalitpur-health-${Date.now()}`,
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

    // Sessions with activeClinicId
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
            'doc.patient.a@nexora.test',
            'staff.patient.a@nexora.test',
            'doc.patient.b@nexora.test',
          ],
        },
      },
    });
  });

  describe('POST /api/patients (Patient Creation & Unique MRN)', () => {
    it('creates a patient profile with generated clinic-scoped MRN', async () => {
      const req = new Request('http://localhost:3000/api/patients', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
        body: JSON.stringify({
          name: 'Pradeep Gautam',
          dateOfBirth: '1985-05-12',
          gender: 'MALE',
          phone: '+977 9841234567',
          bloodGroup: 'B+',
          allergies: 'Penicillin',
          emergencyContact: 'Maya Gautam (+977 9841000000)',
          address: 'Baneshwor, Kathmandu',
        }),
      });

      const res = await createPatientHandler(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.patient).toBeDefined();
      expect(data.patient.name).toBe('Pradeep Gautam');
      expect(data.patient.mrn).toMatch(/^NX-\d{4}$/);
      expect(data.patient.bloodGroup).toBe('B+');
      expect(data.patient.allergies).toBe('Penicillin');

      createdPatientAId = data.patient.id;
      createdPatientAMRN = data.patient.mrn;
    });

    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const req = new Request('http://localhost:3000/api/patients', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Unauth Patient',
        }),
      });

      const res = await createPatientHandler(req);
      expect(res.status).toBe(401);
    });

    it('rejects creation from roles lacking patients:write (e.g. STAFF) with 403 Forbidden', async () => {
      const req = new Request('http://localhost:3000/api/patients', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${staffAToken}`,
        },
        body: JSON.stringify({
          name: 'Unauthorized Patient',
        }),
      });

      const res = await createPatientHandler(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.error).toContain('patients:write');
    });

    it('rejects invalid inputs with 400 Bad Request', async () => {
      const req = new Request('http://localhost:3000/api/patients', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
        body: JSON.stringify({
          name: '', // Invalid empty name
          phone: '123', // Invalid phone format
          dateOfBirth: 'not-a-date',
        }),
      });

      const res = await createPatientHandler(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Validation failed');
      expect(data.details).toBeDefined();
    });
  });

  describe('GET /api/patients (List & Search Patients)', () => {
    it('lists patients belonging to the active clinic', async () => {
      const req = new Request('http://localhost:3000/api/patients', {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
      });

      const res = await listPatientsHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(Array.isArray(data.patients)).toBe(true);
      expect(data.patients.length).toBeGreaterThanOrEqual(1);
      expect(data.patients[0].mrn).toBe(createdPatientAMRN);
      expect(data.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('searches patients by name, phone, or MRN', async () => {
      const req = new Request(`http://localhost:3000/api/patients?query=${encodeURIComponent('Pradeep')}`, {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
      });

      const res = await listPatientsHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.patients.length).toBe(1);
      expect(data.patients[0].name).toBe('Pradeep Gautam');
    });

    it('returns empty array when search query matches no patient', async () => {
      const req = new Request('http://localhost:3000/api/patients?query=NonExistentPatient12345', {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
      });

      const res = await listPatientsHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.patients.length).toBe(0);
      expect(data.pagination.total).toBe(0);
    });
  });

  describe('GET & PATCH /api/patients/[patientId] (Patient Details, Edits & Tenant Isolation)', () => {
    it('retrieves patient profile by ID within the same clinic', async () => {
      const req = new Request(`http://localhost:3000/api/patients/${createdPatientAId}`, {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
      });

      const res = await getPatientHandler(req, {
        params: Promise.resolve({ patientId: createdPatientAId }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.patient.id).toBe(createdPatientAId);
      expect(data.patient.name).toBe('Pradeep Gautam');
    });

    it('updates patient demographic and medical details via PATCH', async () => {
      const req = new Request(`http://localhost:3000/api/patients/${createdPatientAId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
        body: JSON.stringify({
          phone: '+977 9851122334',
          bloodGroup: 'AB+',
          allergies: 'Penicillin, Sulfa drugs',
        }),
      });

      const res = await updatePatientHandler(req, {
        params: Promise.resolve({ patientId: createdPatientAId }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.patient.phone).toBe('+977 9851122334');
      expect(data.patient.bloodGroup).toBe('AB+');
      expect(data.patient.allergies).toBe('Penicillin, Sulfa drugs');
    });

    it('strictly blocks cross-clinic access: Doctor in Clinic B cannot view Patient in Clinic A', async () => {
      const req = new Request(`http://localhost:3000/api/patients/${createdPatientAId}`, {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${doctorBToken}`,
        },
      });

      const res = await getPatientHandler(req, {
        params: Promise.resolve({ patientId: createdPatientAId }),
      });

      expect(res.status).toBe(404);
    });

    it('strictly blocks cross-clinic updates: Doctor in Clinic B cannot edit Patient in Clinic A', async () => {
      const req = new Request(`http://localhost:3000/api/patients/${createdPatientAId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorBToken}`,
        },
        body: JSON.stringify({
          name: 'Hacked Name',
        }),
      });

      const res = await updatePatientHandler(req, {
        params: Promise.resolve({ patientId: createdPatientAId }),
      });

      expect(res.status).toBe(404);
    });
  });
});
