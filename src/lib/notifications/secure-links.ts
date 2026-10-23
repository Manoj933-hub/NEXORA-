import crypto from 'crypto';

/**
 * Default validity period for secure public document links (7 days).
 */
export const DEFAULT_LINK_TTL_DAYS = 7;

export interface GeneratedSecureToken {
  /** High-entropy raw token returned to caller to form the URL (NEVER store this in DB) */
  rawToken: string;
  /** Cryptographic SHA-256 hash of the token to store in the database */
  tokenHash: string;
  /** Expiration timestamp */
  expiresAt: Date;
}

/**
 * Generates a 256-bit cryptographically secure random token and its SHA-256 hash.
 * The raw token must be shared exclusively via the outbound communication link,
 * while only the tokenHash is stored in the database.
 */
export function generateSecureDocumentToken(ttlDays = DEFAULT_LINK_TTL_DAYS): GeneratedSecureToken {
  // 32 bytes = 256 bits of entropy -> 64 hex characters
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSecureToken(rawToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  return {
    rawToken,
    tokenHash,
    expiresAt,
  };
}

/**
 * Computes the SHA-256 hash of a raw token for database lookup.
 */
export function hashSecureToken(rawToken: string): string {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new Error('Cannot hash empty or invalid token');
  }
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

/**
 * Verifies if a given timestamp is expired.
 */
export function isSecureLinkExpired(expiresAt: Date): boolean {
  return new Date() > new Date(expiresAt);
}

/**
 * Constructs the patient-facing public document URL.
 * Notice: URLs contain ONLY the token. Zero patient IDs, MRNs, or clinical details are included.
 */
export function buildPublicDocumentUrl(
  rawToken: string,
  baseUrl: string = process.env.NEXT_PUBLIC_APP_URL || 'https://nexora.health'
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `${cleanBase}/view/${encodeURIComponent(rawToken.trim())}`;
}

/**
 * Masks a token for audit logging so raw credentials are never exposed in log output.
 * Example: "a1b2c3d4e5f6..." -> "a1b2c3...[masked]"
 */
export function maskTokenForLogging(token: string | null | undefined): string {
  if (!token) return '[empty]';
  const trimmed = token.trim();
  if (trimmed.length <= 10) return '[masked]';
  return `${trimmed.slice(0, 6)}...[masked]`;
}

/**
 * Constructs a safe, redacted document URL for audit logging and UI display.
 * Never leaks the plaintext token.
 */
export function buildRedactedDocumentUrl(
  baseUrl: string = process.env.NEXT_PUBLIC_APP_URL || 'https://nexora.health'
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `${cleanBase}/view/[PROTECTED_DOCUMENT_TOKEN]`;
}

/**
 * Strips raw tokens from URLs or messages for safe persistence in audit logs.
 * Replaces any `/view/<hex-or-alphanumeric-token>` with `/view/[PROTECTED_DOCUMENT_TOKEN]`.
 */
export function redactTokensFromText(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\/view\/[a-zA-Z0-9_-]{16,}/g, '/view/[PROTECTED_DOCUMENT_TOKEN]');
}

