import { NextResponse, connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, requireClinicAccess, AuthError } from '@/lib/auth/tenant';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import { CreatePatientInputSchema, PatientQuerySchema } from '@/lib/validations/patient';
import { generateClinicMRN } from '@/lib/patients/mrn';
import type { Permission } from '@/lib/auth/permissions';

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
    const parsedQuery = PatientQuerySchema.safeParse({
      query: url.searchParams.get('query') || undefined,
      page: url.searchParams.get('page') || undefined,
      limit: url.searchParams.get('limit') || undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsedQuery.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { query, page, limit } = parsedQuery.data;
    const skip = (page - 1) * limit;

    const whereClause: {
      clinicId: string;
      isActive: boolean;
      OR?: Array<{
        name?: { contains: string; mode: 'insensitive' };
        phone?: { contains: string; mode: 'insensitive' };
        mrn?: { contains: string; mode: 'insensitive' };
      }>;
    } = {
      clinicId: context.clinic.id,
      isActive: true,
    };

    if (query) {
      whereClause.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
        { mrn: { contains: query, mode: 'insensitive' } },
      ];
    }

    const [total, patients] = await Promise.all([
      prisma.patient.count({ where: whereClause }),
      prisma.patient.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          mrn: true,
          name: true,
          dateOfBirth: true,
          gender: true,
          phone: true,
          email: true,
          address: true,
          bloodGroup: true,
          emergencyContact: true,
          allergies: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      patients,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      clinicId: context.clinic.id,
    });
  } catch (error) {
    if (error instanceof Error && 'digest' in error && (error as { digest: string }).digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error listing patients:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const originCheck = validateRequestOrigin(request);
  if (!originCheck.valid) {
    return NextResponse.json(
      { error: originCheck.reason || 'Invalid request origin' },
      { status: 403 }
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = CreatePatientInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const context = await resolveTenantContext(request, {
      requiredPermission: 'patients:write',
    });

    const data = parsed.data;

    // Atomically generate unique MRN and create Patient
    const patient = await prisma.$transaction(async (tx) => {
      const mrn = await generateClinicMRN(tx, context.clinic.id);

      return tx.patient.create({
        data: {
          clinicId: context.clinic.id,
          mrn,
          name: data.name,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          gender: data.gender || null,
          phone: data.phone || null,
          email: data.email || null,
          address: data.address || null,
          emergencyContact: data.emergencyContact || null,
          bloodGroup: data.bloodGroup || null,
          allergies: data.allergies || null,
          notes: data.notes || null,
        },
      });
    });

    return NextResponse.json(
      {
        message: 'Patient profile registered successfully',
        patient: {
          id: patient.id,
          mrn: patient.mrn,
          name: patient.name,
          dateOfBirth: patient.dateOfBirth,
          gender: patient.gender,
          phone: patient.phone,
          email: patient.email,
          address: patient.address,
          bloodGroup: patient.bloodGroup,
          emergencyContact: patient.emergencyContact,
          allergies: patient.allergies,
          notes: patient.notes,
          createdAt: patient.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error creating patient:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
