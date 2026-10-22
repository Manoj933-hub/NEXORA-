import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { GET as listConsultationsHandler, POST as createConsultationHandler } from './route';
import { GET as getConsultationHandler, PATCH as updateConsultationHandler } from './[consultationId]/route';
import { GET as getClinicalHistoryHandler } from '../patients/[patientId]/clinical-history/route';
import { GET as getPrescriptionsHandler } from '../prescriptions/route';
import { GET as getPrescriptionByIdHandler, PATCH as updatePrescriptionHandler } from '../prescriptions/[prescriptionId]/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { ClinicRole } from '@/lib/auth/permissions';
import { ConsultationStatus, AppointmentStatus } from '@prisma/client';

describe('Task 005: Electronic Medical Records, SOAP Consultations, Vitals, Rx & Audit Trail', () => {
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
  let appointmentAId: string;
  let appointmentBId: string;

  let testConsultationId: string;
  let testPrescriptionId: string;

  async function cleanupTestData() {
    const existingUsers = await prisma.user.findMany({
      where: {
        email: {
          in: [
            'doc.emr.a@nexora.test',
            'rec.emr.a@nexora.test',
            'staff.emr.a@nexora.test',
            'doc.emr.b@nexora.test',
          ],
        },
      },
      select: { id: true },
    });
    const userIds = existingUsers.map((u) => u.id);

    if (userIds.length > 0) {
      await prisma.clinicalAuditLog.deleteMany({ where: { actorId: { in: userIds } } }).catch(() => {});
      await prisma.consultationVersion.deleteMany({
        where: { OR: [{ doctorId: { in: userIds } }, { amendedById: { in: userIds } }] },
      }).catch(() => {});
      await prisma.prescriptionItem.deleteMany({
        where: { prescription: { doctorId: { in: userIds } } },
      }).catch(() => {});
      await prisma.prescription.deleteMany({ where: { doctorId: { in: userIds } } }).catch(() => {});
      await prisma.observation.deleteMany({
        where: { consultation: { doctorId: { in: userIds } } },
      }).catch(() => {});
      await prisma.diagnosis.deleteMany({
        where: { consultation: { doctorId: { in: userIds } } },
      }).catch(() => {});
      await prisma.consultation.deleteMany({ where: { doctorId: { in: userIds } } }).catch(() => {});
      await prisma.appointment.deleteMany({ where: { doctorId: { in: userIds } } }).catch(() => {});
      await prisma.patient.deleteMany({ where: { clinic: { memberships: { some: { userId: { in: userIds } } } } } }).catch(() => {});
      await prisma.membership.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
      await prisma.clinic.deleteMany({ where: { memberships: { some: { userId: { in: userIds } } } } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
    }
  }

  beforeAll(async () => {
    // Cleanup prior test records in dependency order
    await cleanupTestData();

    // Create users
    doctorUserA = await prisma.user.create({
      data: {
        email: 'doc.emr.a@nexora.test',
        name: 'Dr. Aarav Sharma',
        passwordHash: '$2a$12$fakehashforemr123456789012345678901234567890',
      },
    });

    receptionistUserA = await prisma.user.create({
      data: {
        email: 'rec.emr.a@nexora.test',
        name: 'Sunita Frontdesk',
        passwordHash: '$2a$12$fakehashforemr123456789012345678901234567890',
      },
    });

    staffUserA = await prisma.user.create({
      data: {
        email: 'staff.emr.a@nexora.test',
        name: 'Bikash Helper',
        passwordHash: '$2a$12$fakehashforemr123456789012345678901234567890',
      },
    });

    doctorUserB = await prisma.user.create({
      data: {
        email: 'doc.emr.b@nexora.test',
        name: 'Dr. Priya Patel',
        passwordHash: '$2a$12$fakehashforemr123456789012345678901234567890',
      },
    });

    // Create clinics
    const clinicA = await prisma.clinic.create({
      data: {
        name: 'City Care Hospital A',
        slug: `city-care-emr-a-${Date.now()}`,
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
        slug: `metro-health-emr-b-${Date.now()}`,
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
        mrn: 'NX-9001',
        name: 'Ram Bahadur Thapa',
        gender: 'MALE',
        dateOfBirth: new Date('1985-05-12'),
        phone: '+9779841234567',
        bloodGroup: 'B+',
        allergies: 'Penicillin, Dust',
      },
    });
    patientAId = patientA.id;

    const patientB = await prisma.patient.create({
      data: {
        clinicId: clinicBId,
        mrn: 'NX-9002',
        name: 'Sita Kumari Devi',
        gender: 'FEMALE',
        phone: '+919876543210',
      },
    });
    patientBId = patientB.id;

    // Create appointment in Clinic A
    const aptA = await prisma.appointment.create({
      data: {
        clinicId: clinicAId,
        patientId: patientAId,
        doctorId: doctorUserA.id,
        startTime: new Date('2026-10-22T09:00:00Z'),
        endTime: new Date('2026-10-22T09:30:00Z'),
        status: AppointmentStatus.CHECKED_IN,
        reason: 'Severe fever and body ache',
      },
    });
    appointmentAId = aptA.id;

    // Create appointment in Clinic B (for cross-clinic rejection test)
    const aptB = await prisma.appointment.create({
      data: {
        clinicId: clinicBId,
        patientId: patientBId,
        doctorId: doctorUserB.id,
        startTime: new Date('2026-10-22T10:00:00Z'),
        endTime: new Date('2026-10-22T10:30:00Z'),
        status: AppointmentStatus.CHECKED_IN,
        reason: 'Routine checkup Clinic B',
      },
    });
    appointmentBId = aptB.id;

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
    token: string,
    body?: Record<string, unknown>
  ) {
    return new Request(urlStr, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Host: 'localhost:3000',
        Origin: 'http://localhost:3000',
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  it('1. Rejects consultation creation from unauthorized roles (RECEPTIONIST & STAFF)', async () => {
    // Receptionist has patients:read/write, but NOT clinical:records:write
    const reqRec = makeRequest('http://localhost:3000/api/consultations', 'POST', receptionistAToken, {
      patientId: patientAId,
      subjective: 'Attempting to write consultation',
    });
    const resRec = await createConsultationHandler(reqRec);
    expect(resRec.status).toBe(403);

    // Staff has no clinical permissions
    const reqStaff = makeRequest('http://localhost:3000/api/consultations', 'POST', staffAToken, {
      patientId: patientAId,
      subjective: 'Staff attempting write',
    });
    const resStaff = await createConsultationHandler(reqStaff);
    expect(resStaff.status).toBe(403);
  });

  it('2. Validates vital signs physiological ranges and unit rules', async () => {
    // Invalid: systolic <= diastolic
    const reqInvertedBP = makeRequest('http://localhost:3000/api/consultations', 'POST', doctorAToken, {
      patientId: patientAId,
      vitals: {
        systolicBp: 80,
        diastolicBp: 120, // Diastolic cannot exceed systolic
      },
    });
    const resInverted = await createConsultationHandler(reqInvertedBP);
    expect(resInverted.status).toBe(400);
    const dataInverted = await resInverted.json();
    expect(dataInverted.error).toBe('Validation failed');

    // Invalid: Unrealistic body temperature in Fahrenheit
    const reqExtremeTemp = makeRequest('http://localhost:3000/api/consultations', 'POST', doctorAToken, {
      patientId: patientAId,
      vitals: {
        temperature: 130, // Normal range 85-115 F
        temperatureUnit: 'F',
      },
    });
    const resTemp = await createConsultationHandler(reqExtremeTemp);
    expect(resTemp.status).toBe(400);

    // Invalid: Oxygen saturation > 100%
    const reqSpO2 = makeRequest('http://localhost:3000/api/consultations', 'POST', doctorAToken, {
      patientId: patientAId,
      vitals: {
        oxygenSaturation: 105,
      },
    });
    const resSpO2 = await createConsultationHandler(reqSpO2);
    expect(resSpO2.status).toBe(400);
  });

  it('3. Rejects consultation creation for a patient belonging to a different clinic', async () => {
    // Doctor A belongs to Clinic A, attempting to create consultation for Patient B (Clinic B)
    const reqCrossClinic = makeRequest('http://localhost:3000/api/consultations', 'POST', doctorAToken, {
      patientId: patientBId,
      subjective: 'Cross-clinic patient inquiry',
    });
    const res = await createConsultationHandler(reqCrossClinic);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('Patient not found in the active clinic');
  });

  it('4. Successfully creates a structured draft consultation with SOAP, vitals, diagnoses, prescriptions, and audit log', async () => {
    const payload = {
      patientId: patientAId,
      appointmentId: appointmentAId,
      status: 'DRAFT',
      subjective: 'Patient reports high fever for 3 days with chills, sore throat, and dry cough.',
      objective: 'Throat erythematous, bilateral tonsillar enlargement. Chest clear on auscultation.',
      assessment: 'Acute viral pharyngitis with secondary upper respiratory tract infection.',
      plan: 'Hydration, warm saline gargles, antipyretics, and review in 3 days if fever persists.',
      vitals: {
        systolicBp: 120,
        diastolicBp: 80,
        heartRate: 78,
        temperature: 101.4,
        temperatureUnit: 'F',
        respiratoryRate: 18,
        oxygenSaturation: 98.0,
        height: 172.0,
        heightUnit: 'cm',
        weight: 68.0,
        weightUnit: 'kg',
        notes: 'Vitals recorded pre-consultation',
      },
      diagnoses: [
        {
          name: 'Acute pharyngitis',
          codeSystem: 'ICD-10',
          code: 'J02.9',
          type: 'PRIMARY',
          clinicalStatus: 'ACTIVE',
        },
        {
          name: 'Seasonal allergic rhinitis',
          codeSystem: 'ICD-10',
          code: 'J30.2',
          type: 'SECONDARY',
          clinicalStatus: 'ACTIVE',
        },
      ],
      prescriptions: [
        {
          status: 'ACTIVE',
          notes: 'Take medicines after food with plenty of fluids',
          items: [
            {
              medicationName: 'Paracetamol',
              strength: '500 mg',
              route: 'ORAL',
              frequency: '1-1-1 (TDS)',
              duration: '3 days',
              quantity: '9 tablets',
              instructions: 'Take 1 tablet after meals if temperature > 100 F',
            },
            {
              medicationName: 'Cetirizine',
              strength: '10 mg',
              route: 'ORAL',
              frequency: '0-0-1 (Nightly)',
              duration: '5 days',
              quantity: '5 tablets',
              instructions: 'Take at bedtime',
            },
          ],
        },
      ],
    };

    const req = makeRequest('http://localhost:3000/api/consultations', 'POST', doctorAToken, payload);
    const res = await createConsultationHandler(req);
    expect(res.status).toBe(201);

    const data = await res.json();
    const c = data.consultation;
    expect(c).toBeDefined();
    expect(c.id).toBeDefined();
    testConsultationId = c.id;

    expect(c.status).toBe(ConsultationStatus.DRAFT);
    expect(c.subjective).toContain('Patient reports high fever');
    expect(c.doctorId).toBe(doctorUserA.id);
    expect(c.patientId).toBe(patientAId);
    expect(c.appointmentId).toBe(appointmentAId);

    // Verify automated BMI calculation (68 kg / (1.72 m)^2 = 23.0)
    expect(c.observations.length).toBe(1);
    expect(c.observations[0].bmi).toBe(23.0);
    expect(c.observations[0].systolicBp).toBe(120);

    // Verify diagnoses
    expect(c.diagnoses.length).toBe(2);
    expect(c.diagnoses[0].name).toBe('Acute pharyngitis');

    // Verify prescription & items
    expect(c.prescriptions.length).toBe(1);
    testPrescriptionId = c.prescriptions[0].id;
    expect(c.prescriptions[0].items.length).toBe(2);
    expect(c.prescriptions[0].items[0].medicationName).toBe('Paracetamol');

    // Verify linked appointment was transitioned to IN_PROGRESS
    const linkedApt = await prisma.appointment.findUnique({ where: { id: appointmentAId } });
    expect(linkedApt?.status).toBe(AppointmentStatus.IN_PROGRESS);

    // Verify audit log
    expect(c.auditLogs.length).toBeGreaterThanOrEqual(1);
    expect(c.auditLogs[0].action).toBe('CREATE');
    expect(c.auditLogs[0].actorRole).toBe('DOCTOR');
  });

  it('5. Lists consultations with patient and status filtering', async () => {
    const req = makeRequest(
      `http://localhost:3000/api/consultations?patientId=${patientAId}&status=DRAFT`,
      'GET',
      doctorAToken
    );
    const res = await listConsultationsHandler(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.consultations).toBeDefined();
    expect(data.consultations.length).toBeGreaterThanOrEqual(1);
    expect(data.consultations[0].id).toBe(testConsultationId);
    expect(data.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('6. Rejects clinical records list access from unauthorized roles without clinical:records:read', async () => {
    const req = makeRequest('http://localhost:3000/api/consultations', 'GET', staffAToken);
    const res = await listConsultationsHandler(req);
    expect(res.status).toBe(403);
  });

  it('7. Retrieves consultation detail by ID', async () => {
    const req = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'GET',
      doctorAToken
    );
    const res = await getConsultationHandler(req, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.consultation.id).toBe(testConsultationId);
    expect(data.consultation.patient.name).toBe('Ram Bahadur Thapa');
    expect(data.consultation.doctor.name).toBe('Dr. Aarav Sharma');
  });

  it('8. Updates draft consultation and adds updated assessment notes', async () => {
    const req = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'PATCH',
      doctorAToken,
      {
        assessment: 'Acute viral pharyngitis with mild dehydration.',
        plan: 'Increase oral fluid intake to 3L/day. Follow up in 48 hours.',
      }
    );

    const res = await updateConsultationHandler(req, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.consultation.assessment).toContain('mild dehydration');
    expect(data.consultation.status).toBe(ConsultationStatus.DRAFT);
  });

  it('9. Finalizes consultation, completing linked appointment and recording FINALIZE audit log', async () => {
    const req = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'PATCH',
      doctorAToken,
      {
        status: 'FINALIZED',
      }
    );

    const res = await updateConsultationHandler(req, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    const c = data.consultation;
    expect(c.status).toBe(ConsultationStatus.FINALIZED);
    expect(c.finalizedAt).not.toBeNull();

    // Verify appointment was marked COMPLETED
    const linkedApt = await prisma.appointment.findUnique({ where: { id: appointmentAId } });
    expect(linkedApt?.status).toBe(AppointmentStatus.COMPLETED);
    expect(linkedApt?.completedAt).not.toBeNull();

    // Verify FINALIZE audit log
    const auditLogs = await prisma.clinicalAuditLog.findMany({
      where: { consultationId: testConsultationId },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditLogs[0].action).toBe('FINALIZE');

    // Verify ConsultationVersion snapshot accurately represents persisted prescriptions and items with IDs
    const v1 = await prisma.consultationVersion.findFirst({
      where: { consultationId: testConsultationId, versionNumber: 1 },
    });
    expect(v1).not.toBeNull();
    const rxSnapshot = v1?.prescriptionsSnapshot as Array<{
      id: string;
      status: string;
      notes: string | null;
      items: Array<{ id: string; medicationName: string }>;
    }>;
    expect(rxSnapshot).toBeDefined();
    expect(rxSnapshot.length).toBe(1);
    expect(rxSnapshot[0].id).toBe(testPrescriptionId);
    expect(rxSnapshot[0].items.length).toBe(2);
    expect(rxSnapshot[0].items[0].id).toBeDefined();
    expect(rxSnapshot[0].items[1].id).toBeDefined();
    const medNames = rxSnapshot[0].items.map((i) => i.medicationName);
    expect(medNames).toContain('Paracetamol');
    expect(medNames).toContain('Cetirizine');
  });

  it('10. Prevents modification of finalized consultation without an amendment reason', async () => {
    const req = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'PATCH',
      doctorAToken,
      {
        plan: 'Attempting silent overwrite without reason',
      }
    );

    const res = await updateConsultationHandler(req, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain('amendment reason');
  });

  it('11. Successfully amends finalized consultation when amendment reason is supplied', async () => {
    const req = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'PATCH',
      doctorAToken,
      {
        plan: 'Hydration, warm saline gargles, added vitamin C supplement.',
        amendmentReason: 'Patient called reporting mild scurvy history; added ascorbic acid.',
      }
    );

    const res = await updateConsultationHandler(req, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    const c = data.consultation;
    expect(c.status).toBe(ConsultationStatus.AMENDED);
    expect(c.amendedAt).not.toBeNull();
    expect(c.amendmentReason).toContain('Patient called reporting mild scurvy');

    // Verify AMEND audit log
    const auditLogs = await prisma.clinicalAuditLog.findMany({
      where: { consultationId: testConsultationId },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditLogs[0].action).toBe('AMEND');
    expect(auditLogs[0].details).toContain('ascorbic acid');
  });

  it('12. Rejects cross-clinic consultation access and amendment', async () => {
    // Doctor B belongs to Clinic B, attempting to read or amend Doctor A's consultation in Clinic A
    const reqGet = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'GET',
      doctorBToken
    );
    const resGet = await getConsultationHandler(reqGet, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(resGet.status).toBe(404);

    const reqPatch = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'PATCH',
      doctorBToken,
      {
        plan: 'Cross clinic tampering',
        amendmentReason: 'Malicious attempt',
      }
    );
    const resPatch = await updateConsultationHandler(reqPatch, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(resPatch.status).toBe(404);
  });

  it('13. Retrieves patient longitudinal clinical history with consultations, vitals, diagnoses, and prescriptions', async () => {
    const req = makeRequest(
      `http://localhost:3000/api/patients/${patientAId}/clinical-history`,
      'GET',
      doctorAToken
    );
    const res = await getClinicalHistoryHandler(req, {
      params: Promise.resolve({ patientId: patientAId }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.patient.mrn).toBe('NX-9001');
    expect(data.consultations.length).toBeGreaterThanOrEqual(1);
    expect(data.observations.length).toBeGreaterThanOrEqual(1);
    expect(data.diagnoses.length).toBeGreaterThanOrEqual(2);
    expect(data.prescriptions.length).toBeGreaterThanOrEqual(1);
    expect(data.auditLogs.length).toBeGreaterThanOrEqual(3);
  });

  it('14. Manages prescription lifecycle and updates status with audit log', async () => {
    // List prescriptions
    const reqList = makeRequest(
      `http://localhost:3000/api/prescriptions?patientId=${patientAId}`,
      'GET',
      doctorAToken
    );
    const resList = await getPrescriptionsHandler(reqList);
    expect(resList.status).toBe(200);
    const listData = await resList.json();
    expect(listData.prescriptions.length).toBeGreaterThanOrEqual(1);

    // Get single prescription
    const reqGet = makeRequest(
      `http://localhost:3000/api/prescriptions/${testPrescriptionId}`,
      'GET',
      doctorAToken
    );
    const resGet = await getPrescriptionByIdHandler(reqGet, {
      params: Promise.resolve({ prescriptionId: testPrescriptionId }),
    });
    expect(resGet.status).toBe(200);

    // Discontinue prescription
    const reqPatch = makeRequest(
      `http://localhost:3000/api/prescriptions/${testPrescriptionId}`,
      'PATCH',
      doctorAToken,
      {
        status: 'DISCONTINUED',
        notes: 'Discontinued due to complete symptom resolution',
      }
    );
    const resPatch = await updatePrescriptionHandler(reqPatch, {
      params: Promise.resolve({ prescriptionId: testPrescriptionId }),
    });
    expect(resPatch.status).toBe(200);
    const patchData = await resPatch.json();
    expect(patchData.prescription.status).toBe('DISCONTINUED');

    // Verify DISCONTINUE audit log
    const audit = await prisma.clinicalAuditLog.findFirst({
      where: {
        recordId: testPrescriptionId,
        action: 'DISCONTINUE',
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.recordType).toBe('PRESCRIPTION');
  });

  it('15. Original finalized SOAP content remains retrievable in version history after an amendment', async () => {
    // Consultation testConsultationId was finalized, then amended in test 11.
    const req = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'GET',
      doctorAToken
    );
    const res = await getConsultationHandler(req, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    const c = data.consultation;
    expect(c.version).toBe(2);
    expect(c.versions.length).toBeGreaterThanOrEqual(1);

    const v1 = c.versions.find((v: { versionNumber: number }) => v.versionNumber === 1);
    expect(v1).toBeDefined();
    expect(v1.status).toBe('FINALIZED');
    // Original plan from test 8/9 before amendment
    expect(v1.plan).toContain('Increase oral fluid intake to 3L/day');
    expect(v1.subjective).toContain('Patient reports high fever');
    // Current plan has the amendment from test 11
    expect(c.plan).toContain('added vitamin C supplement');
  });

  it('16. Multiple amendments preserve every prior version and increment version counter', async () => {
    // Current version is 2. Perform second amendment:
    const req = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'PATCH',
      doctorAToken,
      {
        plan: 'Hydration, switched to paracetamol syrup, and warm steam inhalation.',
        amendmentReason: 'Patient reported difficulty swallowing tablets; converted paracetamol to syrup.',
      }
    );

    const res = await updateConsultationHandler(req, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    const c = data.consultation;
    expect(c.version).toBe(3);
    expect(c.status).toBe(ConsultationStatus.AMENDED);
    expect(c.amendmentReason).toContain('difficulty swallowing tablets');

    // Verify all versions exist in database (v1 finalized, v2 amended, v3 amended)
    const versionsInDb = await prisma.consultationVersion.findMany({
      where: { consultationId: testConsultationId },
      orderBy: { versionNumber: 'asc' },
    });
    expect(versionsInDb.length).toBe(3);
    expect(versionsInDb[0].versionNumber).toBe(1);
    expect(versionsInDb[0].plan).toContain('Increase oral fluid intake to 3L/day');
    expect(versionsInDb[1].versionNumber).toBe(2);
    expect(versionsInDb[1].plan).toContain('added vitamin C supplement');
    expect(versionsInDb[1].amendmentReason).toContain('Patient called reporting mild scurvy');
    expect(versionsInDb[2].versionNumber).toBe(3);
    expect(versionsInDb[2].plan).toContain('switched to paracetamol syrup');
    expect(versionsInDb[2].amendmentReason).toContain('difficulty swallowing tablets');
  });

  it('17. Rejects amendments with empty, whitespace, or insufficiently descriptive reasons', async () => {
    // Empty reason
    const reqEmpty = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'PATCH',
      doctorAToken,
      {
        plan: 'Tampering without reason',
        amendmentReason: '',
      }
    );
    const resEmpty = await updateConsultationHandler(reqEmpty, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(resEmpty.status).toBe(400);

    // Whitespace reason
    const reqWhitespace = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'PATCH',
      doctorAToken,
      {
        plan: 'Tampering with spaces',
        amendmentReason: '   ',
      }
    );
    const resWhitespace = await updateConsultationHandler(reqWhitespace, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(resWhitespace.status).toBe(400);

    // Too short (< 3 chars)
    const reqShort = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'PATCH',
      doctorAToken,
      {
        plan: 'Tampering with short reason',
        amendmentReason: 'no',
      }
    );
    const resShort = await updateConsultationHandler(reqShort, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(resShort.status).toBe(400);
  });

  it('18. Finalized observations and diagnoses are archived, not deleted, during amendments', async () => {
    // Current consultation is at version 3. Update vitals and diagnoses in amendment:
    const req = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'PATCH',
      doctorAToken,
      {
        amendmentReason: 'Patient returned for Day 3 review; temperature normalized and throat clear.',
        vitals: {
          systolicBp: 118,
          diastolicBp: 76,
          heartRate: 72,
          temperature: 98.4,
          temperatureUnit: 'F',
          respiratoryRate: 16,
          oxygenSaturation: 99.0,
        },
        diagnoses: [
          {
            name: 'Acute pharyngitis, resolved',
            codeSystem: 'ICD-10',
            code: 'J02.9',
            type: 'PRIMARY',
            clinicalStatus: 'RESOLVED',
          },
        ],
      }
    );

    const res = await updateConsultationHandler(req, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(res.status).toBe(200);

    // Verify in DB that historical observations still exist (isCurrent: false)
    const allObservations = await prisma.observation.findMany({
      where: { consultationId: testConsultationId },
      orderBy: { createdAt: 'asc' },
    });
    expect(allObservations.length).toBeGreaterThanOrEqual(2);
    const archivedObs = allObservations.filter((o) => !o.isCurrent);
    const currentObs = allObservations.filter((o) => o.isCurrent);
    expect(archivedObs.length).toBeGreaterThanOrEqual(1);
    expect(currentObs.length).toBe(1);
    expect(currentObs[0].temperature).toBe(98.4);

    // Verify in DB that historical diagnoses still exist (isCurrent: false)
    const allDiagnoses = await prisma.diagnosis.findMany({
      where: { consultationId: testConsultationId },
      orderBy: { createdAt: 'asc' },
    });
    expect(allDiagnoses.length).toBeGreaterThanOrEqual(3);
    const archivedDiag = allDiagnoses.filter((d) => !d.isCurrent);
    const currentDiag = allDiagnoses.filter((d) => d.isCurrent);
    expect(archivedDiag.length).toBeGreaterThanOrEqual(2);
    expect(currentDiag.length).toBe(1);
    expect(currentDiag[0].name).toBe('Acute pharyngitis, resolved');

    // Verify GET only returns active observations and diagnoses
    const reqGet = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'GET',
      doctorAToken
    );
    const resGet = await getConsultationHandler(reqGet, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    const getData = await resGet.json();
    expect(getData.consultation.observations.length).toBe(1);
    expect(getData.consultation.observations[0].temperature).toBe(98.4);
    expect(getData.consultation.diagnoses.length).toBe(1);
    expect(getData.consultation.diagnoses[0].name).toBe('Acute pharyngitis, resolved');
  });

  it('19. Enforces strict prescription status transitions and rejects illegal modifications of terminal states', async () => {
    // Create a new prescription in Clinic A
    const newRx = await prisma.prescription.create({
      data: {
        clinicId: clinicAId,
        patientId: patientAId,
        doctorId: doctorUserA.id,
        status: 'ACTIVE',
        notes: 'Initial active prescription for lifecycle test',
        items: {
          create: [
            {
              medicationName: 'Amoxicillin',
              frequency: '1-0-1',
              duration: '5 days',
            },
          ],
        },
      },
    });

    // 1. Valid transition: ACTIVE -> COMPLETED
    const reqComplete = makeRequest(
      `http://localhost:3000/api/prescriptions/${newRx.id}`,
      'PATCH',
      doctorAToken,
      {
        status: 'COMPLETED',
        notes: 'Full antibiotic course finished',
      }
    );
    const resComplete = await updatePrescriptionHandler(reqComplete, {
      params: Promise.resolve({ prescriptionId: newRx.id }),
    });
    expect(resComplete.status).toBe(200);
    const completeData = await resComplete.json();
    expect(completeData.prescription.status).toBe('COMPLETED');

    // 2. Invalid transition: COMPLETED -> ACTIVE (terminal state)
    const reqReactivate = makeRequest(
      `http://localhost:3000/api/prescriptions/${newRx.id}`,
      'PATCH',
      doctorAToken,
      {
        status: 'ACTIVE',
      }
    );
    const resReactivate = await updatePrescriptionHandler(reqReactivate, {
      params: Promise.resolve({ prescriptionId: newRx.id }),
    });
    expect(resReactivate.status).toBe(400);
    const reactivateData = await resReactivate.json();
    expect(reactivateData.error).toContain('terminal state (COMPLETED) cannot be changed');

    // 3. Invalid transition on testPrescriptionId which is DISCONTINUED: DISCONTINUED -> COMPLETED
    const reqDiscontinuedToCompleted = makeRequest(
      `http://localhost:3000/api/prescriptions/${testPrescriptionId}`,
      'PATCH',
      doctorAToken,
      {
        status: 'COMPLETED',
      }
    );
    const resDiscontinuedToCompleted = await updatePrescriptionHandler(reqDiscontinuedToCompleted, {
      params: Promise.resolve({ prescriptionId: testPrescriptionId }),
    });
    expect(resDiscontinuedToCompleted.status).toBe(400);
    const discData = await resDiscontinuedToCompleted.json();
    expect(discData.error).toContain('terminal state (DISCONTINUED) cannot be changed');
  });

  it('20. Rejects clinical updates from unauthorized roles (RECEPTIONIST and STAFF)', async () => {
    // Receptionist attempting to amend consultation
    const reqRecConsultation = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'PATCH',
      receptionistAToken,
      {
        plan: 'Frontdesk trying to update clinical plan',
        amendmentReason: 'Unwarranted edit',
      }
    );
    const resRecConsultation = await updateConsultationHandler(reqRecConsultation, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(resRecConsultation.status).toBe(403);

    // Staff attempting to amend consultation
    const reqStaffConsultation = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'PATCH',
      staffAToken,
      {
        plan: 'Staff trying to update clinical plan',
        amendmentReason: 'Unwarranted edit',
      }
    );
    const resStaffConsultation = await updateConsultationHandler(reqStaffConsultation, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(resStaffConsultation.status).toBe(403);

    // Receptionist attempting to update prescription
    const reqRecRx = makeRequest(
      `http://localhost:3000/api/prescriptions/${testPrescriptionId}`,
      'PATCH',
      receptionistAToken,
      {
        status: 'DISCONTINUED',
      }
    );
    const resRecRx = await updatePrescriptionHandler(reqRecRx, {
      params: Promise.resolve({ prescriptionId: testPrescriptionId }),
    });
    expect(resRecRx.status).toBe(403);
  });

  it('21. Enforces strict tenant isolation across cross-clinic appointments, prescriptions, and consultations', async () => {
    // 1. Rejects consultation creation referencing cross-clinic appointment
    const reqCrossApt = makeRequest('http://localhost:3000/api/consultations', 'POST', doctorAToken, {
      patientId: patientAId,
      appointmentId: appointmentBId,
      subjective: 'Cross clinic appointment attempt',
    });
    const resCrossApt = await createConsultationHandler(reqCrossApt);
    expect(resCrossApt.status).toBe(404);
    const crossAptData = await resCrossApt.json();
    expect(crossAptData.error).toContain('Appointment not found or does not belong to this patient');

    // 2. Doctor B cannot access or update Doctor A's prescription
    const reqCrossRxGet = makeRequest(
      `http://localhost:3000/api/prescriptions/${testPrescriptionId}`,
      'GET',
      doctorBToken
    );
    const resCrossRxGet = await getPrescriptionByIdHandler(reqCrossRxGet, {
      params: Promise.resolve({ prescriptionId: testPrescriptionId }),
    });
    expect(resCrossRxGet.status).toBe(404);

    const reqCrossRxPatch = makeRequest(
      `http://localhost:3000/api/prescriptions/${testPrescriptionId}`,
      'PATCH',
      doctorBToken,
      {
        status: 'CANCELLED',
      }
    );
    const resCrossRxPatch = await updatePrescriptionHandler(reqCrossRxPatch, {
      params: Promise.resolve({ prescriptionId: testPrescriptionId }),
    });
    expect(resCrossRxPatch.status).toBe(404);

    // 3. Rejects listing prescriptions or consultations for patient in another clinic
    const reqListRxForeign = makeRequest(
      `http://localhost:3000/api/prescriptions?patientId=${patientBId}`,
      'GET',
      doctorAToken
    );
    const resListRxForeign = await getPrescriptionsHandler(reqListRxForeign);
    expect(resListRxForeign.status).toBe(404);

    const reqListConsultForeign = makeRequest(
      `http://localhost:3000/api/consultations?patientId=${patientBId}`,
      'GET',
      doctorAToken
    );
    const resListConsultForeign = await listConsultationsHandler(reqListConsultForeign);
    expect(resListConsultForeign.status).toBe(404);
  });

  it('22. Enforces Optimistic Concurrency Control (OCC) and rejects stale expectedVersion with 409 Conflict', async () => {
    // Fetch latest consultation to verify current version
    const latestConsultation = await prisma.consultation.findUnique({
      where: { id: testConsultationId },
    });
    const currentVersion = latestConsultation?.version || 1;

    // Send update with stale expectedVersion
    const staleVersion = currentVersion - 1;
    const reqConsultationStale = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'PATCH',
      doctorAToken,
      {
        plan: 'Conflicting concurrent update attempt',
        amendmentReason: 'Attempting edit with stale expectedVersion',
        expectedVersion: staleVersion,
      }
    );
    const resConsultationStale = await updateConsultationHandler(reqConsultationStale, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(resConsultationStale.status).toBe(409);
    const conConflict = await resConsultationStale.json();
    expect(conConflict.error).toContain('Consultation version conflict');

    // Create a new active prescription for prescription OCC test
    const occRx = await prisma.prescription.create({
      data: {
        clinicId: clinicAId,
        patientId: patientAId,
        doctorId: doctorUserA.id,
        status: 'ACTIVE',
        version: 2,
        notes: 'Prescription with version 2',
      },
    });

    const reqRxStale = makeRequest(
      `http://localhost:3000/api/prescriptions/${occRx.id}`,
      'PATCH',
      doctorAToken,
      {
        status: 'DISCONTINUED',
        expectedVersion: 1, // Stale version! Current is 2
      }
    );
    const resRxStale = await updatePrescriptionHandler(reqRxStale, {
      params: Promise.resolve({ prescriptionId: occRx.id }),
    });
    expect(resRxStale.status).toBe(409);
    const rxConflict = await resRxStale.json();
    expect(rxConflict.error).toContain('Prescription version conflict');
  });

  it('23. Creating a consultation directly as FINALIZED snapshots version 1, completes appointment, and logs FINALIZE audit', async () => {
    // Create a dedicated appointment for direct finalization test
    const directApt = await prisma.appointment.create({
      data: {
        clinicId: clinicAId,
        patientId: patientAId,
        doctorId: doctorUserA.id,
        startTime: new Date('2026-10-22T14:00:00Z'),
        endTime: new Date('2026-10-22T14:30:00Z'),
        status: AppointmentStatus.CHECKED_IN,
        reason: 'Direct finalized checkup',
      },
    });

    const req = makeRequest('http://localhost:3000/api/consultations', 'POST', doctorAToken, {
      patientId: patientAId,
      appointmentId: directApt.id,
      status: 'FINALIZED',
      subjective: 'Patient attended routine blood pressure monitoring.',
      objective: 'BP 118/76, pulse 70 bpm, normal heart sounds.',
      assessment: 'Essential hypertension, well-controlled.',
      plan: 'Continue current lifestyle modifications and medications.',
      vitals: {
        systolicBp: 118,
        diastolicBp: 76,
        heartRate: 70,
      },
      diagnoses: [
        {
          name: 'Essential (primary) hypertension',
          code: 'I10',
          type: 'PRIMARY',
          clinicalStatus: 'ACTIVE',
        },
      ],
    });

    const res = await createConsultationHandler(req);
    expect(res.status).toBe(201);

    const data = await res.json();
    const c = data.consultation;
    expect(c.status).toBe(ConsultationStatus.FINALIZED);
    expect(c.finalizedAt).not.toBeNull();
    expect(c.version).toBe(1);

    // Verify appointment was marked COMPLETED
    const updatedApt = await prisma.appointment.findUnique({
      where: { id: directApt.id },
    });
    expect(updatedApt?.status).toBe(AppointmentStatus.COMPLETED);
    expect(updatedApt?.completedAt).not.toBeNull();

    // Verify ConsultationVersion record exists for version 1
    const v1 = await prisma.consultationVersion.findFirst({
      where: { consultationId: c.id, versionNumber: 1 },
    });
    expect(v1).not.toBeNull();
    expect(v1?.status).toBe(ConsultationStatus.FINALIZED);
    expect(v1?.subjective).toContain('routine blood pressure monitoring');

    // Verify audit log has action FINALIZE
    const audit = await prisma.clinicalAuditLog.findFirst({
      where: { consultationId: c.id, action: 'FINALIZE' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(doctorUserA.id);
  });

  it('24. Rejects illegal consultation lifecycle transition from FINALIZED or AMENDED back to DRAFT', async () => {
    const req = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'PATCH',
      doctorAToken,
      {
        status: 'DRAFT',
        amendmentReason: 'Attempting illegal rollback to draft',
      }
    );
    const res = await updateConsultationHandler(req, {
      params: Promise.resolve({ consultationId: testConsultationId }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid consultation status transition');
  });

  it('25. Enforces database foreign key RESTRICT: deleting patient or clinic is rejected when audit logs or versions exist', async () => {
    // Attempting to delete patientA who has audit logs and consultation versions
    await expect(
      prisma.patient.delete({ where: { id: patientAId } })
    ).rejects.toThrow();

    // Attempting to delete clinicA which has audit logs and consultation versions
    await expect(
      prisma.clinic.delete({ where: { id: clinicAId } })
    ).rejects.toThrow();
  });

  it('26. Competing concurrent amendments: first succeeds and concurrent second fails with 409 Conflict without leaving orphaned records', async () => {
    // Fetch latest consultation version
    const latest = await prisma.consultation.findUniqueOrThrow({
      where: { id: testConsultationId },
    });
    const baseVersion = latest.version;
    const initialVersionsCount = await prisma.consultationVersion.count({
      where: { consultationId: testConsultationId },
    });
    const initialAuditCount = await prisma.clinicalAuditLog.count({
      where: { consultationId: testConsultationId },
    });

    // Fire two concurrent PATCH requests with the same expectedVersion
    const req1 = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'PATCH',
      doctorAToken,
      {
        plan: 'Competing update A plan',
        amendmentReason: 'Concurrent attempt A',
        expectedVersion: baseVersion,
      }
    );
    const req2 = makeRequest(
      `http://localhost:3000/api/consultations/${testConsultationId}`,
      'PATCH',
      doctorAToken,
      {
        plan: 'Competing update B plan',
        amendmentReason: 'Concurrent attempt B',
        expectedVersion: baseVersion,
      }
    );

    const [res1, res2] = await Promise.all([
      updateConsultationHandler(req1, { params: Promise.resolve({ consultationId: testConsultationId }) }),
      updateConsultationHandler(req2, { params: Promise.resolve({ consultationId: testConsultationId }) }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);

    // Ensure the failed 409 request did not leave any orphaned snapshot or audit row behind
    const finalVersionsCount = await prisma.consultationVersion.count({
      where: { consultationId: testConsultationId },
    });
    const finalAuditCount = await prisma.clinicalAuditLog.count({
      where: { consultationId: testConsultationId },
    });

    expect(finalVersionsCount).toBe(initialVersionsCount + 1);
    expect(finalAuditCount).toBe(initialAuditCount + 1);
  });

  it('27. Competing concurrent prescription updates: first succeeds and concurrent second fails with 409 Conflict', async () => {
    // Create an active prescription for concurrent test
    const concurrentRx = await prisma.prescription.create({
      data: {
        clinicId: clinicAId,
        patientId: patientAId,
        doctorId: doctorUserA.id,
        status: 'ACTIVE',
        version: 1,
        notes: 'Initial notes for concurrent test',
      },
    });

    const req1 = makeRequest(
      `http://localhost:3000/api/prescriptions/${concurrentRx.id}`,
      'PATCH',
      doctorAToken,
      {
        status: 'COMPLETED',
        notes: 'Completed by Doctor 1',
        expectedVersion: 1,
      }
    );
    const req2 = makeRequest(
      `http://localhost:3000/api/prescriptions/${concurrentRx.id}`,
      'PATCH',
      doctorAToken,
      {
        status: 'DISCONTINUED',
        notes: 'Discontinued by Doctor 2',
        expectedVersion: 1,
      }
    );

    const [res1, res2] = await Promise.all([
      updatePrescriptionHandler(req1, { params: Promise.resolve({ prescriptionId: concurrentRx.id }) }),
      updatePrescriptionHandler(req2, { params: Promise.resolve({ prescriptionId: concurrentRx.id }) }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('28. Prescriptions snapshot during amendment accurately captures newly appended prescriptions with database IDs and items while keeping historical version snapshots immutable', async () => {
    // Create dedicated consultation in draft
    const draftConsultation = await prisma.consultation.create({
      data: {
        clinicId: clinicAId,
        patientId: patientAId,
        doctorId: doctorUserA.id,
        status: ConsultationStatus.DRAFT,
        subjective: 'Initial draft for prescription snapshot test',
        plan: 'Initial plan',
      },
    });

    try {
      // Finalize it directly with initial prescription
      const reqFinalize = makeRequest(
        `http://localhost:3000/api/consultations/${draftConsultation.id}`,
        'PATCH',
        doctorAToken,
        {
          status: 'FINALIZED',
          prescriptions: [
            {
              status: 'ACTIVE',
              notes: 'First prescription notes',
              items: [
                {
                  medicationName: 'Amoxicillin',
                  frequency: '1-0-1',
                  duration: '5 days',
                },
              ],
            },
          ],
        }
      );
      const resFinalize = await updateConsultationHandler(reqFinalize, {
        params: Promise.resolve({ consultationId: draftConsultation.id }),
      });
      expect(resFinalize.status).toBe(200);

      // Verify v1 snapshot
      const v1 = await prisma.consultationVersion.findFirstOrThrow({
        where: { consultationId: draftConsultation.id, versionNumber: 1 },
      });
      const rxSnapshotV1 = v1.prescriptionsSnapshot as Array<{
        id: string;
        status: string;
        notes: string | null;
        items: Array<{ id: string; medicationName: string }>;
      }>;
      expect(rxSnapshotV1.length).toBe(1);
      expect(rxSnapshotV1[0].id).toBeDefined();
      expect(rxSnapshotV1[0].items[0].id).toBeDefined();
      expect(rxSnapshotV1[0].items[0].medicationName).toBe('Amoxicillin');
      const v1SnapshotJsonString = JSON.stringify(v1.prescriptionsSnapshot);

      // Amend consultation and append a second prescription
      const reqAmend = makeRequest(
        `http://localhost:3000/api/consultations/${draftConsultation.id}`,
        'PATCH',
        doctorAToken,
        {
          plan: 'Updated plan with additional medication',
          amendmentReason: 'Added probiotic due to mild diarrhea on amoxicillin',
          prescriptions: [
            {
              status: 'ACTIVE',
              notes: 'Second prescription notes',
              items: [
                {
                  medicationName: 'Lactobacillus probiotic',
                  frequency: '1-0-0',
                  duration: '5 days',
                },
              ],
            },
          ],
        }
      );
      const resAmend = await updateConsultationHandler(reqAmend, {
        params: Promise.resolve({ consultationId: draftConsultation.id }),
      });
      expect(resAmend.status).toBe(200);

      // Verify v2 snapshot contains BOTH prescriptions with real database IDs and items
      const v2 = await prisma.consultationVersion.findFirstOrThrow({
        where: { consultationId: draftConsultation.id, versionNumber: 2 },
      });
      const rxSnapshotV2 = v2.prescriptionsSnapshot as Array<{
        id: string;
        status: string;
        notes: string | null;
        items: Array<{ id: string; medicationName: string }>;
      }>;
      expect(rxSnapshotV2.length).toBe(2);
      expect(rxSnapshotV2[0].id).toBe(rxSnapshotV1[0].id);
      expect(rxSnapshotV2[0].items[0].medicationName).toBe('Amoxicillin');
      expect(rxSnapshotV2[1].id).toBeDefined();
      expect(rxSnapshotV2[1].id).not.toBe(rxSnapshotV2[0].id);
      expect(rxSnapshotV2[1].items[0].id).toBeDefined();
      expect(rxSnapshotV2[1].items[0].medicationName).toBe('Lactobacillus probiotic');

      // Verify historical v1 snapshot remained completely immutable
      const v1AfterAmend = await prisma.consultationVersion.findFirstOrThrow({
        where: { consultationId: draftConsultation.id, versionNumber: 1 },
      });
      expect(JSON.stringify(v1AfterAmend.prescriptionsSnapshot)).toBe(v1SnapshotJsonString);
    } finally {
      // Clean up dedicated test consultation and all associated records
      await prisma.clinicalAuditLog.deleteMany({ where: { consultationId: draftConsultation.id } }).catch(() => {});
      await prisma.consultationVersion.deleteMany({ where: { consultationId: draftConsultation.id } }).catch(() => {});
      await prisma.prescriptionItem.deleteMany({ where: { prescription: { consultationId: draftConsultation.id } } }).catch(() => {});
      await prisma.prescription.deleteMany({ where: { consultationId: draftConsultation.id } }).catch(() => {});
      await prisma.observation.deleteMany({ where: { consultationId: draftConsultation.id } }).catch(() => {});
      await prisma.diagnosis.deleteMany({ where: { consultationId: draftConsultation.id } }).catch(() => {});
      await prisma.consultation.deleteMany({ where: { id: draftConsultation.id } }).catch(() => {});
    }
  });
});
