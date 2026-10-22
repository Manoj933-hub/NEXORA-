import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { POST as createPatientHandler } from './patients/route';
import { POST as createAppointmentHandler } from './appointments/route';
import { PATCH as updateAppointmentHandler } from './appointments/[appointmentId]/route';
import { GET as getQueueHandler } from './queue/route';
import {
  POST as createConsultationHandler,
  GET as listConsultationsHandler,
} from './consultations/route';
import {
  GET as getConsultationHandler,
  PATCH as updateConsultationHandler,
} from './consultations/[consultationId]/route';
import { GET as getClinicalHistoryHandler } from './patients/[patientId]/clinical-history/route';
import { GET as listPrescriptionsHandler } from './prescriptions/route';
import {
  GET as getPrescriptionHandler,
  PATCH as updatePrescriptionHandler,
} from './prescriptions/[prescriptionId]/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { ClinicRole } from '@/lib/auth/permissions';
import { AppointmentStatus, ConsultationStatus, PrescriptionStatus } from '@prisma/client';

describe('Task 006: End-to-End Clinical Workflow Integration & Hardening', () => {
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

  // Track created entities across the workflow
  let patientAId: string;
  let patientAMRN: string;
  let appointmentAId: string;
  let consultationAId: string;
  let prescriptionAId: string;

  async function cleanupTestData() {
    const existingUsers = await prisma.user.findMany({
      where: {
        email: {
          in: [
            'doc.e2e.a@nexora.test',
            'rec.e2e.a@nexora.test',
            'staff.e2e.a@nexora.test',
            'doc.e2e.b@nexora.test',
          ],
        },
      },
      select: { id: true },
    });
    const userIds = existingUsers.map((u) => u.id);

    if (userIds.length > 0) {
      // Must delete in reverse foreign-key dependency order due to RESTRICT constraints
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

    // Create users
    doctorUserA = await prisma.user.create({
      data: {
        email: 'doc.e2e.a@nexora.test',
        name: 'Dr. Siddharth Sen',
        passwordHash: '$2a$12$fakehashfore2eclinical123456789012345678901234567890',
      },
    });

    receptionistUserA = await prisma.user.create({
      data: {
        email: 'rec.e2e.a@nexora.test',
        name: 'Anjali Frontdesk',
        passwordHash: '$2a$12$fakehashfore2eclinical123456789012345678901234567890',
      },
    });

    staffUserA = await prisma.user.create({
      data: {
        email: 'staff.e2e.a@nexora.test',
        name: 'Gita Staff',
        passwordHash: '$2a$12$fakehashfore2eclinical123456789012345678901234567890',
      },
    });

    doctorUserB = await prisma.user.create({
      data: {
        email: 'doc.e2e.b@nexora.test',
        name: 'Dr. Bharat Joshi',
        passwordHash: '$2a$12$fakehashfore2eclinical123456789012345678901234567890',
      },
    });

    // Create clinics
    const clinicA = await prisma.clinic.create({
      data: {
        name: 'City Care Hospital A',
        slug: `city-care-e2e-a-${Date.now()}`,
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
        name: 'Metro Health B',
        slug: `metro-health-e2e-b-${Date.now()}`,
        country: 'NP',
        currency: 'NPR',
        memberships: {
          create: [{ userId: doctorUserB.id, role: ClinicRole.DOCTOR }],
        },
      },
    });
    clinicBId = clinicB.id;

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

  it('Step 1: Patient Registration and Appointment Scheduling in Clinic A', async () => {
    // 1. Receptionist registers patient
    const regReq = makeRequest(
      'http://localhost:3000/api/patients',
      'POST',
      receptionistAToken,
      {
        name: 'Gopal Krishna Shrestha',
        gender: 'MALE',
        dateOfBirth: '1982-08-14',
        phone: '+9779841999888',
        bloodGroup: 'O+',
        allergies: 'Sulfa drugs',
      }
    );
    const regRes = await createPatientHandler(regReq);
    expect(regRes.status).toBe(201);
    const regJson = await regRes.json();
    expect(regJson.patient).toBeDefined();
    expect(regJson.patient.name).toBe('Gopal Krishna Shrestha');
    patientAId = regJson.patient.id;
    patientAMRN = regJson.patient.mrn;
    expect(patientAMRN).toMatch(/^NX-/);

    // 2. Receptionist schedules an appointment for tomorrow
    const startTime = new Date('2026-11-25T10:00:00.000Z');
    const endTime = new Date('2026-11-25T10:30:00.000Z');

    const aptReq = makeRequest(
      'http://localhost:3000/api/appointments',
      'POST',
      receptionistAToken,
      {
        patientId: patientAId,
        doctorId: doctorUserA.id,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        reason: 'Persistent cough, fever and fatigue',
      }
    );
    const aptRes = await createAppointmentHandler(aptReq);
    expect(aptRes.status).toBe(201);
    const aptJson = await aptRes.json();
    expect(aptJson.appointment).toBeDefined();
    expect(aptJson.appointment.status).toBe(AppointmentStatus.SCHEDULED);
    expect(aptJson.appointment.patient.id).toBe(patientAId);
    appointmentAId = aptJson.appointment.id;
  });

  it('Step 2: Appointment queue visibility and check-in transition', async () => {
    // 1. Check queue in Clinic A for the target appointment date
    const queueReq = makeRequest(
      'http://localhost:3000/api/queue?date=2026-11-25',
      'GET',
      receptionistAToken
    );
    const queueRes = await getQueueHandler(queueReq);
    expect(queueRes.status).toBe(200);
    const queueJson = await queueRes.json();
    expect(Array.isArray(queueJson.queue)).toBe(true);
    const found = queueJson.queue.find((a: { id: string }) => a.id === appointmentAId);
    expect(found).toBeDefined();
    expect(found.status).toBe(AppointmentStatus.SCHEDULED);

    // 2. Receptionist checks in the patient
    const checkinReq = makeRequest(
      `http://localhost:3000/api/appointments/${appointmentAId}`,
      'PATCH',
      receptionistAToken,
      {
        status: AppointmentStatus.CHECKED_IN,
      }
    );
    const checkinRes = await updateAppointmentHandler(checkinReq, {
      params: Promise.resolve({ appointmentId: appointmentAId }),
    });
    expect(checkinRes.status).toBe(200);
    const checkinJson = await checkinRes.json();
    expect(checkinJson.appointment.status).toBe(AppointmentStatus.CHECKED_IN);
    expect(checkinJson.appointment.checkedInAt).toBeDefined();

    // 3. Verify cross-clinic queue isolation: Doctor B in Clinic B does NOT see Clinic A appointment
    const queueBReq = makeRequest(
      'http://localhost:3000/api/queue?date=2026-11-25',
      'GET',
      doctorBToken
    );
    const queueBRes = await getQueueHandler(queueBReq);
    expect(queueBRes.status).toBe(200);
    const queueBJson = await queueBRes.json();
    const foundInB = queueBJson.queue.find((a: { id: string }) => a.id === appointmentAId);
    expect(foundInB).toBeUndefined();
  });

  it('Step 3: Doctor creates a DRAFT consultation, transitioning appointment to IN_PROGRESS', async () => {
    const consultReq = makeRequest(
      'http://localhost:3000/api/consultations',
      'POST',
      doctorAToken,
      {
        patientId: patientAId,
        appointmentId: appointmentAId,
        status: 'DRAFT',
        subjective: 'Patient presents with 4-day history of dry cough and fever',
        objective: 'Lungs clear to auscultation bilaterally',
        assessment: 'Suspected viral bronchitis',
        plan: 'Supportive care, hydration, monitor temperature',
        vitals: {
          systolicBp: 120,
          diastolicBp: 80,
          heartRate: 78,
          temperature: 99.4,
          temperatureUnit: 'F',
          respiratoryRate: 18,
          oxygenSaturation: 98,
          height: 172,
          heightUnit: 'cm',
          weight: 70,
          weightUnit: 'kg',
        },
        diagnoses: [
          {
            name: 'Acute bronchitis, unspecified',
            codeSystem: 'ICD-10',
            code: 'J20.9',
            type: 'PRIMARY',
          },
        ],
      }
    );
    const consultRes = await createConsultationHandler(consultReq);
    expect(consultRes.status).toBe(201);
    const consultJson = await consultRes.json();
    expect(consultJson.consultation).toBeDefined();
    expect(consultJson.consultation.status).toBe(ConsultationStatus.DRAFT);
    expect(consultJson.consultation.version).toBe(1);
    expect(consultJson.consultation.patientId).toBe(patientAId);
    consultationAId = consultJson.consultation.id;

    // Check observation BMI auto-calculation (70kg, 172cm -> ~23.66)
    expect(consultJson.consultation.observations.length).toBe(1);
    expect(consultJson.consultation.observations[0].bmi).toBeCloseTo(23.66, 1);

    // Verify appointment automatically moved to IN_PROGRESS
    const apt = await prisma.appointment.findUnique({ where: { id: appointmentAId } });
    expect(apt?.status).toBe(AppointmentStatus.IN_PROGRESS);
    expect(apt?.inProgressAt).toBeDefined();

    // Verify audit log for creation
    const audit = await prisma.clinicalAuditLog.findFirst({
      where: { consultationId: consultationAId, action: 'CREATE' },
    });
    expect(audit).toBeDefined();
    expect(audit?.actorId).toBe(doctorUserA.id);
  });

  it('Step 4: Draft retrieval and incremental update', async () => {
    // 1. Retrieve draft by ID
    const getReq = makeRequest(
      `http://localhost:3000/api/consultations/${consultationAId}`,
      'GET',
      doctorAToken
    );
    const getRes = await getConsultationHandler(getReq, {
      params: Promise.resolve({ consultationId: consultationAId }),
    });
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.consultation.id).toBe(consultationAId);
    expect(getJson.consultation.status).toBe(ConsultationStatus.DRAFT);
    expect(getJson.consultation.observations.length).toBe(1);
    expect(getJson.consultation.diagnoses.length).toBe(1);

    // 2. Doctor updates draft SOAP content
    const patchReq = makeRequest(
      `http://localhost:3000/api/consultations/${consultationAId}`,
      'PATCH',
      doctorAToken,
      {
        subjective: 'Patient reports cough worsening at night; throat irritation present.',
        assessment: 'Acute viral bronchitis with nighttime paroxysms',
      }
    );
    const patchRes = await updateConsultationHandler(patchReq, {
      params: Promise.resolve({ consultationId: consultationAId }),
    });
    expect(patchRes.status).toBe(200);
    const patchJson = await patchRes.json();
    expect(patchJson.consultation.subjective).toBe(
      'Patient reports cough worsening at night; throat irritation present.'
    );
    expect(patchJson.consultation.status).toBe(ConsultationStatus.DRAFT);
    expect(patchJson.consultation.version).toBe(1);
  });

  it('Step 5 & 6: Finalization with prescription attachment, version snapshot, appointment completion, and audit log', async () => {
    const finalizeReq = makeRequest(
      `http://localhost:3000/api/consultations/${consultationAId}`,
      'PATCH',
      doctorAToken,
      {
        status: 'FINALIZED',
        plan: 'Prescribed Azithromycin and cough linctus. Advised warm fluids and 5 days rest.',
        prescriptions: [
          {
            status: 'ACTIVE',
            notes: 'Complete full course of antibiotics',
            items: [
              {
                medicationName: 'Azithromycin',
                strength: '500mg',
                route: 'ORAL',
                frequency: 'ONCE_DAILY',
                duration: '5 days',
                quantity: '5 tablets',
                instructions: 'Take 1 tablet daily after food',
              },
            ],
          },
        ],
      }
    );
    const finalizeRes = await updateConsultationHandler(finalizeReq, {
      params: Promise.resolve({ consultationId: consultationAId }),
    });
    expect(finalizeRes.status).toBe(200);
    const finalizeJson = await finalizeRes.json();
    expect(finalizeJson.consultation.status).toBe(ConsultationStatus.FINALIZED);
    expect(finalizeJson.consultation.finalizedAt).toBeDefined();
    expect(finalizeJson.consultation.version).toBe(1);

    // Verify linked appointment transitioned to COMPLETED
    const completedApt = await prisma.appointment.findUnique({ where: { id: appointmentAId } });
    expect(completedApt?.status).toBe(AppointmentStatus.COMPLETED);
    expect(completedApt?.completedAt).toBeDefined();

    // Verify ConsultationVersion 1 snapshot created
    expect(finalizeJson.consultation.versions.length).toBe(1);
    const v1 = finalizeJson.consultation.versions[0];
    expect(v1.versionNumber).toBe(1);
    expect(v1.status).toBe(ConsultationStatus.FINALIZED);
    expect(v1.doctorId).toBe(doctorUserA.id);

    // Verify snapshot prescription items
    const rxSnapshot = v1.prescriptionsSnapshot as unknown as Array<{
      id: string;
      items: Array<{ medicationName: string }>;
    }>;
    expect(Array.isArray(rxSnapshot)).toBe(true);
    expect(rxSnapshot.length).toBe(1);
    expect(rxSnapshot[0].items[0].medicationName).toBe('Azithromycin');
    prescriptionAId = finalizeJson.consultation.prescriptions[0].id;
    expect(rxSnapshot[0].id).toBe(prescriptionAId);

    // Verify FINALIZE audit log
    const finalizeAudit = await prisma.clinicalAuditLog.findFirst({
      where: { consultationId: consultationAId, action: 'FINALIZE' },
    });
    expect(finalizeAudit).toBeDefined();
    expect(finalizeAudit?.details).toContain('Finalized');

    // Verify prescription is retrievable via prescription list endpoint scoped to patient
    const listRxReq = makeRequest(
      `http://localhost:3000/api/prescriptions?patientId=${patientAId}`,
      'GET',
      doctorAToken
    );
    const listRxRes = await listPrescriptionsHandler(listRxReq);
    expect(listRxRes.status).toBe(200);
    const listRxJson = await listRxRes.json();
    expect(Array.isArray(listRxJson.prescriptions)).toBe(true);
    expect(listRxJson.prescriptions.length).toBe(1);
    expect(listRxJson.prescriptions[0].id).toBe(prescriptionAId);

    // Verify prescription is retrievable via single prescription detail endpoint
    const rxReq = makeRequest(
      `http://localhost:3000/api/prescriptions/${prescriptionAId}`,
      'GET',
      doctorAToken
    );
    const rxRes = await getPrescriptionHandler(rxReq, {
      params: Promise.resolve({ prescriptionId: prescriptionAId }),
    });
    expect(rxRes.status).toBe(200);
    const rxJson = await rxRes.json();
    expect(rxJson.prescription.status).toBe(PrescriptionStatus.ACTIVE);
    expect(rxJson.prescription.patientId).toBe(patientAId);
    expect(rxJson.prescription.items.length).toBe(1);
  });

  it('Step 7: Enforce amendment reason and verify consultation amendment with immutable history', async () => {
    // 1. Reject modification without amendmentReason
    const invalidAmendReq = makeRequest(
      `http://localhost:3000/api/consultations/${consultationAId}`,
      'PATCH',
      doctorAToken,
      {
        plan: 'Attempted stealth modification without reason',
      }
    );
    const invalidAmendRes = await updateConsultationHandler(invalidAmendReq, {
      params: Promise.resolve({ consultationId: consultationAId }),
    });
    expect(invalidAmendRes.status).toBe(400);
    const invalidJson = await invalidAmendRes.json();
    expect(invalidJson.error).toContain('valid amendment reason');

    // 2. Reject short/whitespace amendmentReason
    const whitespaceReq = makeRequest(
      `http://localhost:3000/api/consultations/${consultationAId}`,
      'PATCH',
      doctorAToken,
      {
        amendmentReason: '  ok ',
      }
    );
    const whitespaceRes = await updateConsultationHandler(whitespaceReq, {
      params: Promise.resolve({ consultationId: consultationAId }),
    });
    expect(whitespaceRes.status).toBe(400);

    // 3. Valid amendment with reason and updated secondary diagnosis
    const validAmendReq = makeRequest(
      `http://localhost:3000/api/consultations/${consultationAId}`,
      'PATCH',
      doctorAToken,
      {
        amendmentReason: 'Added allergic rhinitis as secondary diagnosis following allergy history review',
        assessment: 'Acute viral bronchitis with underlying allergic rhinitis',
        diagnoses: [
          {
            name: 'Acute bronchitis, unspecified',
            codeSystem: 'ICD-10',
            code: 'J20.9',
            type: 'PRIMARY',
            clinicalStatus: 'ACTIVE',
          },
          {
            name: 'Allergic rhinitis, unspecified',
            codeSystem: 'ICD-10',
            code: 'J30.9',
            type: 'SECONDARY',
            clinicalStatus: 'ACTIVE',
          },
        ],
      }
    );
    const validAmendRes = await updateConsultationHandler(validAmendReq, {
      params: Promise.resolve({ consultationId: consultationAId }),
    });
    expect(validAmendRes.status).toBe(200);
    const amendJson = await validAmendRes.json();
    expect(amendJson.consultation.status).toBe(ConsultationStatus.AMENDED);
    expect(amendJson.consultation.version).toBe(2);
    expect(amendJson.consultation.amendedAt).toBeDefined();
    expect(amendJson.consultation.amendmentReason).toContain('allergic rhinitis');

    // Verify 2 versions now exist in history
    expect(amendJson.consultation.versions.length).toBe(2);
    expect(amendJson.consultation.versions[0].versionNumber).toBe(1);
    expect(amendJson.consultation.versions[1].versionNumber).toBe(2);

    // Verify version 1 remains immutable
    expect(amendJson.consultation.versions[0].assessment).toBe(
      'Acute viral bronchitis with nighttime paroxysms'
    );
    expect(amendJson.consultation.versions[1].assessment).toBe(
      'Acute viral bronchitis with underlying allergic rhinitis'
    );

    // Verify prior diagnoses were archived (isCurrent: false) and not deleted
    const allDbDiagnoses = await prisma.diagnosis.findMany({
      where: { consultationId: consultationAId },
      orderBy: { createdAt: 'asc' },
    });
    expect(allDbDiagnoses.length).toBe(3); // 1 original + 2 new
    const archived = allDbDiagnoses.filter((d) => !d.isCurrent);
    const current = allDbDiagnoses.filter((d) => d.isCurrent);
    expect(archived.length).toBe(1);
    expect(current.length).toBe(2);

    // Verify AMEND audit log
    const amendAudit = await prisma.clinicalAuditLog.findFirst({
      where: { consultationId: consultationAId, action: 'AMEND' },
    });
    expect(amendAudit).toBeDefined();
    expect(amendAudit?.details).toContain('Amended consultation to version 2');
  });

  it('Step 8: Longitudinal patient history retrieval', async () => {
    const historyReq = makeRequest(
      `http://localhost:3000/api/patients/${patientAId}/clinical-history`,
      'GET',
      doctorAToken
    );
    const historyRes = await getClinicalHistoryHandler(historyReq, {
      params: Promise.resolve({ patientId: patientAId }),
    });
    expect(historyRes.status).toBe(200);
    const historyJson = await historyRes.json();

    // Patient demographics
    expect(historyJson.patient.name).toBe('Gopal Krishna Shrestha');
    expect(historyJson.patient.mrn).toBe(patientAMRN);

    // Consultations & versions
    expect(historyJson.consultations.length).toBe(1);
    expect(historyJson.consultations[0].versions.length).toBe(2);

    // Observations & Prescriptions
    expect(historyJson.observations.length).toBe(1);
    expect(historyJson.prescriptions.length).toBe(1);
    expect(historyJson.prescriptions[0].items.length).toBe(1);

    // Audit logs (CREATE, FINALIZE, AMEND)
    expect(historyJson.auditLogs.length).toBeGreaterThanOrEqual(3);
    const actions = historyJson.auditLogs.map((a: { action: string }) => a.action);
    expect(actions).toContain('CREATE');
    expect(actions).toContain('FINALIZE');
    expect(actions).toContain('AMEND');
  });

  describe('Step 9: Security, RBAC & Cross-Tenant Isolation Enforcement', () => {
    it('rejects clinical history access for unauthorized role (STAFF)', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/patients/${patientAId}/clinical-history`,
        'GET',
        staffAToken
      );
      const res = await getClinicalHistoryHandler(req, {
        params: Promise.resolve({ patientId: patientAId }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Insufficient permissions');
    });

    it('rejects consultation viewing for RECEPTIONIST (lacks clinical:records:read)', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/consultations/${consultationAId}`,
        'GET',
        receptionistAToken
      );
      const res = await getConsultationHandler(req, {
        params: Promise.resolve({ consultationId: consultationAId }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Insufficient permissions');
    });

    it('rejects consultation editing for RECEPTIONIST (lacks clinical:records:write)', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/consultations/${consultationAId}`,
        'PATCH',
        receptionistAToken,
        {
          amendmentReason: 'Unauthorized reception edit',
          plan: 'Should be rejected',
        }
      );
      const res = await updateConsultationHandler(req, {
        params: Promise.resolve({ consultationId: consultationAId }),
      });
      expect(res.status).toBe(403);
    });

    it('rejects Doctor B (Clinic B) from accessing Clinic A clinical history (returns 404 without info leakage)', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/patients/${patientAId}/clinical-history`,
        'GET',
        doctorBToken
      );
      const res = await getClinicalHistoryHandler(req, {
        params: Promise.resolve({ patientId: patientAId }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Patient not found in active clinic');
    });

    it('rejects Doctor B (Clinic B) from accessing Clinic A consultation (returns 404 without info leakage)', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/consultations/${consultationAId}`,
        'GET',
        doctorBToken
      );
      const res = await getConsultationHandler(req, {
        params: Promise.resolve({ consultationId: consultationAId }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Consultation record not found in the active clinic');
    });

    it('rejects Doctor B (Clinic B) from amending Clinic A consultation', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/consultations/${consultationAId}`,
        'PATCH',
        doctorBToken,
        {
          amendmentReason: 'Malicious cross clinic modification',
          plan: 'Should never be applied',
        }
      );
      const res = await updateConsultationHandler(req, {
        params: Promise.resolve({ consultationId: consultationAId }),
      });
      expect(res.status).toBe(404);
    });

    it('rejects Doctor B (Clinic B) from accessing Clinic A prescription', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/prescriptions/${prescriptionAId}`,
        'GET',
        doctorBToken
      );
      const res = await getPrescriptionHandler(req, {
        params: Promise.resolve({ prescriptionId: prescriptionAId }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Prescription record not found in active clinic');
    });

    it('rejects Doctor B from updating Clinic A prescription status', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/prescriptions/${prescriptionAId}`,
        'PATCH',
        doctorBToken,
        {
          status: 'CANCELLED',
        }
      );
      const res = await updatePrescriptionHandler(req, {
        params: Promise.resolve({ prescriptionId: prescriptionAId }),
      });
      expect(res.status).toBe(404);
    });

    it('rejects Doctor A from supplying Clinic B id via query parameter without active membership', async () => {
      const req = makeRequest(
        `http://localhost:3000/api/consultations?clinicId=${clinicBId}`,
        'GET',
        doctorAToken
      );
      const res = await listConsultationsHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Access denied');
    });
  });
});
