import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireClinicAccess, AuthError } from '@/lib/auth/tenant';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import type { Permission } from '@/lib/auth/permissions';
import { Prisma } from '@prisma/client';
import {
  CreateInvoiceInputSchema,
  InvoiceQuerySchema,
} from '@/lib/validations/billing';
import {
  calculateInvoiceTotals,
  calculateLineTotal,
  calculateSubtotal,
  toDecimal,
} from '@/lib/billing/invoice-calculator';
import { allocateNextInvoiceNumber } from '@/lib/billing/invoice-number';

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

export async function GET(request: Request) {
  try {
    await connection();
  } catch {
    // Outside Next.js runtime context (e.g. tests)
  }

  try {
    const context = await resolveTenantContext(request, {
      requiredPermission: 'patients:read',
    });

    const url = new URL(request.url);
    const parsedQuery = InvoiceQuerySchema.safeParse({
      patientId: url.searchParams.get('patientId') || undefined,
      status: url.searchParams.get('status') || undefined,
      year: url.searchParams.get('year') || undefined,
      page: url.searchParams.get('page') || undefined,
      limit: url.searchParams.get('limit') || undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsedQuery.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { patientId, status, year, page, limit } = parsedQuery.data;
    const skip = (page - 1) * limit;

    const whereClause: Prisma.InvoiceWhereInput = {
      clinicId: context.clinic.id,
    };

    if (patientId) {
      const patient = await prisma.patient.findFirst({
        where: { id: patientId, clinicId: context.clinic.id },
      });
      if (!patient) {
        return NextResponse.json(
          { error: 'Patient not found in active clinic' },
          { status: 404 }
        );
      }
      whereClause.patientId = patientId;
    }

    if (status) {
      whereClause.status = status;
    }

    if (year) {
      whereClause.year = year;
    }

    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where: whereClause }),
      prisma.invoice.findMany({
        where: whereClause,
        include: {
          patient: {
            select: {
              id: true,
              mrn: true,
              name: true,
              phone: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          items: true,
          payments: {
            select: {
              id: true,
              amount: true,
              method: true,
              receivedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
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
    console.error('Error in GET /api/billing/invoices:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
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
    const context = await resolveTenantContext(request, {
      requiredPermission: 'patients:write',
    });

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = CreateInvoiceInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // Verify patient belongs to this clinic
    const patient = await prisma.patient.findFirst({
      where: {
        id: input.patientId,
        clinicId: context.clinic.id,
      },
    });

    if (!patient) {
      return NextResponse.json(
        { error: 'Patient not found in active clinic' },
        { status: 404 }
      );
    }

    // Verify appointment if provided
    let appointment = null;
    if (input.appointmentId) {
      appointment = await prisma.appointment.findFirst({
        where: {
          id: input.appointmentId,
          clinicId: context.clinic.id,
        },
      });

      if (!appointment) {
        return NextResponse.json(
          { error: 'Appointment not found in active clinic' },
          { status: 404 }
        );
      }

      if (appointment.patientId !== patient.id) {
        return NextResponse.json(
          { error: 'Appointment does not belong to the specified patient' },
          { status: 400 }
        );
      }
    }

    // Verify consultation if provided
    let consultation = null;
    if (input.consultationId) {
      consultation = await prisma.consultation.findFirst({
        where: {
          id: input.consultationId,
          clinicId: context.clinic.id,
        },
      });

      if (!consultation) {
        return NextResponse.json(
          { error: 'Consultation not found in active clinic' },
          { status: 404 }
        );
      }

      if (consultation.patientId !== patient.id) {
        return NextResponse.json(
          { error: 'Consultation does not belong to the specified patient' },
          { status: 400 }
        );
      }
    }

    // Currency verification: clinic currency always rules
    if (input.currency && input.currency !== context.clinic.currency) {
      return NextResponse.json(
        {
          error: `Currency mismatch: Active clinic operates in ${context.clinic.currency}, but received ${input.currency}`,
        },
        { status: 400 }
      );
    }

    // Validate discount against subtotal prior to calculation to return clear HTTP 400
    const calculatedSubtotal = calculateSubtotal(input.items);
    const requestedDiscount = toDecimal(input.discount ?? '0.00', 'discount');
    if (requestedDiscount.greaterThan(calculatedSubtotal)) {
      return NextResponse.json(
        {
          error: `Invalid discount: Discount (${requestedDiscount.toFixed(2)}) cannot exceed subtotal (${calculatedSubtotal.toFixed(2)})`,
        },
        { status: 400 }
      );
    }

    // Derive issue date and year explicitly for deterministic numbering
    // A draft created without an explicitly supplied issue date must have issueDate: null
    const issueDate = input.issueDate ? new Date(input.issueDate) : null;
    const year = issueDate ? issueDate.getUTCFullYear() : new Date().getUTCFullYear();

    // Exact monetary calculation on server
    const totals = calculateInvoiceTotals({
      items: input.items,
      discount: requestedDiscount,
      taxRate: input.taxRate,
    });

    // Execute sequence allocation and invoice creation atomically in one database transaction
    const invoice = await prisma.$transaction(async (tx) => {
      const allocation = await allocateNextInvoiceNumber(tx, context.clinic.id, year);

      return tx.invoice.create({
        data: {
          clinicId: context.clinic.id,
          patientId: patient.id,
          appointmentId: appointment?.id ?? null,
          consultationId: consultation?.id ?? null,
          createdById: context.user.id,
          invoiceNumber: allocation.invoiceNumber,
          year,
          currency: context.clinic.currency,
          status: 'DRAFT',
          subtotal: totals.subtotal,
          discount: totals.discount,
          taxRate: totals.taxRate,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          paidAmount: new Prisma.Decimal('0.00'),
          issueDate,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          notes: input.notes ?? null,
          taxLabel: context.clinic.taxLabel ?? null,
          taxNumber: context.clinic.taxNumber ?? null,
          items: {
            create: input.items.map((item) => {
              const lineTotal = calculateLineTotal(item.quantity, item.unitPrice);
              return {
                description: item.description,
                quantity: item.quantity,
                unitPrice: toDecimal(item.unitPrice),
                lineTotal,
                itemType: item.itemType,
              };
            }),
          },
        },
        include: {
          items: true,
          patient: {
            select: {
              id: true,
              mrn: true,
              name: true,
              phone: true,
              email: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    });

    return NextResponse.json({ invoice }, { status: 201 });
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
    console.error('Error in POST /api/billing/invoices:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
