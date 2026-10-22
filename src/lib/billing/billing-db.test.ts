import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { allocateNextInvoiceNumber } from './invoice-number';
import { calculateInvoiceTotals, calculateBalanceDue } from './invoice-calculator';

describe('Billing Database Models, Constraints & Sequence Allocation', () => {
  let clinicAId: string;
  let clinicBId: string;
  let patientAId: string;
  let doctorAId: string;

  beforeAll(async () => {
    // Clean up any lingering test clinics/users from previous runs
    const existingClinics = await prisma.clinic.findMany({
      where: {
        slug: {
          in: ['billing-test-clinic-a', 'billing-test-clinic-b'],
        },
      },
      select: { id: true },
    });

    for (const c of existingClinics) {
      // Clean payments, items, invoices, sequences, appointments, patients
      await prisma.payment.deleteMany({ where: { clinicId: c.id } });
      await prisma.invoiceItem.deleteMany({ where: { invoice: { clinicId: c.id } } });
      await prisma.invoice.deleteMany({ where: { clinicId: c.id } });
      await prisma.invoiceSequence.deleteMany({ where: { clinicId: c.id } });
      await prisma.appointment.deleteMany({ where: { clinicId: c.id } });
      await prisma.patient.deleteMany({ where: { clinicId: c.id } });
      await prisma.membership.deleteMany({ where: { clinicId: c.id } });
      await prisma.clinic.delete({ where: { id: c.id } });
    }

    const existingUsers = await prisma.user.findMany({
      where: { email: 'doctor.billing@nexora.test' },
      select: { id: true },
    });
    for (const u of existingUsers) {
      await prisma.user.delete({ where: { id: u.id } });
    }

    // Create test user
    const doctor = await prisma.user.create({
      data: {
        email: 'doctor.billing@nexora.test',
        passwordHash: 'dummy_hash',
        name: 'Dr. Billing Test',
      },
    });
    doctorAId = doctor.id;

    // Create Clinic A with tax registration details
    const clinicA = await prisma.clinic.create({
      data: {
        name: 'Billing Test Clinic A',
        slug: 'billing-test-clinic-a',
        currency: 'INR',
        country: 'IN',
        taxLabel: 'GSTIN',
        taxNumber: '27AAPFU0939F1ZV',
      },
    });
    clinicAId = clinicA.id;

    // Create Clinic B for isolation testing
    const clinicB = await prisma.clinic.create({
      data: {
        name: 'Billing Test Clinic B',
        slug: 'billing-test-clinic-b',
        currency: 'NPR',
        country: 'NP',
        taxLabel: 'PAN',
        taxNumber: '601234567',
      },
    });
    clinicBId = clinicB.id;

    // Create patient in Clinic A
    const patientA = await prisma.patient.create({
      data: {
        clinicId: clinicAId,
        mrn: 'MRN-BILLING-001',
        name: 'Test Patient Billing',
      },
    });
    patientAId = patientA.id;
  });

  afterAll(async () => {
    // Teardown test data
    if (clinicAId) {
      await prisma.payment.deleteMany({ where: { clinicId: clinicAId } });
      await prisma.invoiceItem.deleteMany({ where: { invoice: { clinicId: clinicAId } } });
      await prisma.invoice.deleteMany({ where: { clinicId: clinicAId } });
      await prisma.invoiceSequence.deleteMany({ where: { clinicId: clinicAId } });
      await prisma.patient.deleteMany({ where: { clinicId: clinicAId } });
      await prisma.clinic.delete({ where: { id: clinicAId } });
    }

    if (clinicBId) {
      await prisma.payment.deleteMany({ where: { clinicId: clinicBId } });
      await prisma.invoiceItem.deleteMany({ where: { invoice: { clinicId: clinicBId } } });
      await prisma.invoice.deleteMany({ where: { clinicId: clinicBId } });
      await prisma.invoiceSequence.deleteMany({ where: { clinicId: clinicBId } });
      await prisma.clinic.delete({ where: { id: clinicBId } });
    }

    if (doctorAId) {
      await prisma.user.delete({ where: { id: doctorAId } });
    }
  });

  describe('Invoice Sequence Model & Database Allocation', () => {
    it('allocates sequences atomically per clinic and year in the database', async () => {
      const alloc1 = await allocateNextInvoiceNumber(prisma, clinicAId, 2026);
      expect(alloc1.sequence).toBe(1);
      expect(alloc1.invoiceNumber).toBe('INV-2026-0001');

      const alloc2 = await allocateNextInvoiceNumber(prisma, clinicAId, 2026);
      expect(alloc2.sequence).toBe(2);
      expect(alloc2.invoiceNumber).toBe('INV-2026-0002');

      // Allocation for a different year starts at 1
      const allocYear2027 = await allocateNextInvoiceNumber(prisma, clinicAId, 2027);
      expect(allocYear2027.sequence).toBe(1);
      expect(allocYear2027.invoiceNumber).toBe('INV-2027-0001');

      // Allocation for Clinic B starts at 1 (clinic scoped)
      const allocClinicB = await allocateNextInvoiceNumber(prisma, clinicBId, 2026);
      expect(allocClinicB.sequence).toBe(1);
      expect(allocClinicB.invoiceNumber).toBe('INV-2026-0001');
    });

    it('enforces @@unique([clinicId, year]) on InvoiceSequence', async () => {
      // Attempting to manually create duplicate sequence for (clinicAId, 2026) must fail
      await expect(
        prisma.invoiceSequence.create({
          data: {
            clinicId: clinicAId,
            year: 2026,
            lastSequence: 99,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Invoice and InvoiceItem Models', () => {
    let createdInvoiceId: string;

    it('creates an invoice with line items, snapshotted tax details, and exact decimals', async () => {
      const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicAId } });

      const lineItems = [
        {
          quantity: 1,
          unitPrice: '500.00',
          description: 'Specialist Consultation',
          itemType: 'CONSULTATION' as const,
        },
        {
          quantity: 2,
          unitPrice: '120.00',
          description: 'Antacid tablets',
          itemType: 'MEDICATION' as const,
        },
      ];

      const totals = calculateInvoiceTotals({
        items: lineItems,
        discount: '40.00',
        taxRate: '18.00',
      });

      // Subtotal: 500 + 240 = 740.00
      // Discount: 40.00
      // Taxable: 700.00
      // Tax (18%): 126.00
      // Total: 826.00
      expect(totals.subtotal.toFixed(2)).toBe('740.00');
      expect(totals.totalAmount.toFixed(2)).toBe('826.00');

      const invoice = await prisma.invoice.create({
        data: {
          clinicId: clinicAId,
          patientId: patientAId,
          createdById: doctorAId,
          invoiceNumber: 'INV-2026-0001',
          year: 2026,
          currency: clinic.currency,
          status: 'ISSUED',
          subtotal: totals.subtotal,
          discount: totals.discount,
          taxRate: totals.taxRate,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          paidAmount: new Prisma.Decimal('0.00'),
          taxLabel: clinic.taxLabel,
          taxNumber: clinic.taxNumber,
          notes: 'Standard outpatient consultation',
          items: {
            create: lineItems.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: new Prisma.Decimal(item.unitPrice),
              lineTotal: new Prisma.Decimal(item.unitPrice).times(item.quantity),
              itemType: item.itemType,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      createdInvoiceId = invoice.id;

      expect(invoice.invoiceNumber).toBe('INV-2026-0001');
      expect(invoice.currency).toBe('INR');
      expect(invoice.taxLabel).toBe('GSTIN');
      expect(invoice.taxNumber).toBe('27AAPFU0939F1ZV');
      expect(invoice.subtotal.toString()).toBe('740');
      expect(invoice.totalAmount.toString()).toBe('826');
      expect(invoice.paidAmount.toString()).toBe('0');
      expect(invoice.items).toHaveLength(2);
    });

    it('enforces @@unique([clinicId, invoiceNumber]) on invoices in the database', async () => {
      // Same clinic attempting to insert identical invoiceNumber must violate unique constraint
      await expect(
        prisma.invoice.create({
          data: {
            clinicId: clinicAId,
            patientId: patientAId,
            invoiceNumber: 'INV-2026-0001',
            year: 2026,
            currency: 'INR',
            subtotal: new Prisma.Decimal('100.00'),
            totalAmount: new Prisma.Decimal('100.00'),
          },
        })
      ).rejects.toThrow();
    });

    it('allows same invoiceNumber in a different clinic (clinic isolation)', async () => {
      // Clinic B can have INV-2026-0001 because invoice numbers are clinic-scoped
      const patientB = await prisma.patient.create({
        data: {
          clinicId: clinicBId,
          mrn: 'MRN-B-001',
          name: 'Patient B',
        },
      });

      const invoiceB = await prisma.invoice.create({
        data: {
          clinicId: clinicBId,
          patientId: patientB.id,
          invoiceNumber: 'INV-2026-0001',
          year: 2026,
          currency: 'NPR',
          subtotal: new Prisma.Decimal('500.00'),
          totalAmount: new Prisma.Decimal('500.00'),
        },
      });

      expect(invoiceB.invoiceNumber).toBe('INV-2026-0001');
      expect(invoiceB.clinicId).toBe(clinicBId);
      expect(invoiceB.currency).toBe('NPR');
    });

    it('cascades line items when an unpaid draft invoice is deleted', async () => {
      const draftInvoice = await prisma.invoice.create({
        data: {
          clinicId: clinicAId,
          patientId: patientAId,
          invoiceNumber: 'INV-2026-0099',
          year: 2026,
          currency: 'INR',
          status: 'DRAFT',
          subtotal: new Prisma.Decimal('200.00'),
          totalAmount: new Prisma.Decimal('200.00'),
          items: {
            create: [
              {
                description: 'Draft item',
                quantity: 1,
                unitPrice: new Prisma.Decimal('200.00'),
                lineTotal: new Prisma.Decimal('200.00'),
                itemType: 'MISC',
              },
            ],
          },
        },
      });

      const itemsBefore = await prisma.invoiceItem.findMany({
        where: { invoiceId: draftInvoice.id },
      });
      expect(itemsBefore).toHaveLength(1);

      // Deleting unpaid draft invoice cascades to its items
      await prisma.invoice.delete({ where: { id: draftInvoice.id } });

      const itemsAfter = await prisma.invoiceItem.findMany({
        where: { invoiceId: draftInvoice.id },
      });
      expect(itemsAfter).toHaveLength(0);
    });

    it('records payments and updates paidAmount accurately', async () => {
      // Record payment 1: 500.00 via UPI
      const payment1 = await prisma.payment.create({
        data: {
          clinicId: clinicAId,
          invoiceId: createdInvoiceId,
          amount: new Prisma.Decimal('500.00'),
          method: 'UPI',
          transactionRef: 'UPI-TXN-12345',
          receivedById: doctorAId,
        },
      });

      expect(payment1.amount.toString()).toBe('500');

      // Update invoice paid amount
      await prisma.invoice.update({
        where: { id: createdInvoiceId },
        data: {
          paidAmount: new Prisma.Decimal('500.00'),
          status: 'PARTIALLY_PAID',
        },
      });

      // Check balance
      const balance1 = calculateBalanceDue('826.00', '500.00');
      expect(balance1.balanceDue.toFixed(2)).toBe('326.00');
      expect(balance1.isFullyPaid).toBe(false);

      // Record payment 2: 326.00 via CASH (completing invoice)
      await prisma.payment.create({
        data: {
          clinicId: clinicAId,
          invoiceId: createdInvoiceId,
          amount: new Prisma.Decimal('326.00'),
          method: 'CASH',
          receivedById: doctorAId,
        },
      });

      await prisma.invoice.update({
        where: { id: createdInvoiceId },
        data: {
          paidAmount: new Prisma.Decimal('826.00'),
          status: 'PAID',
        },
      });

      const balance2 = calculateBalanceDue('826.00', '826.00');
      expect(balance2.balanceDue.toFixed(2)).toBe('0.00');
      expect(balance2.isFullyPaid).toBe(true);
    });

    it('ENFORCES database foreign key RESTRICT: deleting an invoice with payments is strictly rejected', async () => {
      // createdInvoiceId has 2 recorded payments. Attempting to delete must fail with FK RESTRICT error!
      await expect(
        prisma.invoice.delete({
          where: { id: createdInvoiceId },
        })
      ).rejects.toThrow();
    });

    it('ENFORCES database foreign key RESTRICT: deleting a patient or clinic with invoices is strictly rejected', async () => {
      // Patient A has invoices. Attempting to delete patientA must fail with FK RESTRICT error!
      await expect(
        prisma.patient.delete({
          where: { id: patientAId },
        })
      ).rejects.toThrow();

      // Clinic A has invoices. Attempting to delete clinicA must fail with FK RESTRICT error!
      await expect(
        prisma.clinic.delete({
          where: { id: clinicAId },
        })
      ).rejects.toThrow();
    });
  });
});
