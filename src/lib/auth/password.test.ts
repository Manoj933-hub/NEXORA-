import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('Password Utility', () => {
  it('hashes passwords with bcrypt salt rounds', async () => {
    const raw = 'SecurePass123!';
    const hash = await hashPassword(raw);

    expect(hash).not.toBe(raw);
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('verifies correct password against hash', async () => {
    const raw = 'KathmanduClinic2026!';
    const hash = await hashPassword(raw);

    const isValid = await verifyPassword(raw, hash);
    expect(isValid).toBe(true);
  });

  it('rejects incorrect password against hash', async () => {
    const raw = 'KathmanduClinic2026!';
    const hash = await hashPassword(raw);

    const isValid = await verifyPassword('WrongPassword999', hash);
    expect(isValid).toBe(false);
  });

  it('handles empty inputs safely without throwing', async () => {
    expect(await verifyPassword('', '')).toBe(false);
    expect(await verifyPassword('password', '')).toBe(false);
  });
});
