import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { GET as listInvoicesHandler, POST as createInvoiceHandler } from './route';
import { GET as getInvoiceHandler, PATCH as updateInvoiceHandler } from './[invoiceId]/route';
import { POST as recordPaymentHandler } from './[invoiceId]/payments/route';
import { createSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { ClinicRole } from '@/lib/auth/permissions';

describe('Phase 8.2: Billing API Endpoints & Tenant Isolation Integration Tests', () => {
  let clinicAId: string;
  let clinicBId: string;

  let ownerUserA: { id: string; email: string };
  let doctorUserA: { id: string; email: string };
  let receptionistUserA: { id: string; email: string };
  let staffUserA: { id: string; email: string };
  let doctorUserB: { id: string; email: string };

  let ownerAToken: string;
  let doctorAToken: string;
  let receptionistAToken: string;
  let staffAToken: string;
  let doctorBToken: string;

  let patientAId: string;
  let patientBId: string;
  let appointmentAId: string;
  let appointmentBId: string;
  let consultationAId: string;

  let createdInvoiceAId: string;

  beforeAll(async () => {
    // Clean up any test users
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'owner.billing.a@nexora.test',
            'doc.billing.a@nexora.test',
            'rec.billing.a@nexora.test',
            'staff.billing.a@nexora.test',
            'doc.billing.b@nexora.test',
          ],
        },
      },
    });

    // Create users
    ownerUserA = await prisma.user.create({
      data: {
        email: 'owner.billing.a@nexora.test',
        name: 'Dr. Owner A',
        passwordHash: '$2a$12$fakehashforbillingtesting123456789012345678901234567890',
      },
    });

    doctorUserA = await prisma.user.create({
      data: {
        email: 'doc.billing.a@nexora.test',
        name: 'Dr. Anita Billing',
        passwordHash: '$2a$12$fakehashforbillingtesting123456789012345678901234567890',
      },
    });

    receptionistUserA = await prisma.user.create({
      data: {
        email: 'rec.billing.a@nexora.test',
        name: 'Rohan Receptionist',
        passwordHash: '$2a$12$fakehashforbillingtesting123456789012345678901234567890',
      },
    });

    staffUserA = await prisma.user.create({
      data: {
        email: 'staff.billing.a@nexora.test',
        name: 'Sunil Staff NonClinical',
        passwordHash: '$2a$12$fakehashforbillingtesting123456789012345678901234567890',
      },
    });

    doctorUserB = await prisma.user.create({
      data: {
        email: 'doc.billing.b@nexora.test',
        name: 'Dr. Bimal OtherClinic',
        passwordHash: '$2a$12$fakehashforbillingtesting123456789012345678901234567890',
      },
    });

    // Create Clinic A (India / INR with GST)
    const clinicA = await prisma.clinic.create({
      data: {
        name: 'Apex Health Care Delhi',
        slug: `apex-delhi-${Date.now()}`,
        country: 'IN',
        currency: 'INR',
        taxLabel: 'GSTIN',
        taxNumber: '07AAAAA0000A1Z5',
      },
    });
    clinicAId = clinicA.id;

    // Create Clinic B (Nepal / NPR with PAN)
    const clinicB = await prisma.clinic.create({
      data: {
        name: 'Patan Polyclinic Lalitpur',
        slug: `patan-lalitpur-${Date.now()}`,
        country: 'NP',
        currency: 'NPR',
        taxLabel: 'PAN',
        taxNumber: '302918273',
      },
    });
    clinicBId = clinicB.id;

    // Memberships for Clinic A
    await prisma.membership.createMany({
      data: [
        { userId: ownerUserA.id, clinicId: clinicAId, role: ClinicRole.OWNER, isActive: true },
        { userId: doctorUserA.id, clinicId: clinicAId, role: ClinicRole.DOCTOR, isActive: true },
        { userId: receptionistUserA.id, clinicId: clinicAId, role: ClinicRole.RECEPTIONIST, isActive: true },
        { userId: staffUserA.id, clinicId: clinicAId, role: ClinicRole.STAFF, isActive: true },
      ],
    });

    // Membership for Clinic B
    await prisma.membership.create({
      data: {
        userId: doctorUserB.id,
        clinicId: clinicBId,
        role: ClinicRole.OWNER,
        isActive: true,
      },
    });

    // Create Sessions
    const sessOwner = await createSession(ownerUserA.id, clinicAId);
    ownerAToken = sessOwner.rawToken;

    const sessDoc = await createSession(doctorUserA.id, clinicAId);
    doctorAToken = sessDoc.rawToken;

    const sessRec = await createSession(receptionistUserA.id, clinicAId);
    receptionistAToken = sessRec.rawToken;

    const sessStaff = await createSession(staffUserA.id, clinicAId);
    staffAToken = sessStaff.rawToken;

    const sessB = await createSession(doctorUserB.id, clinicBId);
    doctorBToken = sessB.rawToken;

    // Create Patient A in Clinic A
    const patientA = await prisma.patient.create({
      data: {
        clinicId: clinicAId,
        mrn: 'APEX-0001',
        name: 'Ramesh Sharma',
        gender: 'MALE',
        phone: '+91 9876543210',
      },
    });
    patientAId = patientA.id;

    // Create Patient B in Clinic B
    const patientB = await prisma.patient.create({
      data: {
        clinicId: clinicBId,
        mrn: 'PATAN-0001',
        name: 'Sita Thapa',
        gender: 'FEMALE',
        phone: '+977 9841234567',
      },
    });
    patientBId = patientB.id;

    // Create Appointment in Clinic A
    const apptA = await prisma.appointment.create({
      data: {
        clinicId: clinicAId,
        patientId: patientAId,
        doctorId: doctorUserA.id,
        startTime: new Date('2026-10-22T10:00:00Z'),
        endTime: new Date('2026-10-22T10:30:00Z'),
        status: 'COMPLETED',
      },
    });
    appointmentAId = apptA.id;

    // Create Appointment in Clinic B
    const apptB = await prisma.appointment.create({
      data: {
        clinicId: clinicBId,
        patientId: patientBId,
        doctorId: doctorUserB.id,
        startTime: new Date('2026-10-22T11:00:00Z'),
        endTime: new Date('2026-10-22T11:30:00Z'),
        status: 'COMPLETED',
      },
    });
    appointmentBId = apptB.id;

    // Create Consultation in Clinic A
    const consA = await prisma.consultation.create({
      data: {
        clinicId: clinicAId,
        patientId: patientAId,
        doctorId: doctorUserA.id,
        appointmentId: appointmentAId,
        status: 'FINALIZED',
        subjective: 'Mild hypertension check',
      },
    });
    consultationAId = consA.id;
  });

  afterAll(async () => {
    // Cleanup in order
    await prisma.payment.deleteMany({
      where: { clinicId: { in: [clinicAId, clinicBId] } },
    });
    await prisma.invoiceItem.deleteMany({
      where: { invoice: { clinicId: { in: [clinicAId, clinicBId] } } },
    });
    await prisma.invoice.deleteMany({
      where: { clinicId: { in: [clinicAId, clinicBId] } },
    });
    await prisma.invoiceSequence.deleteMany({
      where: { clinicId: { in: [clinicAId, clinicBId] } },
    });
    await prisma.consultation.deleteMany({
      where: { clinicId: { in: [clinicAId, clinicBId] } },
    });
    await prisma.appointment.deleteMany({
      where: { clinicId: { in: [clinicAId, clinicBId] } },
    });
    await prisma.patient.deleteMany({
      where: { clinicId: { in: [clinicAId, clinicBId] } },
    });
    await prisma.membership.deleteMany({
      where: { clinicId: { in: [clinicAId, clinicBId] } },
    });
    await prisma.clinic.deleteMany({
      where: { id: { in: [clinicAId, clinicBId] } },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'owner.billing.a@nexora.test',
            'doc.billing.a@nexora.test',
            'rec.billing.a@nexora.test',
            'staff.billing.a@nexora.test',
            'doc.billing.b@nexora.test',
          ],
        },
      },
    });
  });

  describe('1. Authentication & RBAC Authorization Checks', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const req = new Request('http://localhost:3000/api/billing/invoices', {
        method: 'GET',
        headers: { Host: 'localhost:3000' },
      });

      const res = await listInvoicesHandler(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/Authentication required/i);
    });

    it('rejects non-clinical/non-reception STAFF role with 403 Forbidden', async () => {
      const req = new Request('http://localhost:3000/api/billing/invoices', {
        method: 'GET',
        headers: {
          Host: 'localhost:3000',
          cookie: `${SESSION_COOKIE_NAME}=${staffAToken}`,
        },
      });

      const res = await listInvoicesHandler(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Insufficient permissions/i);
    });

    it('allows RECEPTIONIST, DOCTOR, and OWNER to access invoices', async () => {
      for (const token of [receptionistAToken, doctorAToken, ownerAToken]) {
        const req = new Request('http://localhost:3000/api/billing/invoices', {
          method: 'GET',
          headers: {
            Host: 'localhost:3000',
            cookie: `${SESSION_COOKIE_NAME}=${token}`,
          },
        });

        const res = await listInvoicesHandler(req);
        expect(res.status).toBe(200);
      }
    });

    it('rejects POST requests with invalid Origin/CSRF with 403', async () => {
      const req = new Request('http://localhost:3000/api/billing/invoices', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://evil-attacker.com',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({}),
      });

      const res = await createInvoiceHandler(req);
      expect(res.status).toBe(403);
    });
  });

  describe('2. POST /api/billing/invoices (Invoice Creation & Validation)', () => {
    it('creates an invoice with calculated totals, atomic numbering, and tax snapshot', async () => {
      const payload = {
        patientId: patientAId,
        appointmentId: appointmentAId,
        consultationId: consultationAId,
        discount: '50.00',
        taxRate: '18.00',
        notes: 'Follow up after consultation',
        items: [
          {
            description: 'General Doctor Consultation',
            quantity: 1,
            unitPrice: '500.00',
            itemType: 'CONSULTATION',
          },
          {
            description: 'Amlodipine 5mg (Strip of 10)',
            quantity: 2,
            unitPrice: '100.00',
            itemType: 'MEDICATION',
          },
        ],
      };

      const req = new Request('http://localhost:3000/api/billing/invoices', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify(payload),
      });

      const res = await createInvoiceHandler(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      const invoice = data.invoice;

      expect(invoice).toBeDefined();
      expect(invoice.invoiceNumber).toBe('INV-2026-0001');
      expect(invoice.clinicId).toBe(clinicAId);
      expect(invoice.currency).toBe('INR');
      expect(invoice.status).toBe('DRAFT');
      expect(invoice.taxLabel).toBe('GSTIN');
      expect(invoice.taxNumber).toBe('07AAAAA0000A1Z5');

      // Calculations check:
      // Subtotal: 500 + 200 = 700.00
      // Discount: 50.00
      // Taxable: 650.00
      // Tax (18%): 117.00
      // Total: 767.00
      // Paid: 0.00
      expect(parseFloat(invoice.subtotal)).toBe(700.0);
      expect(parseFloat(invoice.discount)).toBe(50.0);
      expect(parseFloat(invoice.taxAmount)).toBe(117.0);
      expect(parseFloat(invoice.totalAmount)).toBe(767.0);
      expect(parseFloat(invoice.paidAmount)).toBe(0.0);
      expect(invoice.issueDate).toBeNull();
      expect(invoice.items).toHaveLength(2);

      createdInvoiceAId = invoice.id;
    });

    it('allocates the next sequential invoice number atomically (INV-2026-0002)', async () => {
      const payload = {
        patientId: patientAId,
        items: [
          {
            description: 'Diagnostic Blood Test',
            quantity: 1,
            unitPrice: '350.00',
            itemType: 'LAB',
          },
        ],
      };

      const req = new Request('http://localhost:3000/api/billing/invoices', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${doctorAToken}`,
        },
        body: JSON.stringify(payload),
      });

      const res = await createInvoiceHandler(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.invoice.invoiceNumber).toBe('INV-2026-0002');
    });

    it('STRICTLY rejects client-injected trusted fields (clinicId, invoiceNumber, totals, paidAmount)', async () => {
      const maliciousPayload = {
        patientId: patientAId,
        clinicId: clinicBId,
        invoiceNumber: 'INV-2026-9999',
        totalAmount: '1.00',
        paidAmount: '1000.00',
        status: 'PAID',
        items: [
          {
            description: 'Test',
            quantity: 1,
            unitPrice: '100.00',
          },
        ],
      };

      const req = new Request('http://localhost:3000/api/billing/invoices', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify(maliciousPayload),
      });

      const res = await createInvoiceHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Validation failed');
    });

    it('rejects cross-clinic references: patient belonging to another clinic returns 404', async () => {
      const req = new Request('http://localhost:3000/api/billing/invoices', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({
          patientId: patientBId, // Belongs to Clinic B!
          items: [{ description: 'Test', quantity: 1, unitPrice: '100.00' }],
        }),
      });

      const res = await createInvoiceHandler(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toMatch(/Patient not found in active clinic/i);
    });

    it('rejects cross-clinic references: appointment belonging to another clinic returns 404', async () => {
      const req = new Request('http://localhost:3000/api/billing/invoices', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({
          patientId: patientAId,
          appointmentId: appointmentBId, // Belongs to Clinic B!
          items: [{ description: 'Test', quantity: 1, unitPrice: '100.00' }],
        }),
      });

      const res = await createInvoiceHandler(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toMatch(/Appointment not found in active clinic/i);
    });

    it('rejects mismatched patient-appointment association with 400', async () => {
      // Create another patient in Clinic A
      const otherPatient = await prisma.patient.create({
        data: {
          clinicId: clinicAId,
          mrn: 'APEX-0002',
          name: 'Different Patient',
        },
      });

      const req = new Request('http://localhost:3000/api/billing/invoices', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({
          patientId: otherPatient.id,
          appointmentId: appointmentAId, // appointment belongs to patientA, not otherPatient
          items: [{ description: 'Test', quantity: 1, unitPrice: '100.00' }],
        }),
      });

      const res = await createInvoiceHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/does not belong to the specified patient/i);
    });

    it('rejects invoice creation when discount exceeds subtotal with clear HTTP 400', async () => {
      const req = new Request('http://localhost:3000/api/billing/invoices', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({
          patientId: patientAId,
          discount: '1000.00',
          items: [{ description: 'General Checkup', quantity: 1, unitPrice: '200.00' }],
        }),
      });

      const res = await createInvoiceHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Discount.*cannot exceed subtotal/i);
    });
  });

  describe('3. GET /api/billing/invoices and GET /api/billing/invoices/[invoiceId]', () => {
    it('lists invoices strictly scoped to the active clinic', async () => {
      const reqA = new Request('http://localhost:3000/api/billing/invoices', {
        method: 'GET',
        headers: {
          Host: 'localhost:3000',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
      });

      const resA = await listInvoicesHandler(reqA);
      expect(resA.status).toBe(200);
      const dataA = await resA.json();
      expect(dataA.invoices.length).toBeGreaterThanOrEqual(2);
      expect(dataA.invoices.every((inv: { clinicId: string }) => inv.clinicId === clinicAId)).toBe(true);

      // Clinic B query must see 0 invoices from Clinic A
      const reqB = new Request('http://localhost:3000/api/billing/invoices', {
        method: 'GET',
        headers: {
          Host: 'localhost:3000',
          cookie: `${SESSION_COOKIE_NAME}=${doctorBToken}`,
        },
      });

      const resB = await listInvoicesHandler(reqB);
      expect(resB.status).toBe(200);
      const dataB = await resB.json();
      expect(dataB.invoices).toHaveLength(0);
    });

    it('retrieves detailed invoice with calculated outstanding balance', async () => {
      const req = new Request(`http://localhost:3000/api/billing/invoices/${createdInvoiceAId}`, {
        method: 'GET',
        headers: {
          Host: 'localhost:3000',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
      });

      const res = await getInvoiceHandler(req, {
        params: Promise.resolve({ invoiceId: createdInvoiceAId }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.invoice.id).toBe(createdInvoiceAId);
      expect(data.invoice.invoiceNumber).toBe('INV-2026-0001');
      expect(data.invoice.balanceDue.toString()).toBe('767');
      expect(data.invoice.isFullyPaid).toBe(false);
      expect(data.invoice.patient.name).toBe('Ramesh Sharma');
    });

    it('rejects cross-tenant access: Clinic B requesting Clinic A invoice returns 404', async () => {
      const req = new Request(`http://localhost:3000/api/billing/invoices/${createdInvoiceAId}`, {
        method: 'GET',
        headers: {
          Host: 'localhost:3000',
          cookie: `${SESSION_COOKIE_NAME}=${doctorBToken}`, // Clinic B session!
        },
      });

      const res = await getInvoiceHandler(req, {
        params: Promise.resolve({ invoiceId: createdInvoiceAId }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toMatch(/Invoice not found in active clinic/i);
    });
  });

  describe('4. PATCH /api/billing/invoices/[invoiceId] (Updates & Status Invariants)', () => {
    it('transitions DRAFT invoice to ISSUED and sets issueDate', async () => {
      const req = new Request(`http://localhost:3000/api/billing/invoices/${createdInvoiceAId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({
          status: 'ISSUED',
          notes: 'Issued to patient at pharmacy counter',
        }),
      });

      const res = await updateInvoiceHandler(req, {
        params: Promise.resolve({ invoiceId: createdInvoiceAId }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.invoice.status).toBe('ISSUED');
      expect(data.invoice.issueDate).toBeTruthy();
      expect(data.invoice.notes).toBe('Issued to patient at pharmacy counter');
    });

    it('locks financial fields once invoice is ISSUED (rejects modifying line items)', async () => {
      const req = new Request(`http://localhost:3000/api/billing/invoices/${createdInvoiceAId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({
          items: [{ description: 'Tampered item', quantity: 1, unitPrice: '10.00' }],
        }),
      });

      const res = await updateInvoiceHandler(req, {
        params: Promise.resolve({ invoiceId: createdInvoiceAId }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Financial records are locked/i);
    });

    it('rejects invalid status transition (e.g. ISSUED -> DRAFT) with 400', async () => {
      const req = new Request(`http://localhost:3000/api/billing/invoices/${createdInvoiceAId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({
          status: 'DRAFT',
        }),
      });

      const res = await updateInvoiceHandler(req, {
        params: Promise.resolve({ invoiceId: createdInvoiceAId }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Invalid invoice status transition/i);
    });

    it('rejects draft amendment when discount exceeds subtotal with clear HTTP 400', async () => {
      // Create a draft invoice
      const createReq = new Request('http://localhost:3000/api/billing/invoices', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({
          patientId: patientAId,
          items: [{ description: 'Draft Test', quantity: 1, unitPrice: '100.00' }],
        }),
      });
      const createRes = await createInvoiceHandler(createReq);
      const { invoice } = await createRes.json();

      const patchReq = new Request(`http://localhost:3000/api/billing/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({
          discount: '500.00', // exceeds subtotal of 100.00
        }),
      });

      const patchRes = await updateInvoiceHandler(patchReq, {
        params: Promise.resolve({ invoiceId: invoice.id }),
      });
      expect(patchRes.status).toBe(400);
      const data = await patchRes.json();
      expect(data.error).toMatch(/Discount.*cannot exceed subtotal/i);
    });

    it('PROHIBITS manual assignment of PAID or PARTIALLY_PAID via PATCH (must be derived from payments)', async () => {
      // Attempting to set status: 'PAID' via PATCH must return 400
      const paidReq = new Request(`http://localhost:3000/api/billing/invoices/${createdInvoiceAId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({ status: 'PAID' }),
      });

      const paidRes = await updateInvoiceHandler(paidReq, {
        params: Promise.resolve({ invoiceId: createdInvoiceAId }),
      });
      expect(paidRes.status).toBe(400);
      const paidData = await paidRes.json();
      expect(paidData.error).toMatch(/Cannot manually assign status 'PAID'/i);

      // Attempting to set status: 'PARTIALLY_PAID' via PATCH must return 400
      const partReq = new Request(`http://localhost:3000/api/billing/invoices/${createdInvoiceAId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({ status: 'PARTIALLY_PAID' }),
      });

      const partRes = await updateInvoiceHandler(partReq, {
        params: Promise.resolve({ invoiceId: createdInvoiceAId }),
      });
      expect(partRes.status).toBe(400);
      const partData = await partRes.json();
      expect(partData.error).toMatch(/Cannot manually assign status 'PARTIALLY_PAID'/i);
    });

    it('PROHIBITS manual assignment of REFUNDED via PATCH without an explicit refund workflow', async () => {
      const refundReq = new Request(`http://localhost:3000/api/billing/invoices/${createdInvoiceAId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({ status: 'REFUNDED' }),
      });

      const refundRes = await updateInvoiceHandler(refundReq, {
        params: Promise.resolve({ invoiceId: createdInvoiceAId }),
      });
      expect(refundRes.status).toBe(400);
      const refundData = await refundRes.json();
      expect(refundData.error).toMatch(/Cannot manually assign status 'REFUNDED'/i);
    });
  });

  describe('5. POST /api/billing/invoices/[invoiceId]/payments (Payment Recording & Invariants)', () => {
    it('records a partial payment (UPI) and transitions invoice to PARTIALLY_PAID', async () => {
      const payload = {
        amount: '400.00',
        method: 'UPI',
        transactionRef: 'UPI-TXN-99887766',
        notes: 'Paid via PhonePe QR',
      };

      const req = new Request(
        `http://localhost:3000/api/billing/invoices/${createdInvoiceAId}/payments`,
        {
          method: 'POST',
          headers: {
            Host: 'localhost:3000',
            Origin: 'http://localhost:3000',
            'Content-Type': 'application/json',
            cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const res = await recordPaymentHandler(req, {
        params: Promise.resolve({ invoiceId: createdInvoiceAId }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.payment.amount.toString()).toBe('400');
      expect(data.payment.method).toBe('UPI');
      expect(data.payment.clinicId).toBe(clinicAId);
      expect(data.payment.receivedBy.name).toBe('Rohan Receptionist');

      // Invoice status check: 400 of 767 paid -> PARTIALLY_PAID, balance 367.00
      expect(data.invoice.status).toBe('PARTIALLY_PAID');
      expect(parseFloat(data.invoice.paidAmount)).toBe(400.0);
      expect(parseFloat(data.invoice.balanceDue)).toBe(367.0);
      expect(data.invoice.isFullyPaid).toBe(false);
    });

    it('PREVENTS VOIDING AN INVOICE WITH RECORDED PAYMENTS', async () => {
      // createdInvoiceAId has 400.00 recorded payment!
      const req = new Request(`http://localhost:3000/api/billing/invoices/${createdInvoiceAId}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({
          status: 'VOID',
          reason: 'Attempting to void paid invoice',
        }),
      });

      const res = await updateInvoiceHandler(req, {
        params: Promise.resolve({ invoiceId: createdInvoiceAId }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Cannot void invoice with recorded payments/i);
    });

    it('PREVENTS OVERPAYMENT: rejects payment amount exceeding outstanding balance', async () => {
      // Balance is 367.00. Attempting to pay 500.00 must be rejected!
      const req = new Request(
        `http://localhost:3000/api/billing/invoices/${createdInvoiceAId}/payments`,
        {
          method: 'POST',
          headers: {
            Host: 'localhost:3000',
            Origin: 'http://localhost:3000',
            'Content-Type': 'application/json',
            cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
          },
          body: JSON.stringify({
            amount: '500.00',
            method: 'CASH',
          }),
        }
      );

      const res = await recordPaymentHandler(req, {
        params: Promise.resolve({ invoiceId: createdInvoiceAId }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/exceeds outstanding balance/i);
    });

    it('records completing payment (CASH) and transitions invoice to PAID', async () => {
      // Balance is exactly 367.00
      const req = new Request(
        `http://localhost:3000/api/billing/invoices/${createdInvoiceAId}/payments`,
        {
          method: 'POST',
          headers: {
            Host: 'localhost:3000',
            Origin: 'http://localhost:3000',
            'Content-Type': 'application/json',
            cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
          },
          body: JSON.stringify({
            amount: '367.00',
            method: 'CASH',
            notes: 'Cash received at front desk',
          }),
        }
      );

      const res = await recordPaymentHandler(req, {
        params: Promise.resolve({ invoiceId: createdInvoiceAId }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();

      expect(data.invoice.status).toBe('PAID');
      expect(parseFloat(data.invoice.paidAmount)).toBe(767.0);
      expect(parseFloat(data.invoice.balanceDue)).toBe(0.0);
      expect(data.invoice.isFullyPaid).toBe(true);
    });

    it('rejects further payment on already fully PAID invoice with 400', async () => {
      const req = new Request(
        `http://localhost:3000/api/billing/invoices/${createdInvoiceAId}/payments`,
        {
          method: 'POST',
          headers: {
            Host: 'localhost:3000',
            Origin: 'http://localhost:3000',
            'Content-Type': 'application/json',
            cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
          },
          body: JSON.stringify({
            amount: '10.00',
            method: 'CASH',
          }),
        }
      );

      const res = await recordPaymentHandler(req, {
        params: Promise.resolve({ invoiceId: createdInvoiceAId }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/already fully paid/i);
    });

    it('rejects recording payment from another clinic (cross-clinic payment rejection)', async () => {
      const req = new Request(
        `http://localhost:3000/api/billing/invoices/${createdInvoiceAId}/payments`,
        {
          method: 'POST',
          headers: {
            Host: 'localhost:3000',
            Origin: 'http://localhost:3000',
            'Content-Type': 'application/json',
            cookie: `${SESSION_COOKIE_NAME}=${doctorBToken}`, // Clinic B session!
          },
          body: JSON.stringify({
            amount: '50.00',
            method: 'CASH',
          }),
        }
      );

      const res = await recordPaymentHandler(req, {
        params: Promise.resolve({ invoiceId: createdInvoiceAId }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toMatch(/Invoice not found in active clinic/i);
    });
  });

  describe('6. Real Concurrent Number Allocation Against Database', () => {
    it('creates 5 invoices concurrently against PostgreSQL without number collision or sequence reuse', async () => {
      // Dispatch 5 concurrent requests simultaneously
      const promises = Array.from({ length: 5 }, (_, i) => {
        const req = new Request('http://localhost:3000/api/billing/invoices', {
          method: 'POST',
          headers: {
            Host: 'localhost:3000',
            Origin: 'http://localhost:3000',
            'Content-Type': 'application/json',
            cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
          },
          body: JSON.stringify({
            patientId: patientAId,
            items: [
              {
                description: `Concurrent Test Item ${i + 1}`,
                quantity: 1,
                unitPrice: '100.00',
              },
            ],
          }),
        });
        return createInvoiceHandler(req);
      });

      const responses = await Promise.all(promises);
      for (const res of responses) {
        expect(res.status).toBe(201);
      }

      const bodies = await Promise.all(responses.map((r) => r.json()));
      const invoiceNumbers = bodies.map((b) => b.invoice.invoiceNumber);

      // Verify all 5 received distinct invoice numbers
      expect(invoiceNumbers).toHaveLength(5);
      expect(new Set(invoiceNumbers).size).toBe(5);

      // All invoice numbers must follow INV-2026-NNNN format
      for (const num of invoiceNumbers) {
        expect(num).toMatch(/^INV-2026-\d{4}$/);
      }
    });

    it('prevents concurrent overpayment: simultaneous payments exceeding balance result in exactly one success and one 400 rejection', async () => {
      // Create an invoice with totalAmount 200.00
      const createReq = new Request('http://localhost:3000/api/billing/invoices', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({
          patientId: patientAId,
          items: [{ description: 'Concurrent Payment Item', quantity: 1, unitPrice: '200.00' }],
        }),
      });
      const createRes = await createInvoiceHandler(createReq);
      const { invoice } = await createRes.json();

      // Issue the invoice
      const issueReq = new Request(`http://localhost:3000/api/billing/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({ status: 'ISSUED' }),
      });
      await updateInvoiceHandler(issueReq, { params: Promise.resolve({ invoiceId: invoice.id }) });

      // Dispatch two concurrent payment requests for 150.00 each (150 + 150 = 300 > 200)
      const payReq1 = new Request(`http://localhost:3000/api/billing/invoices/${invoice.id}/payments`, {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({ amount: '150.00', method: 'CASH', notes: 'Concurrent payment 1' }),
      });

      const payReq2 = new Request(`http://localhost:3000/api/billing/invoices/${invoice.id}/payments`, {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({ amount: '150.00', method: 'CASH', notes: 'Concurrent payment 2' }),
      });

      const [res1, res2] = await Promise.all([
        recordPaymentHandler(payReq1, { params: Promise.resolve({ invoiceId: invoice.id }) }),
        recordPaymentHandler(payReq2, { params: Promise.resolve({ invoiceId: invoice.id }) }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 400]);

      // Verify ledger consistency: paidAmount must be exactly 150.00 and only 1 payment recorded
      const dbInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: { payments: true },
      });
      expect(dbInvoice).toBeDefined();
      expect(parseFloat(dbInvoice!.paidAmount.toString())).toBe(150.0);
      expect(dbInvoice!.payments).toHaveLength(1);
      expect(dbInvoice!.status).toBe('PARTIALLY_PAID');
    });

    it('serializes concurrent payment and void attempts so a paid invoice cannot be voided', async () => {
      // Create an invoice with totalAmount 100.00
      const createReq = new Request('http://localhost:3000/api/billing/invoices', {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({
          patientId: patientAId,
          items: [{ description: 'Void vs Pay Item', quantity: 1, unitPrice: '100.00' }],
        }),
      });
      const createRes = await createInvoiceHandler(createReq);
      const { invoice } = await createRes.json();

      // Issue the invoice
      const issueReq = new Request(`http://localhost:3000/api/billing/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({ status: 'ISSUED' }),
      });
      await updateInvoiceHandler(issueReq, { params: Promise.resolve({ invoiceId: invoice.id }) });

      // Dispatch a payment request and a void request concurrently
      const payReq = new Request(`http://localhost:3000/api/billing/invoices/${invoice.id}/payments`, {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({ amount: '100.00', method: 'CASH' }),
      });

      const voidReq = new Request(`http://localhost:3000/api/billing/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: {
          Host: 'localhost:3000',
          Origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${receptionistAToken}`,
        },
        body: JSON.stringify({ status: 'VOID', reason: 'Attempting void during payment' }),
      });

      const [payRes, voidRes] = await Promise.all([
        recordPaymentHandler(payReq, { params: Promise.resolve({ invoiceId: invoice.id }) }),
        updateInvoiceHandler(voidReq, { params: Promise.resolve({ invoiceId: invoice.id }) }),
      ]);

      const dbInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: { payments: true },
      });

      // Strict invariant check: under no circumstance can an invoice with payments be marked VOID
      if (dbInvoice!.payments.length > 0) {
        expect(dbInvoice!.status).not.toBe('VOID');
        expect(voidRes.status).toBe(400);
      } else {
        expect(dbInvoice!.status).toBe('VOID');
        expect(payRes.status).toBe(400);
      }
    });
  });

  describe('7. Transaction Rollback Behavior on Invoice Creation Failure', () => {
    it('rolls back sequence allocation when invoice creation fails inside the database transaction', async () => {
      // Check current sequence for Clinic B in 2026
      const seqBefore = await prisma.invoiceSequence.findUnique({
        where: {
          clinicId_year: {
            clinicId: clinicBId,
            year: 2026,
          },
        },
      });
      const initialSeq = seqBefore?.lastSequence ?? 0;

      // Attempt to execute a failing transaction where sequence is allocated but invoice creation throws
      await expect(
        prisma.$transaction(async (tx) => {
          // Allocate next sequence
          await tx.invoiceSequence.upsert({
            where: {
              clinicId_year: {
                clinicId: clinicBId,
                year: 2026,
              },
            },
            create: {
              clinicId: clinicBId,
              year: 2026,
              lastSequence: 1,
            },
            update: {
              lastSequence: {
                increment: 1,
              },
            },
          });

          // Simulate an unexpected error or constraint failure during invoice creation
          throw new Error('Simulated database write failure during invoice creation');
        })
      ).rejects.toThrow('Simulated database write failure during invoice creation');

      // Verify sequence was rolled back and did NOT advance
      const seqAfter = await prisma.invoiceSequence.findUnique({
        where: {
          clinicId_year: {
            clinicId: clinicBId,
            year: 2026,
          },
        },
      });
      const finalSeq = seqAfter?.lastSequence ?? 0;

      expect(finalSeq).toBe(initialSeq);
    });
  });
});
