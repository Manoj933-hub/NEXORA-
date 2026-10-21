import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { checkRateLimit, recordFailedAttempt, getClientIp } from '@/lib/auth/rate-limiter';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import { RegisterInputSchema } from '@/lib/validations/auth';
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

export async function POST(request: Request) {
  // CSRF / Origin verification
  const originCheck = validateRequestOrigin(request);
  if (!originCheck.valid) {
    return NextResponse.json(
      { error: originCheck.reason || 'Invalid request origin' },
      { status: 403 }
    );
  }

  // Rate limiting by client IP
  const clientIp = getClientIp(request);
  const rateLimitKey = `register:ip:${clientIp}`;
  const rateLimit = await checkRateLimit(rateLimitKey, 10, 15);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many registration requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const parsed = RegisterInputSchema.safeParse(body);
  if (!parsed.success) {
    await recordFailedAttempt(rateLimitKey, 15);
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { email, password, name, phone, clinicName, country, currency } = parsed.data;

  // Check if email already registered
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    await recordFailedAttempt(rateLimitKey, 15);
    // Generic friendly error without leaking existing accounts
    return NextResponse.json(
      { error: 'An account with this email address already exists.' },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);
  const slug = generateSlug(clinicName);

  try {
    // Atomic creation of User, Clinic, and OWNER Membership
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
          phone: phone || null,
        },
      });

      const newClinic = await tx.clinic.create({
        data: {
          name: clinicName,
          slug,
          country,
          currency,
          phone: phone || null,
        },
      });

      const newMembership = await tx.membership.create({
        data: {
          userId: newUser.id,
          clinicId: newClinic.id,
          role: ClinicRole.OWNER,
        },
      });

      return { user: newUser, clinic: newClinic, membership: newMembership };
    });

    // Create session backed by PostgreSQL
    const { rawToken } = await createSession(result.user.id, result.clinic.id);

    const response = NextResponse.json(
      {
        message: 'Registration successful',
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          phone: result.user.phone,
        },
        clinic: {
          id: result.clinic.id,
          name: result.clinic.name,
          slug: result.clinic.slug,
          country: result.clinic.country,
          currency: result.clinic.currency,
          role: result.membership.role,
        },
      },
      { status: 201 }
    );

    setSessionCookie(response, rawToken);
    return response;
  } catch (error) {
    // Never expose stack trace or database errors
    console.error('Registration failed:', error);
    return NextResponse.json(
      { error: 'Registration failed due to a server error. Please try again.' },
      { status: 500 }
    );
  }
}
