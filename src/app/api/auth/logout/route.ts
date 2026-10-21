import { NextResponse } from 'next/server';
import { extractSessionToken, revokeSession, clearSessionCookie } from '@/lib/auth/session';
import { validateRequestOrigin } from '@/lib/auth/csrf';

export async function POST(request: Request) {
  // CSRF / Origin verification
  const originCheck = validateRequestOrigin(request);
  if (!originCheck.valid) {
    return NextResponse.json(
      { error: originCheck.reason || 'Invalid request origin' },
      { status: 403 }
    );
  }

  const rawToken = extractSessionToken(request);
  if (rawToken) {
    await revokeSession(rawToken);
  }

  const response = NextResponse.json(
    { success: true, message: 'Logged out successfully' },
    { status: 200 }
  );

  clearSessionCookie(response);
  return response;
}
