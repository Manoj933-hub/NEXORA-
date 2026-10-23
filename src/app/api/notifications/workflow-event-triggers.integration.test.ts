import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { POST as createAppointmentHandler } from '@/app/api/appointments/route';
import { PATCH as updateAppointmentHandler } from '@/app/api/appointments/[appointmentId]/route';
import { POST as createConsultationHandler } from '@/app/api/consultations/route';
import { PATCH as updateConsultationHandler } from '@/app/api/consultations/[consultationId]/route';
import { POST as createInvoiceHandler } from '@/app/api/billing/invoices/route';
import { PATCH as updateInvoiceHandler } from '@/app/api/billing/invoices/[invoiceId]/route';
import { POST as recordPaymentHandler } from '@/app/api/billing/invoices/[invoiceId]/payments/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { setNotificationProvider, resetNotificationProvider } from '@/lib/notifications/provider';
import type { NotificationProvider } from '@/lib/notifications/types';
import * as serviceModule from '@/lib/notifications/service';

describe('Phase 9.3: Workflow Event Triggers End-to-End Integration Tests (nexora_test)', () => {
  let clinicAId: string;
  let clinicBId: string;

  let doctorAUser: { id: string; email: string };
  let receptionistAUser: { id: string; email: string };
  let doctorBUser: { id: string; email: string };

  let doctorAToken: string;
  let receptionistAToken: string;
  let doctorBToken: string;

  let patientAWithConsentId: string;
  let patientANoConsentId: string;
  let patientBId: string;

  async function cleanFixtures() {
    await prisma.$executeRaw`DELETE FROM "auth_rate_limits" WHERE "key" LIKE 'rate:notify:%'`;

    const clinicSlugs = ['wf-clinic-a', 'wf-clinic-b'];
    const userEmails = [
      'doc.wf.a@nexora.test',
      'rec.wf.a@nexora.test',
      'doc.wf.b@nexora.test',
    ];

    await prisma.notificationLog.deleteMany({
      where: { clinic: { slug: { in: clinicSlugs } } },
    });

    await prisma.secureDocumentLink.deleteMany({
      where: { clinic: { slug: { in: clinicSlugs } } },
    });

    await prisma.payment.deleteMany({
      where: { clinic: { slug: { in: clinicSlugs } } },
    });

    await prisma.invoiceItem.deleteMany({
      where: { invoice: { clinic: { slug: { in: clinicSlugs } } } },
    });

    await prisma.invoice.deleteMany({
      where: { clinic: { slug: { in: clinicSlugs } } },
    });

    await prisma.prescriptionItem.deleteMany({
      where: { prescription: { clinic: { slug: { in: clinicSlugs } } } },
    });

    await prisma.prescription.deleteMany({
      where: { clinic: { slug: { in: clinicSlugs } } },
    });

    await prisma.diagnosis.deleteMany({
      where: { clinic: { slug: { in: clinicSlugs } } },
    });

    await prisma.observation.deleteMany({
      where: { clinic: { slug: { in: clinicSlugs } } },
    });

    await prisma.consultationVersion.deleteMany({
      where: { clinic: { slug: { in: clinicSlugs } } },
    });

    await prisma.clinicalAuditLog.deleteMany({
      where: { clinic: { slug: { in: clinicSlugs } } },
    });

    await prisma.consultation.deleteMany({
      where: { clinic: { slug: { in: clinicSlugs } } },
    });

    await prisma.appointment.deleteMany({
      where: { clinic: { slug: { in: clinicSlugs } } },
    });

    await prisma.patient.deleteMany({
      where: { clinic: { slug: { in: clinicSlugs } } },
    });

    await prisma.clinicNotificationSetting.deleteMany({
      where: { clinic: { slug: { in: clinicSlugs } } },
    });

    await prisma.session.deleteMany({
      where: { user: { email: { in: userEmails } } },
    });

    await prisma.membership.deleteMany({
      where: { user: { email: { in: userEmails } } },
    });

    await prisma.user.deleteMany({
      where: { email: { in: userEmails } },
    });

    await prisma.clinic.deleteMany({
      where: { slug: { in: clinicSlugs } },
    });
  }

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL || '';

    // STRICT SAFETY GUARD: Verify we are targeting only the isolated test database
    if (!dbUrl.includes('nexora_test')) {
      throw new Error(
        `SAFETY GUARD ENFORCED: Integration tests must target isolated database "nexora_test". Aborting execution. Target was: ${dbUrl}`
      );
    }

    // Clean up test fixtures safely in cascade order
    await cleanFixtures();

    // 1. Create Clinics
    const clinicA = await prisma.clinic.create({
      data: {
        name: 'Workflow Clinic A',
        slug: 'wf-clinic-a',
        country: 'IN',
        currency: 'INR',
        phone: '+919876500001',
      },
    });
    clinicAId = clinicA.id;

    const clinicB = await prisma.clinic.create({
      data: {
        name: 'Workflow Clinic B',
        slug: 'wf-clinic-b',
        country: 'NP',
        currency: 'NPR',
        phone: '+977984100001',
      },
    });
    clinicBId = clinicB.id;

    // 2. Create Users & Memberships
    doctorAUser = await prisma.user.create({
      data: {
        email: 'doc.wf.a@nexora.test',
        name: 'Dr. Anita Desai',
        passwordHash: '$2a$12$fakehashforwfa123456789012345678901234567890',
        memberships: {
          create: {
            clinicId: clinicAId,
            role: 'DOCTOR',
            isActive: true,
          },
        },
      },
    });

    receptionistAUser = await prisma.user.create({
      data: {
        email: 'rec.wf.a@nexora.test',
        name: 'Rohan Receptionist',
        passwordHash: '$2a$12$fakehashforwfa123456789012345678901234567890',
        memberships: {
          create: {
            clinicId: clinicAId,
            role: 'RECEPTIONIST',
            isActive: true,
          },
        },
      },
    });

    doctorBUser = await prisma.user.create({
      data: {
        email: 'doc.wf.b@nexora.test',
        name: 'Dr. Binod Shrestha',
        passwordHash: '$2a$12$fakehashforwfb123456789012345678901234567890',
        memberships: {
          create: {
            clinicId: clinicBId,
            role: 'DOCTOR',
            isActive: true,
          },
        },
      },
    });

    // 3. Create Sessions
    const doctorASession = await createSession(doctorAUser.id, clinicAId);
    doctorAToken = doctorASession.rawToken;

    const receptionistASession = await createSession(receptionistAUser.id, clinicAId);
    receptionistAToken = receptionistASession.rawToken;

    const doctorBSession = await createSession(doctorBUser.id, clinicBId);
    doctorBToken = doctorBSession.rawToken;

    // 4. Create Patients
    // Patient A1: Has active phone and both SMS and WhatsApp consent
    const patientA1 = await prisma.patient.create({
      data: {
        clinicId: clinicAId,
        mrn: 'MRN-WF-001',
        name: 'Rajesh Sharma',
        gender: 'MALE',
        dateOfBirth: new Date('1990-05-15'),
        phone: '9876543210', // Raw India 10-digit number
        smsConsent: true,
        whatsappConsent: true,
      },
    });
    patientAWithConsentId = patientA1.id;

    // Patient A2: Has phone but NO consent (smsConsent: false, whatsappConsent: false)
    const patientA2 = await prisma.patient.create({
      data: {
        clinicId: clinicAId,
        mrn: 'MRN-WF-002',
        name: 'Priya Patel',
        gender: 'FEMALE',
        dateOfBirth: new Date('1995-08-20'),
        phone: '9876543211',
        smsConsent: false,
        whatsappConsent: false,
      },
    });
    patientANoConsentId = patientA2.id;

    // Patient B in Clinic B
    const patientB = await prisma.patient.create({
      data: {
        clinicId: clinicBId,
        mrn: 'MRN-WF-B01',
        name: 'Santosh Thapa',
        gender: 'MALE',
        dateOfBirth: new Date('1988-12-10'),
        phone: '9841234567',
        smsConsent: true,
        whatsappConsent: true,
      },
    });
    patientBId = patientB.id;

    // 5. Initialize Clinic Notification Settings
    await prisma.clinicNotificationSetting.upsert({
      where: { clinicId: clinicAId },
      create: {
        clinicId: clinicAId,
        smsEnabled: true,
        whatsappEnabled: true,
        appointmentAlerts: true,
        prescriptionAlerts: true,
        billingAlerts: true,
        senderName: 'Workflow Clinic A',
      },
      update: {
        smsEnabled: true,
        whatsappEnabled: true,
        appointmentAlerts: true,
        prescriptionAlerts: true,
        billingAlerts: true,
      },
    });
  });

  afterAll(async () => {
    await cleanFixtures();
    resetNotificationProvider();
  });

  beforeEach(async () => {
    // Reset rate limiter keys for test isolation between it() blocks
    await prisma.$executeRaw`
      DELETE FROM "auth_rate_limits"
      WHERE "key" LIKE 'rate:notify:%';
    `;
    resetNotificationProvider();
  });

  function makeRequest(
    url: string,
    method: 'GET' | 'POST' | 'PATCH',
    token: string,
    body?: unknown
  ) {
    return new Request(url, {
      method,
      headers: {
        Host: 'localhost:3000',
        Origin: 'http://localhost:3000',
        'Content-Type': 'application/json',
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  describe('1. Appointment Lifecycle Notifications', () => {
    it('dispatches APPOINTMENT_BOOKED notification when booking succeeds for a consented patient', async () => {
      const startTime = new Date(Date.now() + 86400000 * 2).toISOString(); // +2 days
      const endTime = new Date(Date.now() + 86400000 * 2 + 1800000).toISOString();

      const req = makeRequest(
        'http://localhost:3000/api/appointments',
        'POST',
        receptionistAToken,
        {
          patientId: patientAWithConsentId,
          doctorId: doctorAUser.id,
          startTime,
          endTime,
          reason: 'Routine Health Checkup',
        }
      );

      const res = await createAppointmentHandler(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.appointment).toBeDefined();

      const appointmentId = json.appointment.id;

      // Verify NotificationLog was created in the database
      const log = await prisma.notificationLog.findFirst({
        where: {
          clinicId: clinicAId,
          patientId: patientAWithConsentId,
          appointmentId,
          eventType: 'APPOINTMENT_BOOKED',
        },
      });

      expect(log).not.toBeNull();
      expect(log?.status).toBe('SENT');
      expect(log?.channel).toBe('WHATSAPP'); // Preferred when whatsappConsent is true
      expect(log?.recipientPhone).toBe('+919876543210');
      expect(log?.messageBody).toContain('Workflow Clinic A');
      expect(log?.messageBody).toContain('Dr. Anita Desai');
      // Must NOT contain sensitive clinical notes
      expect(log?.messageBody).not.toContain('Routine Health Checkup');
    });

    it('creates appointment but does NOT dispatch notification when patient consent is disabled', async () => {
      const startTime = new Date(Date.now() + 86400000 * 3).toISOString();
      const endTime = new Date(Date.now() + 86400000 * 3 + 1800000).toISOString();

      const req = makeRequest(
        'http://localhost:3000/api/appointments',
        'POST',
        receptionistAToken,
        {
          patientId: patientANoConsentId, // Consent is false!
          doctorId: doctorAUser.id,
          startTime,
          endTime,
        }
      );

      const res = await createAppointmentHandler(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      const appointmentId = json.appointment.id;

      // Verify NO NotificationLog was created
      const log = await prisma.notificationLog.findFirst({
        where: {
          clinicId: clinicAId,
          patientId: patientANoConsentId,
          appointmentId,
        },
      });

      expect(log).toBeNull();
    });

    it('does NOT dispatch notification when appointment creation fails due to scheduling conflict', async () => {
      const startTime = new Date(Date.now() + 86400000 * 4).toISOString();
      const endTime = new Date(Date.now() + 86400000 * 4 + 1800000).toISOString();

      // First appointment succeeds
      const req1 = makeRequest(
        'http://localhost:3000/api/appointments',
        'POST',
        receptionistAToken,
        {
          patientId: patientAWithConsentId,
          doctorId: doctorAUser.id,
          startTime,
          endTime,
        }
      );
      const res1 = await createAppointmentHandler(req1);
      expect(res1.status).toBe(201);

      // Second conflicting appointment for same doctor and time window must fail
      const req2 = makeRequest(
        'http://localhost:3000/api/appointments',
        'POST',
        receptionistAToken,
        {
          patientId: patientAWithConsentId,
          doctorId: doctorAUser.id,
          startTime,
          endTime,
        }
      );
      const res2 = await createAppointmentHandler(req2);
      expect(res2.status).toBe(409); // Conflict!

      // Count notification logs for this patient: exactly 1 from the first successful booking
      const logs = await prisma.notificationLog.findMany({
        where: {
          clinicId: clinicAId,
          patientId: patientAWithConsentId,
          eventType: 'APPOINTMENT_BOOKED',
        },
      });
      // Exactly 2 total in this describe block (from it 1 + it 3 first call)
      expect(logs.length).toBe(2);
    });

    it('dispatches APPOINTMENT_RESCHEDULED when rescheduling an existing appointment', async () => {
      // Create baseline appointment
      const startTime = new Date(Date.now() + 86400000 * 5).toISOString();
      const endTime = new Date(Date.now() + 86400000 * 5 + 1800000).toISOString();

      const createReq = makeRequest(
        'http://localhost:3000/api/appointments',
        'POST',
        receptionistAToken,
        {
          patientId: patientAWithConsentId,
          doctorId: doctorAUser.id,
          startTime,
          endTime,
        }
      );
      const createRes = await createAppointmentHandler(createReq);
      const { appointment } = await createRes.json();

      // Reschedule
      const newStart = new Date(Date.now() + 86400000 * 6).toISOString();
      const newEnd = new Date(Date.now() + 86400000 * 6 + 1800000).toISOString();

      const rescheduleReq = makeRequest(
        `http://localhost:3000/api/appointments/${appointment.id}`,
        'PATCH',
        receptionistAToken,
        {
          startTime: newStart,
          endTime: newEnd,
          reason: 'Patient requested afternoon slot',
        }
      );

      const res = await updateAppointmentHandler(rescheduleReq, {
        params: Promise.resolve({ appointmentId: appointment.id }),
      });
      expect(res.status).toBe(200);

      // Verify NotificationLog created with APPOINTMENT_RESCHEDULED
      const log = await prisma.notificationLog.findFirst({
        where: {
          clinicId: clinicAId,
          patientId: patientAWithConsentId,
          appointmentId: appointment.id,
          eventType: 'APPOINTMENT_RESCHEDULED',
        },
      });

      expect(log).not.toBeNull();
      expect(log?.status).toBe('SENT');
      expect(log?.eventType).toBe('APPOINTMENT_RESCHEDULED');
      expect(log?.messageBody).toContain('rescheduled');
    });

    it('dispatches APPOINTMENT_CANCELLED when appointment status transitions to CANCELLED', async () => {
      const startTime = new Date(Date.now() + 86400000 * 7).toISOString();
      const endTime = new Date(Date.now() + 86400000 * 7 + 1800000).toISOString();

      const createReq = makeRequest(
        'http://localhost:3000/api/appointments',
        'POST',
        receptionistAToken,
        {
          patientId: patientAWithConsentId,
          doctorId: doctorAUser.id,
          startTime,
          endTime,
        }
      );
      const createRes = await createAppointmentHandler(createReq);
      const { appointment } = await createRes.json();

      // Cancel
      const cancelReq = makeRequest(
        `http://localhost:3000/api/appointments/${appointment.id}`,
        'PATCH',
        receptionistAToken,
        {
          status: 'CANCELLED',
          cancelledReason: 'Patient feeling unwell and staying home',
        }
      );

      const res = await updateAppointmentHandler(cancelReq, {
        params: Promise.resolve({ appointmentId: appointment.id }),
      });
      expect(res.status).toBe(200);

      // Verify NotificationLog created with APPOINTMENT_CANCELLED
      const log = await prisma.notificationLog.findFirst({
        where: {
          clinicId: clinicAId,
          patientId: patientAWithConsentId,
          appointmentId: appointment.id,
          eventType: 'APPOINTMENT_CANCELLED',
        },
      });

      expect(log).not.toBeNull();
      expect(log?.status).toBe('SENT');
      expect(log?.eventType).toBe('APPOINTMENT_CANCELLED');
      expect(log?.messageBody).toContain('cancelled');
    });

    it('suppresses duplicate cancellation notifications if cancelled status is submitted again', async () => {
      const startTime = new Date(Date.now() + 86400000 * 8).toISOString();
      const endTime = new Date(Date.now() + 86400000 * 8 + 1800000).toISOString();

      const createReq = makeRequest(
        'http://localhost:3000/api/appointments',
        'POST',
        receptionistAToken,
        {
          patientId: patientAWithConsentId,
          doctorId: doctorAUser.id,
          startTime,
          endTime,
        }
      );
      const createRes = await createAppointmentHandler(createReq);
      const { appointment } = await createRes.json();

      // First cancel
      const cancelReq1 = makeRequest(
        `http://localhost:3000/api/appointments/${appointment.id}`,
        'PATCH',
        receptionistAToken,
        {
          status: 'CANCELLED',
          cancelledReason: 'First cancellation call',
        }
      );
      await updateAppointmentHandler(cancelReq1, {
        params: Promise.resolve({ appointmentId: appointment.id }),
      });

      // Second cancel attempt
      const cancelReq2 = makeRequest(
        `http://localhost:3000/api/appointments/${appointment.id}`,
        'PATCH',
        receptionistAToken,
        {
          status: 'CANCELLED',
          cancelledReason: 'Duplicate cancellation call',
        }
      );
      await updateAppointmentHandler(cancelReq2, {
        params: Promise.resolve({ appointmentId: appointment.id }),
      });

      // Verify only ONE cancellation log exists
      const cancelLogs = await prisma.notificationLog.findMany({
        where: {
          clinicId: clinicAId,
          patientId: patientAWithConsentId,
          appointmentId: appointment.id,
          eventType: 'APPOINTMENT_CANCELLED',
        },
      });

      expect(cancelLogs.length).toBe(1);
    });

    it('does NOT dispatch notification when cross-clinic appointment scheduling is attempted', async () => {
      const startTime = new Date(Date.now() + 86400000 * 9).toISOString();
      const endTime = new Date(Date.now() + 86400000 * 9 + 1800000).toISOString();

      // Receptionist A attempts to schedule appointment for Patient B (who belongs to Clinic B)
      const req = makeRequest(
        'http://localhost:3000/api/appointments',
        'POST',
        receptionistAToken,
        {
          patientId: patientBId, // Cross-clinic patient!
          doctorId: doctorAUser.id,
          startTime,
          endTime,
        }
      );

      const res = await createAppointmentHandler(req);
      expect(res.status).toBe(404);

      // Verify no notification log created
      const log = await prisma.notificationLog.findFirst({
        where: {
          patientId: patientBId,
        },
      });
      expect(log).toBeNull();
    });
  });

  describe('2. Prescription Finalization Notifications', () => {
    it('dispatches PRESCRIPTION_READY with secure document link when consultation is created directly as FINALIZED', async () => {
      const req = makeRequest(
        'http://localhost:3000/api/consultations',
        'POST',
        doctorAToken,
        {
          patientId: patientAWithConsentId,
          status: 'FINALIZED',
          subjective: 'Patient complains of recurrent migraine attacks',
          objective: 'BP 120/80 mmHg, alert and oriented',
          assessment: 'Episodic migraine without aura',
          plan: 'Prescribed prophylactic and acute therapy',
          prescriptions: [
            {
              status: 'ACTIVE',
              notes: 'Take with food',
              items: [
                {
                  medicationName: 'Sumatriptan',
                  strength: '50mg',
                  route: 'ORAL',
                  frequency: 'PRN',
                  duration: 'As needed',
                },
              ],
            },
          ],
        }
      );

      const res = await createConsultationHandler(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.consultation).toBeDefined();

      const createdRx = json.consultation.prescriptions[0];
      expect(createdRx).toBeDefined();

      // Verify NotificationLog was created
      const log = await prisma.notificationLog.findFirst({
        where: {
          clinicId: clinicAId,
          patientId: patientAWithConsentId,
          prescriptionId: createdRx.id,
          eventType: 'PRESCRIPTION_READY',
        },
      });

      expect(log).not.toBeNull();
      expect(log?.status).toBe('SENT');
      expect(log?.channel).toBe('WHATSAPP');

      // Verify secure document link was created in secure_document_links table
      const linkRecord = await prisma.secureDocumentLink.findFirst({
        where: {
          clinicId: clinicAId,
          patientId: patientAWithConsentId,
          resourceId: createdRx.id,
          resourceType: 'PRESCRIPTION',
        },
      });
      expect(linkRecord).not.toBeNull();
      expect(linkRecord?.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // STRICT PRIVACY VERIFICATIONS:
      // 1. Raw token must NOT leak into the log message body
      expect(log?.messageBody).toContain('[PROTECTED_DOCUMENT_TOKEN]');
      expect(log?.messageBody).not.toMatch(/[a-f0-9]{64}/);

      // 2. PHI Minimization: messageBody must NEVER contain diagnoses, medication names, or notes
      expect(log?.messageBody).not.toContain('Sumatriptan');
      expect(log?.messageBody).not.toContain('migraine');
      expect(log?.messageBody).not.toContain('Take with food');
    });

    it('does NOT dispatch prescription notification when creating a DRAFT consultation', async () => {
      const req = makeRequest(
        'http://localhost:3000/api/consultations',
        'POST',
        doctorAToken,
        {
          patientId: patientAWithConsentId,
          status: 'DRAFT', // DRAFT!
          subjective: 'Mild seasonal cough',
          prescriptions: [
            {
              status: 'ACTIVE',
              items: [
                {
                  medicationName: 'Cetirizine',
                  strength: '10mg',
                  route: 'ORAL',
                  frequency: 'OD',
                  duration: '5 days',
                },
              ],
            },
          ],
        }
      );

      const res = await createConsultationHandler(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      const draftRx = json.consultation.prescriptions[0];

      // Verify NO notification log was created for draft consultation
      const log = await prisma.notificationLog.findFirst({
        where: {
          clinicId: clinicAId,
          patientId: patientAWithConsentId,
          prescriptionId: draftRx.id,
        },
      });

      expect(log).toBeNull();
    });

    it('dispatches PRESCRIPTION_READY when updating a DRAFT consultation to FINALIZED', async () => {
      // 1. Create a draft consultation
      const draftReq = makeRequest(
        'http://localhost:3000/api/consultations',
        'POST',
        doctorAToken,
        {
          patientId: patientAWithConsentId,
          status: 'DRAFT',
          subjective: 'Initial presentation',
          prescriptions: [
            {
              status: 'ACTIVE',
              items: [
                {
                  medicationName: 'Amoxicillin',
                  strength: '500mg',
                  route: 'ORAL',
                  frequency: 'TDS',
                  duration: '7 days',
                },
              ],
            },
          ],
        }
      );
      const draftRes = await createConsultationHandler(draftReq);
      const draftJson = await draftRes.json();
      const consultationId = draftJson.consultation.id;
      const rxId = draftJson.consultation.prescriptions[0].id;

      // 2. Finalize the consultation via PATCH
      const finalizeReq = makeRequest(
        `http://localhost:3000/api/consultations/${consultationId}`,
        'PATCH',
        doctorAToken,
        {
          status: 'FINALIZED',
          expectedVersion: 1,
          assessment: 'Bacterial pharyngitis',
          plan: 'Complete full course of antibiotics',
        }
      );

      const finalizeRes = await updateConsultationHandler(finalizeReq, {
        params: Promise.resolve({ consultationId }),
      });
      expect(finalizeRes.status).toBe(200);

      // Verify NotificationLog was created upon finalization
      const log = await prisma.notificationLog.findFirst({
        where: {
          clinicId: clinicAId,
          patientId: patientAWithConsentId,
          prescriptionId: rxId,
          eventType: 'PRESCRIPTION_READY',
        },
      });

      expect(log).not.toBeNull();
      expect(log?.status).toBe('SENT');
      expect(log?.messageBody).toContain('[PROTECTED_DOCUMENT_TOKEN]');
      expect(log?.messageBody).not.toContain('Amoxicillin');
    });
  });

  describe('3. Payment Receipt Notifications', () => {
    let testInvoiceId: string;

    beforeEach(async () => {
      // Create an invoice in DRAFT, then ISSUED for Patient A1
      const invReq = makeRequest(
        'http://localhost:3000/api/billing/invoices',
        'POST',
        receptionistAToken,
        {
          patientId: patientAWithConsentId,
          issueDate: new Date().toISOString(),
          items: [
            {
              description: 'General Consultation',
              quantity: 1,
              unitPrice: '500.00',
              itemType: 'CONSULTATION',
            },
          ],
        }
      );
      const invRes = await createInvoiceHandler(invReq);
      const invJson = await invRes.json();
      testInvoiceId = invJson.invoice.id;

      // Issue invoice
      const patchReq = makeRequest(
        `http://localhost:3000/api/billing/invoices/${testInvoiceId}`,
        'PATCH',
        receptionistAToken,
        {
          status: 'ISSUED',
        }
      );
      await updateInvoiceHandler(patchReq, {
        params: Promise.resolve({ invoiceId: testInvoiceId }),
      });
    });

    it('dispatches PAYMENT_RECEIPT notification upon recording a successful payment', async () => {
      const payReq = makeRequest(
        `http://localhost:3000/api/billing/invoices/${testInvoiceId}/payments`,
        'POST',
        receptionistAToken,
        {
          amount: '500.00',
          method: 'UPI',
          transactionRef: 'UPI-WF-TX-1001',
          notes: 'Full payment via QR code',
        }
      );

      const res = await recordPaymentHandler(payReq, {
        params: Promise.resolve({ invoiceId: testInvoiceId }),
      });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.payment).toBeDefined();

      const paymentId = json.payment.id;

      // Verify NotificationLog was created
      const log = await prisma.notificationLog.findFirst({
        where: {
          clinicId: clinicAId,
          patientId: patientAWithConsentId,
          paymentId,
          eventType: 'PAYMENT_RECEIPT',
        },
      });

      expect(log).not.toBeNull();
      expect(log?.status).toBe('SENT');
      expect(log?.eventType).toBe('PAYMENT_RECEIPT');
      expect(log?.messageBody).toContain('500');
      expect(log?.messageBody).toContain('INR');
      expect(log?.messageBody).toContain('[PROTECTED_DOCUMENT_TOKEN]');

      // Verify receipt secure link created
      const linkRecord = await prisma.secureDocumentLink.findFirst({
        where: {
          clinicId: clinicAId,
          patientId: patientAWithConsentId,
          resourceId: paymentId,
          resourceType: 'RECEIPT',
        },
      });
      expect(linkRecord).not.toBeNull();
    });

    it('does NOT dispatch receipt notification when payment attempt fails due to overpayment', async () => {
      const payReq = makeRequest(
        `http://localhost:3000/api/billing/invoices/${testInvoiceId}/payments`,
        'POST',
        receptionistAToken,
        {
          amount: '9999.00', // Exceeds balance 500.00
          method: 'CASH',
        }
      );

      const res = await recordPaymentHandler(payReq, {
        params: Promise.resolve({ invoiceId: testInvoiceId }),
      });
      expect(res.status).toBe(400);

      // Verify no PAYMENT_RECEIPT log was created
      const log = await prisma.notificationLog.findFirst({
        where: {
          clinicId: clinicAId,
          invoiceId: testInvoiceId,
          eventType: 'PAYMENT_RECEIPT',
        },
      });
      expect(log).toBeNull();
    });

    it('does NOT dispatch notification when payment from another clinic attempts to pay invoice', async () => {
      // Doctor B belongs to Clinic B
      const payReq = makeRequest(
        `http://localhost:3000/api/billing/invoices/${testInvoiceId}/payments`,
        'POST',
        doctorBToken,
        {
          amount: '500.00',
          method: 'CASH',
        }
      );

      const res = await recordPaymentHandler(payReq, {
        params: Promise.resolve({ invoiceId: testInvoiceId }),
      });
      expect(res.status).toBe(404); // Cross-clinic invoice access rejected

      // Verify no notification log created
      const log = await prisma.notificationLog.findFirst({
        where: {
          invoiceId: testInvoiceId,
        },
      });
      expect(log).toBeNull();
    });
  });

  describe('4. Provider Exception & AUDIT_LOG_FAILED Resilience', () => {
    it('preserves successful payment recording when provider throws an unexpected exception', async () => {
      // Create and issue invoice
      const invReq = makeRequest(
        'http://localhost:3000/api/billing/invoices',
        'POST',
        receptionistAToken,
        {
          patientId: patientAWithConsentId,
          issueDate: new Date().toISOString(),
          items: [
            {
              description: 'Resilience Test Item',
              quantity: 1,
              unitPrice: '250.00',
              itemType: 'CONSULTATION',
            },
          ],
        }
      );
      const invRes = await createInvoiceHandler(invReq);
      const { invoice } = await invRes.json();

      await updateInvoiceHandler(
        makeRequest(
          `http://localhost:3000/api/billing/invoices/${invoice.id}`,
          'PATCH',
          receptionistAToken,
          { status: 'ISSUED' }
        ),
        { params: Promise.resolve({ invoiceId: invoice.id }) }
      );

      // Mock provider to throw a crash exception
      const faultyProvider: NotificationProvider = {
        name: 'FAULTY_MOCK',
        send: async () => {
          throw new Error('Carrier socket crash: ECONNRESET');
        },
      };
      setNotificationProvider(faultyProvider);

      // Record payment
      const payReq = makeRequest(
        `http://localhost:3000/api/billing/invoices/${invoice.id}/payments`,
        'POST',
        receptionistAToken,
        {
          amount: '250.00',
          method: 'CASH',
        }
      );

      const res = await recordPaymentHandler(payReq, {
        params: Promise.resolve({ invoiceId: invoice.id }),
      });

      // CORE FINANCIAL OPERATION MUST REMAIN 100% SUCCESSFUL!
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.payment).toBeDefined();
      expect(json.invoice.status).toBe('PAID');

      // Verify database payment was NOT rolled back
      const persistedPayment = await prisma.payment.findUnique({
        where: { id: json.payment.id },
      });
      expect(persistedPayment).not.toBeNull();

      // Verify notification log reflects FAILED without crashing the workflow
      const log = await prisma.notificationLog.findFirst({
        where: {
          clinicId: clinicAId,
          paymentId: json.payment.id,
        },
      });
      expect(log).not.toBeNull();
      expect(log?.status).toBe('FAILED');
      expect(log?.errorMessage).toContain('Carrier socket crash');
    });

    it('preserves successful appointment booking even when notification audit log fails (AUDIT_LOG_FAILED)', async () => {
      // Mock dispatchPatientNotification to throw AUDIT_LOG_FAILED
      vi.spyOn(serviceModule, 'dispatchPatientNotification').mockRejectedValueOnce(
        new serviceModule.NotificationServiceError(
          'Notification was processed but audit log persistence failed',
          500,
          'AUDIT_LOG_FAILED'
        )
      );

      const startTime = new Date(Date.now() + 86400000 * 12).toISOString();
      const endTime = new Date(Date.now() + 86400000 * 12 + 1800000).toISOString();

      const req = makeRequest(
        'http://localhost:3000/api/appointments',
        'POST',
        receptionistAToken,
        {
          patientId: patientAWithConsentId,
          doctorId: doctorAUser.id,
          startTime,
          endTime,
        }
      );

      const res = await createAppointmentHandler(req);

      // CORE APPOINTMENT MUST REMAIN 100% SUCCESSFUL!
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.appointment).toBeDefined();

      // Verify appointment is saved in PostgreSQL database
      const persistedApt = await prisma.appointment.findUnique({
        where: { id: json.appointment.id },
      });
      expect(persistedApt).not.toBeNull();
      expect(persistedApt?.status).toBe('SCHEDULED');
    });
  });
});
