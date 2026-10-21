import { describe, it, expect } from 'vitest';
import { validateRequestOrigin } from './csrf';

describe('CSRF & Request Origin Protection', () => {
  it('allows safe GET requests unconditionally', () => {
    const req = new Request('http://localhost:3000/api/clinics/123', {
      method: 'GET',
    });
    expect(validateRequestOrigin(req).valid).toBe(true);
  });

  it('accepts POST requests when Origin matches Host', () => {
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      },
    });
    expect(validateRequestOrigin(req).valid).toBe(true);
  });

  it('rejects POST requests when Origin does not match Host', () => {
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://malicious-attacker.com',
      },
    });
    const result = validateRequestOrigin(req);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('does not match Host');
  });

  it('accepts POST requests when Referer matches Host', () => {
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        referer: 'http://localhost:3000/login',
      },
    });
    expect(validateRequestOrigin(req).valid).toBe(true);
  });

  it('rejects POST requests with mismatched Referer', () => {
    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        referer: 'http://phishing-site.org/attack',
      },
    });
    expect(validateRequestOrigin(req).valid).toBe(false);
  });
});
