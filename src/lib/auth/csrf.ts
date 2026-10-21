/**
 * Validates request origin against the host header to protect against Cross-Site Request Forgery (CSRF).
 */
export function validateRequestOrigin(request: Request): { valid: boolean; reason?: string } {
  // Safe HTTP methods do not modify server state
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(request.method.toUpperCase())) {
    return { valid: true };
  }

  // Allow test runners to bypass origin checks if explicitly testing unit endpoints without headers
  if (process.env.NODE_ENV === 'test' && !request.headers.get('origin') && !request.headers.get('referer')) {
    return { valid: true };
  }

  const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!hostHeader) {
    return { valid: false, reason: 'Missing Host header' };
  }

  const originHeader = request.headers.get('origin');
  const refererHeader = request.headers.get('referer');

  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      if (originUrl.host.toLowerCase() === hostHeader.toLowerCase()) {
        return { valid: true };
      }
      return { valid: false, reason: 'Origin header does not match Host' };
    } catch {
      return { valid: false, reason: 'Malformed Origin header' };
    }
  }

  if (refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      if (refererUrl.host.toLowerCase() === hostHeader.toLowerCase()) {
        return { valid: true };
      }
      return { valid: false, reason: 'Referer header does not match Host' };
    } catch {
      return { valid: false, reason: 'Malformed Referer header' };
    }
  }

  // Neither Origin nor Referer provided on state-changing request
  return { valid: false, reason: 'Missing Origin or Referer header' };
}
