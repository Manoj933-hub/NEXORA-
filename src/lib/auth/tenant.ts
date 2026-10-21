import { prisma } from '@/lib/prisma';
import { extractSessionToken, getSessionByToken } from './session';
import { hasPermission, isRoleAtLeast, type ClinicRole, type Permission } from './permissions';
import type { User, Clinic, Membership, Session } from '@prisma/client';

export type SafeUser = Omit<User, 'passwordHash'>;

export interface TenantContext {
  user: SafeUser;
  session: Session;
  clinic: Clinic;
  membership: Membership;
  role: ClinicRole;
}

export class AuthError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

/**
 * Strips passwordHash and sensitive fields from user model.
 */
export function sanitizeUser(user: User): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

/**
 * Requires a valid, unexpired session for the request.
 * Throws AuthError (401) if unauthenticated.
 */
export async function requireAuth(request: Request): Promise<{
  user: SafeUser;
  session: Session;
  activeClinic: Clinic | null;
}> {
  const rawToken = extractSessionToken(request);
  if (!rawToken) {
    throw new AuthError('Authentication required', 401);
  }

  const sessionData = await getSessionByToken(rawToken);
  if (!sessionData) {
    throw new AuthError('Invalid or expired session', 401);
  }

  return {
    user: sanitizeUser(sessionData.user),
    session: sessionData.session,
    activeClinic: sessionData.activeClinic,
  };
}

/**
 * Enforces strict clinic tenant isolation and role/permission authorization.
 * Rejects cross-clinic access with HTTP 403 Forbidden.
 */
export async function requireClinicAccess(
  request: Request,
  clinicId: string,
  options?: {
    requiredRole?: ClinicRole;
    requiredPermission?: Permission;
  }
): Promise<TenantContext> {
  const { user, session } = await requireAuth(request);

  if (!clinicId || typeof clinicId !== 'string') {
    throw new AuthError('Clinic ID is required', 400);
  }

  // Look up membership and clinic
  const membership = await prisma.membership.findUnique({
    where: {
      userId_clinicId: {
        userId: user.id,
        clinicId,
      },
    },
    include: {
      clinic: true,
    },
  });

  // Cross-clinic tenant defense: no active membership found for this user in this clinic
  if (!membership || !membership.isActive) {
    throw new AuthError('Access denied: You are not an active member of this clinic organization', 403);
  }

  // Clinic tenant must be active
  if (!membership.clinic.isActive) {
    throw new AuthError('Access denied: Clinic organization is inactive', 403);
  }

  // Explicit role enforcement
  if (options?.requiredRole) {
    if (!isRoleAtLeast(membership.role, options.requiredRole)) {
      throw new AuthError(
        `Insufficient permissions: Role ${membership.role} is lower than required role '${options.requiredRole}'`,
        403
      );
    }
  }

  // Explicit permission enforcement
  if (options?.requiredPermission) {
    if (!hasPermission(membership.role, options.requiredPermission)) {
      throw new AuthError(
        `Insufficient permissions: Role ${membership.role} does not have '${options.requiredPermission}'`,
        403
      );
    }
  }

  return {
    user,
    session,
    clinic: membership.clinic,
    membership,
    role: membership.role,
  };
}
