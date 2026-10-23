import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireClinicAccess, AuthError } from '@/lib/auth/tenant';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import type { Permission } from '@/lib/auth/permissions';
import {
  PatchInvoiceInputSchema,
  isValidInvoiceStatusTransition,
} from '@/lib/validations/billing';
import {
  calculateBalanceDue,
  calculateInvoiceTotals,
  calculateLineTotal,
  calculateSubtotal,
  toDecimal,
  type LineItemInput,
} from '@/lib/billing/invoice-calculator';
import { Prisma, type InvoiceStatus } from '@prisma/client';

class PatchRouteError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'PatchRouteError';
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    await connection();
  } catch {
    // Outside Next.js runtime context (e.g. tests)
  }

  try {
    const resolvedParams = await params;
    const invoiceId = resolvedParams.invoiceId;

    const context = await resolveTenantContext(request, {
      requiredPermission: 'patients:read',
    });

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        clinicId: context.clinic.id,
      },
      include: {
        items: true,
        payments: {
          orderBy: { receivedAt: 'desc' },
          include: {
            receivedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        patient: {
          select: {
            id: true,
            mrn: true,
            name: true,
            phone: true,
            email: true,
            dateOfBirth: true,
            gender: true,
          },
        },
        appointment: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            status: true,
          },
        },
        consultation: {
          select: {
            id: true,
            status: true,
            version: true,
            createdAt: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        clinic: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
            country: true,
            currency: true,
            taxLabel: true,
            taxNumber: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found in active clinic' },
        { status: 404 }
      );
    }

    const balance = calculateBalanceDue(invoice.totalAmount, invoice.paidAmount);

    return NextResponse.json({
      invoice: {
        ...invoice,
        balanceDue: balance.balanceDue,
        isFullyPaid: balance.isFullyPaid,
        isOverpaid: balance.isOverpaid,
      },
    });
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
    console.error('Error in GET /api/billing/invoices/[invoiceId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
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

    const parsed = PatchInvoiceInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // Reject manual assignment of payment-derived or refund statuses
    if (input.status === 'PAID' || input.status === 'PARTIALLY_PAID') {
      return NextResponse.json(
        {
          error: `Cannot manually assign status '${input.status}'. Payment statuses ('PAID', 'PARTIALLY_PAID') are derived automatically when payments are recorded.`,
        },
        { status: 400 }
      );
    }

    if (input.status === 'REFUNDED') {
      return NextResponse.json(
        {
          error:
            "Cannot manually assign status 'REFUNDED'. A refund or credit-note workflow must record the financial event.",
        },
        { status: 400 }
      );
    }

    const hasFinancialModifications =
      input.items !== undefined ||
      input.discount !== undefined ||
      input.taxRate !== undefined;

    // Execute status updates, item amendments, and financial calculations inside a row-locked transaction
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      // Acquire exclusive row-level lock on invoice scoped strictly to active clinic
      const [lockedInvoice] = await tx.$queryRaw<
        Array<{
          id: string;
          clinic_id: string;
          status: InvoiceStatus;
          subtotal: Prisma.Decimal;
          discount: Prisma.Decimal;
          tax_rate: Prisma.Decimal | null;
          tax_amount: Prisma.Decimal;
          total_amount: Prisma.Decimal;
          paid_amount: Prisma.Decimal;
          issue_date: Date | null;
          due_date: Date | null;
          notes: string | null;
        }>
      >`
        SELECT
          id,
          clinic_id,
          status,
          subtotal,
          discount,
          tax_rate,
          tax_amount,
          total_amount,
          paid_amount,
          issue_date,
          due_date,
          notes
        FROM invoices
        WHERE id = ${invoiceId} AND clinic_id = ${context.clinic.id}
        FOR UPDATE
      `;

      if (!lockedInvoice) {
        throw new PatchRouteError('Invoice not found in active clinic', 404);
      }

      // Check status transition validity against current locked row
      if (input.status) {
        // Financial invariant: cannot void an invoice with recorded payments
        if (input.status === 'VOID') {
          const currentPaid = new Prisma.Decimal(lockedInvoice.paid_amount);
          const paymentCount = await tx.payment.count({
            where: {
              invoiceId: lockedInvoice.id,
              clinicId: context.clinic.id,
            },
          });

          if (currentPaid.greaterThan(0) || paymentCount > 0) {
            throw new PatchRouteError(
              'Cannot void invoice with recorded payments. Recorded payment history must be preserved.',
              400
            );
          }
        }

        if (!isValidInvoiceStatusTransition(lockedInvoice.status, input.status)) {
          throw new PatchRouteError(
            `Invalid invoice status transition from '${lockedInvoice.status}' to '${input.status}'`,
            400
          );
        }
      }

      // Line items / amounts cannot be modified if invoice is not in DRAFT status
      if (hasFinancialModifications && lockedInvoice.status !== 'DRAFT') {
        throw new PatchRouteError(
          'Cannot modify line items, discount, or tax of an issued, paid, or voided invoice. Financial records are locked.',
          400
        );
      }

      let totalsUpdate = {};

      if (hasFinancialModifications) {
        let itemsToUse: LineItemInput[];
        if (input.items) {
          itemsToUse = input.items;
        } else {
          const existingItems = await tx.invoiceItem.findMany({
            where: { invoiceId: lockedInvoice.id },
          });
          itemsToUse = existingItems.map((i) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            itemType: i.itemType,
          }));
        }

        const discountToUse =
          input.discount !== undefined ? input.discount : lockedInvoice.discount;
        const taxRateToUse =
          input.taxRate !== undefined ? input.taxRate : lockedInvoice.tax_rate;

        // Validate discount against subtotal before calculation to return clear HTTP 400
        const calculatedSubtotal = calculateSubtotal(itemsToUse);
        const requestedDiscount = toDecimal(discountToUse, 'discount');

        if (requestedDiscount.greaterThan(calculatedSubtotal)) {
          throw new PatchRouteError(
            `Invalid discount: Discount (${requestedDiscount.toFixed(2)}) cannot exceed subtotal (${calculatedSubtotal.toFixed(2)})`,
            400
          );
        }

        const totals = calculateInvoiceTotals({
          items: itemsToUse,
          discount: requestedDiscount,
          taxRate: taxRateToUse,
        });

        totalsUpdate = {
          subtotal: totals.subtotal,
          discount: totals.discount,
          taxRate: totals.taxRate,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
        };

        if (input.items) {
          await tx.invoiceItem.deleteMany({
            where: { invoiceId: lockedInvoice.id },
          });

          await tx.invoiceItem.createMany({
            data: input.items.map((item) => ({
              invoiceId: lockedInvoice.id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: toDecimal(item.unitPrice),
              lineTotal: calculateLineTotal(item.quantity, item.unitPrice),
              itemType: item.itemType,
            })),
          });
        }
      }

      const statusUpdate = input.status ? { status: input.status } : {};
      const issueDateUpdate =
        input.status === 'ISSUED' && !lockedInvoice.issue_date
          ? { issueDate: new Date() }
          : {};
      const dueDateUpdate =
        input.dueDate !== undefined
          ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
          : {};
      const notesUpdate = input.notes !== undefined ? { notes: input.notes } : {};

      return tx.invoice.update({
        where: { id: lockedInvoice.id },
        data: {
          ...statusUpdate,
          ...issueDateUpdate,
          ...dueDateUpdate,
          ...notesUpdate,
          ...totalsUpdate,
        },
        include: {
          items: true,
          patient: {
            select: {
              id: true,
              mrn: true,
              name: true,
              phone: true,
            },
          },
          payments: {
            orderBy: { receivedAt: 'desc' },
          },
        },
      });
    });

    const balance = calculateBalanceDue(updatedInvoice.totalAmount, updatedInvoice.paidAmount);

    return NextResponse.json({
      invoice: {
        ...updatedInvoice,
        balanceDue: balance.balanceDue,
        isFullyPaid: balance.isFullyPaid,
        isOverpaid: balance.isOverpaid,
      },
    });
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
    if (error instanceof PatchRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error in PATCH /api/billing/invoices/[invoiceId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
