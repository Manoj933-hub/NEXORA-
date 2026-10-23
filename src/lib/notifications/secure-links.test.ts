import { describe, it, expect } from 'vitest';
import {
  generateSecureDocumentToken,
  hashSecureToken,
  isSecureLinkExpired,
  buildPublicDocumentUrl,
  buildRedactedDocumentUrl,
  redactTokensFromText,
  maskTokenForLogging,
  DEFAULT_LINK_TTL_DAYS,
} from './secure-links';

describe('Secure Document Links Suite', () => {
  it('generates a 64-character hex token (256-bit entropy) with valid SHA-256 hash', () => {
    const tokenData = generateSecureDocumentToken();

    expect(tokenData.rawToken).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(tokenData.rawToken)).toBe(true);

    expect(tokenData.tokenHash).toHaveLength(64);
    expect(tokenData.tokenHash).toBe(hashSecureToken(tokenData.rawToken));

    // Ensure default expiration is approximately 7 days in the future
    const expectedExpiry = new Date();
    expectedExpiry.setDate(expectedExpiry.getDate() + DEFAULT_LINK_TTL_DAYS);
    const diffMs = Math.abs(tokenData.expiresAt.getTime() - expectedExpiry.getTime());
    expect(diffMs).toBeLessThan(5000); // within 5 seconds
  });

  it('generates unique tokens on subsequent calls', () => {
    const token1 = generateSecureDocumentToken();
    const token2 = generateSecureDocumentToken();

    expect(token1.rawToken).not.toBe(token2.rawToken);
    expect(token1.tokenHash).not.toBe(token2.tokenHash);
  });

  it('produces deterministic SHA-256 hashes for identical inputs', () => {
    const testToken = 'abc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const hash1 = hashSecureToken(testToken);
    const hash2 = hashSecureToken(testToken);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('correctly identifies expired timestamps', () => {
    const past = new Date(Date.now() - 1000 * 60); // 1 minute ago
    const future = new Date(Date.now() + 1000 * 60 * 60); // 1 hour ahead

    expect(isSecureLinkExpired(past)).toBe(true);
    expect(isSecureLinkExpired(future)).toBe(false);
  });

  it('constructs public URLs without leaking any clinical or demographic data', () => {
    const testToken = '4f8e2190b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8';
    const url = buildPublicDocumentUrl(testToken, 'https://nexora.health');

    expect(url).toBe(`https://nexora.health/view/${testToken}`);
    // Explicitly verify no medical terms or query params are attached
    expect(url).not.toContain('patient');
    expect(url).not.toContain('prescription');
    expect(url).not.toContain('invoice');
    expect(url).not.toContain('?');
  });

  it('masks tokens for safe logging', () => {
    const testToken = '4f8e2190b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8';
    const masked = maskTokenForLogging(testToken);

    expect(masked).toBe('4f8e21...[masked]');
    expect(masked).not.toContain(testToken.slice(6));
  });

  it('handles empty or malformed token inputs gracefully', () => {
    expect(() => hashSecureToken('')).toThrow();
    expect(maskTokenForLogging('')).toBe('[empty]');
    expect(maskTokenForLogging(null)).toBe('[empty]');
  });

  it('builds redacted document URLs without exposing real tokens', () => {
    const redacted = buildRedactedDocumentUrl('https://nexora.health');
    expect(redacted).toBe('https://nexora.health/view/[PROTECTED_DOCUMENT_TOKEN]');
    expect(redacted).not.toMatch(/[a-f0-9]{32,64}/);
  });

  it('redacts raw tokens from message strings for secure audit logging', () => {
    const rawToken = '4f8e2190b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8';
    const message = `Your prescription is ready. View at https://nexora.health/view/${rawToken} today.`;
    const redacted = redactTokensFromText(message);

    expect(redacted).not.toContain(rawToken);
    expect(redacted).toContain('https://nexora.health/view/[PROTECTED_DOCUMENT_TOKEN]');
    expect(redacted).toBe(
      'Your prescription is ready. View at https://nexora.health/view/[PROTECTED_DOCUMENT_TOKEN] today.'
    );
  });
});

