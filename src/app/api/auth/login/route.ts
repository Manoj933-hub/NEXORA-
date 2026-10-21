import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { checkRateLimit, recordFailedAttempt, clearRateLimit, getClientIp } from '@/lib/auth/rate-limiter';
import { validateRequestOrigin } from '@/lib/auth/csrf';
import { LoginInputSchema } from '@/lib/validations/auth';

export async function POST(request: Request) {
  // CSRF / Origin verification
  const originCheck = validateRequestOrigin(request);
  if (!originCheck.valid) {
    return NextResponse.json(
      { error: originCheck.reason || 'Invalid request origin' },
      { status: 403 }
    );
  }

  const clientIp = getClientIp(request);
  const ipRateLimitKey = `login:ip:${clientIp}`;

  // Check IP-level rate limit (max 10 attempts in 15 mins)
  const ipLimit = await checkRateLimit(ipRateLimitKey, 10, 15);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts from this network. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((ipLimit.resetAt.getTime() - Date.now()) / 1000)),
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

  const parsed = LoginInputSchema.safeParse(body);
  if (!parsed.success) {
    await recordFailedAttempt(ipRateLimitKey, 15);
    return NextResponse.json(
      {
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;
  const emailRateLimitKey = `login:email:${email}`;

  // Check account-level rate limit (max 5 attempts in 15 mins)
  const accountLimit = await checkRateLimit(emailRateLimitKey, 5, 15);
  if (!accountLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many failed login attempts for this account. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((accountLimit.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        where: { isActive: true },
        include: { clinic: true },
      },
    },
  });

  // Generic credential rejection without distinguishing between missing user or bad password
  if (!user) {
    await recordFailedAttempt(ipRateLimitKey, 15);
    await recordFailedAttempt(emailRateLimitKey, 15);
    return NextResponse.json(
      { error: 'Invalid email address or password' },
      { status: 401 }
    );
  }

  if (!user.isActive) {
    await recordFailedAttempt(ipRateLimitKey, 15);
    return NextResponse.json(
      { error: 'Your account has been deactivated. Please contact support.' },
      { status: 403 }
    );
  }

  const isPasswordValid = await verifyPassword(password, user.passwordHash);
  if (!isPasswordValid) {
    await recordFailedAttempt(ipRateLimitKey, 15);
    await recordFailedAttempt(emailRateLimitKey, 15);
    return NextResponse.json(
      { error: 'Invalid email address or password' },
      { status: 401 }
    );
  }

  // Clear failed rate limit attempts upon successful authentication
  await clearRateLimit(ipRateLimitKey);
  await clearRateLimit(emailRateLimitKey);

  // Determine initial active clinic (first active clinic membership if any)
  const activeMembership = user.memberships[0] || null;
  const activeClinicId = activeMembership ? activeMembership.clinicId : null;

  const { rawToken } = await createSession(user.id, activeClinicId);

  const response = NextResponse.json(
    {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
      },
      activeClinic: activeMembership
        ? {
            id: activeMembership.clinic.id,
            name: activeMembership.clinic.name,
            slug: activeMembership.clinic.slug,
            role: activeMembership.role,
          }
        : null,
      clinics: user.memberships.map((m) => ({
        id: m.clinic.id,
        name: m.clinic.name,
        slug: m.clinic.slug,
        role: m.role,
      })),
    },
    { status: 200 }
  );

  setSessionCookie(response, rawToken);
  return response;
}
