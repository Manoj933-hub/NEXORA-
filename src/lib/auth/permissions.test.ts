import { describe, it, expect } from 'vitest';
import { hasPermission, isRoleAtLeast, ClinicRole } from './permissions';

describe('Permissions Matrix & Role Hierarchy', () => {
  it('OWNER role holds all clinical and administrative permissions', () => {
    expect(hasPermission(ClinicRole.OWNER, 'clinic:delete')).toBe(true);
    expect(hasPermission(ClinicRole.OWNER, 'clinic:update')).toBe(true);
    expect(hasPermission(ClinicRole.OWNER, 'members:manage')).toBe(true);
    expect(hasPermission(ClinicRole.OWNER, 'patients:read')).toBe(true);
    expect(hasPermission(ClinicRole.OWNER, 'patients:write')).toBe(true);
    expect(hasPermission(ClinicRole.OWNER, 'clinical:records:write')).toBe(true);
  });

  it('ADMIN role can manage members and update clinic but cannot delete clinic', () => {
    expect(hasPermission(ClinicRole.ADMIN, 'clinic:delete')).toBe(false);
    expect(hasPermission(ClinicRole.ADMIN, 'clinic:update')).toBe(true);
    expect(hasPermission(ClinicRole.ADMIN, 'members:manage')).toBe(true);
    expect(hasPermission(ClinicRole.ADMIN, 'patients:read')).toBe(true);
    expect(hasPermission(ClinicRole.ADMIN, 'patients:write')).toBe(true);
    expect(hasPermission(ClinicRole.ADMIN, 'clinical:records:write')).toBe(true);
  });

  it('DOCTOR role can read/write clinical records but cannot manage clinic settings', () => {
    expect(hasPermission(ClinicRole.DOCTOR, 'clinical:records:read')).toBe(true);
    expect(hasPermission(ClinicRole.DOCTOR, 'clinical:records:write')).toBe(true);
    expect(hasPermission(ClinicRole.DOCTOR, 'patients:read')).toBe(true);
    expect(hasPermission(ClinicRole.DOCTOR, 'patients:write')).toBe(true);
    expect(hasPermission(ClinicRole.DOCTOR, 'clinic:update')).toBe(false);
    expect(hasPermission(ClinicRole.DOCTOR, 'clinic:delete')).toBe(false);
    expect(hasPermission(ClinicRole.DOCTOR, 'members:manage')).toBe(false);
  });

  it('RECEPTIONIST role can manage appointments and queue but cannot write clinical records', () => {
    expect(hasPermission(ClinicRole.RECEPTIONIST, 'reception:appointments:manage')).toBe(true);
    expect(hasPermission(ClinicRole.RECEPTIONIST, 'reception:queue:manage')).toBe(true);
    expect(hasPermission(ClinicRole.RECEPTIONIST, 'patients:read')).toBe(true);
    expect(hasPermission(ClinicRole.RECEPTIONIST, 'patients:write')).toBe(true);
    expect(hasPermission(ClinicRole.RECEPTIONIST, 'clinical:records:write')).toBe(false);
    expect(hasPermission(ClinicRole.RECEPTIONIST, 'members:manage')).toBe(false);
  });

  it('STAFF role has restricted read-only access', () => {
    expect(hasPermission(ClinicRole.STAFF, 'clinic:read')).toBe(true);
    expect(hasPermission(ClinicRole.STAFF, 'members:read')).toBe(true);
    expect(hasPermission(ClinicRole.STAFF, 'patients:read')).toBe(false);
    expect(hasPermission(ClinicRole.STAFF, 'patients:write')).toBe(false);
    expect(hasPermission(ClinicRole.STAFF, 'clinical:records:write')).toBe(false);
    expect(hasPermission(ClinicRole.STAFF, 'clinic:update')).toBe(false);
    expect(hasPermission(ClinicRole.STAFF, 'members:manage')).toBe(false);
  });

  it('validates role hierarchy ordering correctly', () => {
    expect(isRoleAtLeast(ClinicRole.OWNER, ClinicRole.ADMIN)).toBe(true);
    expect(isRoleAtLeast(ClinicRole.ADMIN, ClinicRole.DOCTOR)).toBe(true);
    expect(isRoleAtLeast(ClinicRole.DOCTOR, ClinicRole.RECEPTIONIST)).toBe(true);
    expect(isRoleAtLeast(ClinicRole.RECEPTIONIST, ClinicRole.STAFF)).toBe(true);
    expect(isRoleAtLeast(ClinicRole.STAFF, ClinicRole.ADMIN)).toBe(false);
    expect(isRoleAtLeast(ClinicRole.DOCTOR, ClinicRole.OWNER)).toBe(false);
  });
});
