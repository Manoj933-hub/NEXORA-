import { describe, it, expect } from 'vitest';
import {
  generateSessionToken,
  hashSessionToken,
  SESSION_COOKIE_NAME,
  setSessionCookie,
  clearSessionCookie,
  extractSessionToken,
} from './session';
import { NextResponse } from 'next/server';

describe('Session Token & Cookie Management', () => {
  it('generates 64-character hex cryptographically secure tokens', () => {
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();

    expect(token1).toHaveLength(64);
    expect(token2).toHaveLength(64);
    expect(token1).not.toBe(token2);
    expect(/^[0-9a-f]{64}$/.test(token1)).toBe(true);
  });

  it('computes deterministic SHA-256 token hash', () => {
    const rawToken = '4f8b91c3e5a7d2b4f6e8a0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2';
    const hash1 = hashSessionToken(rawToken);
    const hash2 = hashSessionToken(rawToken);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash1).not.toBe(rawToken);
  });

  it('sets secure HttpOnly session cookie on response', () => {
    const response = NextResponse.json({ ok: true });
    const rawToken = generateSessionToken();

    setSessionCookie(response, rawToken);

    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBe(rawToken);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
    expect(cookie?.path).toBe('/');
  });

  it('clears session cookie with 0 maxAge and empty value', () => {
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);

    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBe('');
    expect(cookie?.maxAge).toBe(0);
  });

  it('extracts session token from Cookie header correctly', () => {
    const rawToken = 'test-session-token-12345';
    const request = new Request('http://localhost:3000/api/auth/me', {
      headers: {
        cookie: `unrelated=value; ${SESSION_COOKIE_NAME}=${rawToken}; other=true`,
      },
    });

    const extracted = extractSessionToken(request);
    expect(extracted).toBe(rawToken);
  });

  it('returns null when session cookie is absent', () => {
    const request = new Request('http://localhost:3000/api/auth/me', {
      headers: {
        cookie: 'unrelated=value; other=true',
      },
    });

    expect(extractSessionToken(request)).toBeNull();
  });
});
