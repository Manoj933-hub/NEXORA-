import { NextResponse, connection } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth/tenant';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import { CreateClinicInputSchema } from '@/lib/validations/clinic';
import { ClinicRole } from '@/lib/auth/permissions';

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 40);
  const randomSuffix = crypto.randomBytes(3).toString('hex');
  return `${base || 'clinic'}-${randomSuffix}`;
}

export async function GET(request: Request) {
  try {
    await connection();
  } catch {
    // Outside Next.js server context (e.g. unit tests)
  }

  try {
    const { user } = await requireAuth(request);

    const memberships = await prisma.membership.findMany({
      where: {
        userId: user.id,
        isActive: true,
        clinic: {
          isActive: true,
        },
      },
      include: {
        clinic: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const clinics = memberships.map((m) => ({
      id: m.clinic.id,
      name: m.clinic.name,
      slug: m.clinic.slug,
      country: m.clinic.country,
      currency: m.clinic.currency,
      phone: m.clinic.phone,
      address: m.clinic.address,
      role: m.role,
      joinedAt: m.createdAt,
    }));

    return NextResponse.json({ clinics }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && 'digest' in error && (error as { digest: string }).digest === 'NEXT_PRERENDER_INTERRUPTED') {
      throw error;
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching clinics:', error);
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
    const { user, session } = await requireAuth(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = CreateClinicInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { name, country, currency, phone, address } = parsed.data;
    const slug = generateSlug(name);

    // Atomic creation of Clinic, OWNER membership, and activeClinicId session update
    const result = await prisma.$transaction(async (tx) => {
      const newClinic = await tx.clinic.create({
        data: {
          name,
          slug,
          country,
          currency,
          phone: phone || null,
          address: address || null,
        },
      });

      const newMembership = await tx.membership.create({
        data: {
          userId: user.id,
          clinicId: newClinic.id,
          role: ClinicRole.OWNER,
        },
      });

      // Update current session's active clinic
      await tx.session.update({
        where: { id: session.id },
        data: { activeClinicId: newClinic.id },
      });

      return { clinic: newClinic, membership: newMembership };
    });

    return NextResponse.json(
      {
        message: 'Clinic created successfully',
        clinic: {
          id: result.clinic.id,
          name: result.clinic.name,
          slug: result.clinic.slug,
          country: result.clinic.country,
          currency: result.clinic.currency,
          phone: result.clinic.phone,
          address: result.clinic.address,
          role: result.membership.role,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error creating clinic:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
