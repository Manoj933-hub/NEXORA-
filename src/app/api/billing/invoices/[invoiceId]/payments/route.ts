import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireClinicAccess, AuthError } from '@/lib/auth/tenant';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import type { Permission } from '@/lib/auth/permissions';
import { RecordPaymentInputSchema } from '@/lib/validations/billing';
import {
  calculateBalanceDue,
  toDecimal,
} from '@/lib/billing/invoice-calculator';
import { Prisma, type InvoiceStatus } from '@prisma/client';
import { notifyPaymentReceipt } from '@/lib/notifications/workflow-triggers';

class PaymentRouteError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'PaymentRouteError';
    this.statusCode = statusCode;
  }
}

async function resolveTenantContext(
  request: Request,
  options?: {
    requiredPermission?: Permission;
    explicitClinicId?: string | null;
  }
) {
  const url = new URL(request.url);
  const clinicId =
    options?.explicitClinicId ||
    url.searchParams.get('clinicId') ||
    request.headers.get('x-clinic-id');

  if (clinicId) {
    return requireClinicAccess(request, clinicId, options);
  }

  const { session } = await requireAuth(request);
  if (!session.activeClinicId) {
    throw new AuthError('No active clinic selected in session. Please select a clinic.', 400);
  }

  return requireClinicAccess(request, session.activeClinicId, options);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    await connection();
  } catch {
    // Outside Next.js runtime context (e.g. tests)
  }

  const originCheck = validateRequestOrigin(request);
  if (!originCheck.valid) {
    return NextResponse.json(
      { error: originCheck.reason || 'Invalid request origin' },
      { status: 403 }
    );
  }

  try {
    const resolvedParams = await params;
    const invoiceId = resolvedParams.invoiceId;

    const context = await resolveTenantContext(request, {
      requiredPermission: 'patients:write',
    });

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = RecordPaymentInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const paymentAmount = toDecimal(input.amount);

    if (paymentAmount.lessThanOrEqualTo(0)) {
      return NextResponse.json(
        { error: 'Payment amount must be strictly greater than zero' },
        { status: 400 }
      );
    }

    // Execute row-locked transaction: lock invoice row, verify fresh state, record payment, update invoice
    const { payment, updatedInvoice, patientId } = await prisma.$transaction(async (tx) => {
      // Acquire exclusive row-level lock on target invoice scoped strictly to active clinic
      const [lockedInvoice] = await tx.$queryRaw<
        Array<{
          id: string;
          clinic_id: string;
          patient_id: string;
          invoice_number: string;
          status: InvoiceStatus;
          total_amount: Prisma.Decimal;
          paid_amount: Prisma.Decimal;
        }>
      >`
        SELECT
          id,
          clinic_id,
          patient_id,
          invoice_number,
          status,
          total_amount,
          paid_amount
        FROM invoices
        WHERE id = ${invoiceId} AND clinic_id = ${context.clinic.id}
        FOR UPDATE
      `;

      if (!lockedInvoice) {
        throw new PaymentRouteError('Invoice not found in active clinic', 404);
      }

      // Re-read and validate status only after obtaining the exclusive row lock
      if (lockedInvoice.status === 'VOID') {
        throw new PaymentRouteError('Cannot record payment for a voided invoice', 400);
      }

      if (lockedInvoice.status === 'REFUNDED') {
        throw new PaymentRouteError('Cannot record payment for a refunded invoice', 400);
      }

      if (lockedInvoice.status === 'DRAFT') {
        throw new PaymentRouteError(
          'Cannot record payment for a draft invoice. Please issue the invoice first.',
          400
        );
      }

      const totalAmount = new Prisma.Decimal(lockedInvoice.total_amount);
      const currentPaid = new Prisma.Decimal(lockedInvoice.paid_amount);

      if (lockedInvoice.status === 'PAID' && currentPaid.greaterThanOrEqualTo(totalAmount)) {
        throw new PaymentRouteError('Invoice is already fully paid', 400);
      }

      // Concurrency defense: recalculate outstanding balance strictly from fresh locked database row
      const outstandingBalance = totalAmount.minus(currentPaid);
      if (paymentAmount.greaterThan(outstandingBalance)) {
        throw new PaymentRouteError(
          `Payment amount (${paymentAmount.toFixed(2)}) exceeds outstanding balance (${outstandingBalance.toFixed(2)}). Overpayment is not permitted.`,
          400
        );
      }

      // Insert payment record atomically
      const createdPayment = await tx.payment.create({
        data: {
          clinicId: context.clinic.id,
          invoiceId: lockedInvoice.id,
          amount: paymentAmount,
          method: input.method,
          transactionRef: input.transactionRef ?? null,
          notes: input.notes ?? null,
          receivedById: context.user.id,
          receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
        },
        include: {
          receivedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Update paidAmount and status using the fresh locked state (never a stale outer object)
      const newPaidAmount = currentPaid.plus(paymentAmount);
      const isComplete = newPaidAmount.greaterThanOrEqualTo(totalAmount);
      const newStatus: InvoiceStatus = isComplete ? 'PAID' : 'PARTIALLY_PAID';

      const updated = await tx.invoice.update({
        where: { id: lockedInvoice.id },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus,
        },
      });

      return {
        payment: createdPayment,
        updatedInvoice: updated,
        patientId: lockedInvoice.patient_id,
      };
    });

    // Trigger payment receipt notification (Phase 9.3) - non-blocking ancillary task
    await notifyPaymentReceipt({
      clinicId: context.clinic.id,
      patientId,
      paymentId: payment.id,
      invoiceId: updatedInvoice.id,
      createdById: context.user.id,
    });

    const balance = calculateBalanceDue(updatedInvoice.totalAmount, updatedInvoice.paidAmount);

    return NextResponse.json(
      {
        payment,
        invoice: {
          id: updatedInvoice.id,
          invoiceNumber: updatedInvoice.invoiceNumber,
          status: updatedInvoice.status,
          totalAmount: updatedInvoice.totalAmount,
          paidAmount: updatedInvoice.paidAmount,
          balanceDue: balance.balanceDue,
          isFullyPaid: balance.isFullyPaid,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      'digest' in error &&
      (error as { digest: string }).digest === 'NEXT_PRERENDER_INTERRUPTED'
    ) {
      throw error;
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof PaymentRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in POST /api/billing/invoices/[invoiceId]/payments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
