import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Session, User, Clinic } from '@prisma/client';

export const SESSION_COOKIE_NAME = 'nexora_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Generates a 256-bit cryptographically secure random opaque token (64 hex characters).
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes an opaque session token using SHA-256.
 * Only this hash is persisted to the database.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a new session in PostgreSQL with a SHA-256 token hash.
 * Returns the session record and the raw token to set in the HttpOnly cookie.
 */
export async function createSession(
  userId: string,
  activeClinicId?: string | null
): Promise<{ session: Session; rawToken: string }> {
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash,
      activeClinicId: activeClinicId ?? null,
      expiresAt,
    },
  });

  return { session, rawToken };
}

/**
 * Validates a raw token from the cookie against PostgreSQL.
 * If expired, revokes the session and returns null.
 */
export async function getSessionByToken(rawToken: string): Promise<{
  session: Session;
  user: User;
  activeClinic: Clinic | null;
} | null> {
  if (!rawToken || typeof rawToken !== 'string') {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: true,
      activeClinic: true,
    },
  });

  if (!session) {
    return null;
  }

  // Revoke expired session immediately
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Block inactive users
  if (!session.user.isActive) {
    return null;
  }

  return {
    session,
    user: session.user,
    activeClinic: session.activeClinic,
  };
}

/**
 * Revokes a session by deleting it from PostgreSQL.
 */
export async function revokeSession(rawToken: string): Promise<void> {
  if (!rawToken) return;
  const tokenHash = hashSessionToken(rawToken);
  await prisma.session.deleteMany({
    where: { tokenHash },
  });
}

/**
 * Sets the HttpOnly session cookie on a NextResponse.
 */
export function setSessionCookie(response: NextResponse, rawToken: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: rawToken,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Clears the session cookie on a NextResponse.
 */
export function clearSessionCookie(response: NextResponse): void {
  const isProduction = process.env.NODE_ENV === 'production';
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
}

/**
 * Extracts the raw session token from request cookies.
 */
export function extractSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return decodeURIComponent(cookie.substring(SESSION_COOKIE_NAME.length + 1));
    }
  }

  return null;
}
