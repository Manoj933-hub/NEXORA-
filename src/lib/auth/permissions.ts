import { ClinicRole } from '@prisma/client';

export { ClinicRole };

export type Permission =
  | 'clinic:read'
  | 'clinic:update'
  | 'clinic:delete'
  | 'members:read'
  | 'members:manage'
  | 'patients:read'
  | 'patients:write'
  | 'clinical:records:read'
  | 'clinical:records:write'
  | 'reception:appointments:manage'
  | 'reception:queue:manage';

export const ROLE_PERMISSIONS: Record<ClinicRole, readonly Permission[]> = {
  OWNER: [
    'clinic:read',
    'clinic:update',
    'clinic:delete',
    'members:read',
    'members:manage',
    'patients:read',
    'patients:write',
    'clinical:records:read',
    'clinical:records:write',
    'reception:appointments:manage',
    'reception:queue:manage',
  ],
  ADMIN: [
    'clinic:read',
    'clinic:update',
    'members:read',
    'members:manage',
    'patients:read',
    'patients:write',
    'clinical:records:read',
    'clinical:records:write',
    'reception:appointments:manage',
    'reception:queue:manage',
  ],
  DOCTOR: [
    'clinic:read',
    'members:read',
    'patients:read',
    'patients:write',
    'clinical:records:read',
    'clinical:records:write',
    'reception:appointments:manage',
    'reception:queue:manage',
  ],
  RECEPTIONIST: [
    'clinic:read',
    'members:read',
    'patients:read',
    'patients:write',
    'reception:appointments:manage',
    'reception:queue:manage',
  ],
  STAFF: [
    'clinic:read',
    'members:read',
  ],
};

const ROLE_HIERARCHY: Record<ClinicRole, number> = {
  OWNER: 50,
  ADMIN: 40,
  DOCTOR: 30,
  RECEPTIONIST: 20,
  STAFF: 10,
};

/**
 * Checks whether a given role holds a specific permission.
 */
export function hasPermission(role: ClinicRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return Boolean(permissions && permissions.includes(permission));
}

/**
 * Checks if a user's role is hierarchically equal or superior to a target role.
 */
export function isRoleAtLeast(currentRole: ClinicRole, targetRole: ClinicRole): boolean {
  return ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY[targetRole];
}
