import { describe, it, expect } from 'vitest';
import {
  PrescriptionStatus,
  PRESCRIPTION_STATUS_CONFIGS,
  getPrescriptionStatusConfig,
  canTransitionTo,
  getAllowedTransitions,
  isTerminalPrescriptionStatus,
  buildPrescriptionPatchPayload,
  parsePrescriptionApiError,
} from './prescription-lifecycle';

describe('Prescription Lifecycle Utilities', () => {
  describe('Status Configurations and Display Labels', () => {
    it('defines distinct labels and accessible styling for all four statuses', () => {
      const statuses: PrescriptionStatus[] = [
        'ACTIVE',
        'COMPLETED',
        'DISCONTINUED',
        'CANCELLED',
      ];

      for (const status of statuses) {
        const config = PRESCRIPTION_STATUS_CONFIGS[status];
        expect(config).toBeDefined();
        expect(typeof config.label).toBe('string');
        expect(config.label.length).toBeGreaterThan(0);
        expect(typeof config.description).toBe('string');
        expect(config.badgeClasses.bg).toBeDefined();
        expect(config.badgeClasses.text).toBeDefined();
        expect(config.badgeClasses.border).toBeDefined();
        expect(config.badgeClasses.dot).toBeDefined();
      }

      expect(PRESCRIPTION_STATUS_CONFIGS.ACTIVE.label).toBe('Active');
      expect(PRESCRIPTION_STATUS_CONFIGS.COMPLETED.label).toBe('Completed');
      expect(PRESCRIPTION_STATUS_CONFIGS.DISCONTINUED.label).toBe('Discontinued');
      expect(PRESCRIPTION_STATUS_CONFIGS.CANCELLED.label).toBe('Cancelled');
    });

    it('returns valid config for known statuses via getPrescriptionStatusConfig', () => {
      const activeConfig = getPrescriptionStatusConfig(PrescriptionStatus.ACTIVE);
      expect(activeConfig.label).toBe('Active');
      expect(activeConfig.badgeClasses.dot).toContain('emerald');

      const cancelledConfig = getPrescriptionStatusConfig('CANCELLED');
      expect(cancelledConfig.label).toBe('Cancelled');
      expect(cancelledConfig.badgeClasses.dot).toContain('rose');
    });

    it('provides safe fallback config for unknown or malformed status strings', () => {
      const fallbackConfig = getPrescriptionStatusConfig('UNKNOWN_STATUS');
      expect(fallbackConfig.label).toBe('UNKNOWN_STATUS');
      expect(fallbackConfig.badgeClasses.bg).toContain('slate');
    });
  });

  describe('Status Transitions & Terminal State Machine', () => {
    it('permits valid transitions from ACTIVE to COMPLETED, DISCONTINUED, and CANCELLED', () => {
      expect(canTransitionTo('ACTIVE', 'COMPLETED')).toBe(true);
      expect(canTransitionTo('ACTIVE', 'DISCONTINUED')).toBe(true);
      expect(canTransitionTo('ACTIVE', 'CANCELLED')).toBe(true);

      const allowedFromActive = getAllowedTransitions('ACTIVE');
      expect(allowedFromActive).toEqual(['COMPLETED', 'DISCONTINUED', 'CANCELLED']);
      expect(isTerminalPrescriptionStatus('ACTIVE')).toBe(false);
    });

    it('permits same-status transitions to allow notes updates on ACTIVE prescriptions', () => {
      expect(canTransitionTo('ACTIVE', 'ACTIVE')).toBe(true);
      expect(canTransitionTo('COMPLETED', 'COMPLETED')).toBe(true);
      expect(canTransitionTo('DISCONTINUED', 'DISCONTINUED')).toBe(true);
      expect(canTransitionTo('CANCELLED', 'CANCELLED')).toBe(true);
    });

    it('strictly rejects transitions out of terminal statuses (COMPLETED, DISCONTINUED, CANCELLED)', () => {
      const terminalStatuses: PrescriptionStatus[] = [
        'COMPLETED',
        'DISCONTINUED',
        'CANCELLED',
      ];

      for (const terminal of terminalStatuses) {
        expect(isTerminalPrescriptionStatus(terminal)).toBe(true);
        expect(getAllowedTransitions(terminal)).toEqual([]);

        // Cannot revert to ACTIVE
        expect(canTransitionTo(terminal, 'ACTIVE')).toBe(false);

        // Cannot cross-transition between terminal states
        if (terminal !== 'COMPLETED') expect(canTransitionTo(terminal, 'COMPLETED')).toBe(false);
        if (terminal !== 'DISCONTINUED') expect(canTransitionTo(terminal, 'DISCONTINUED')).toBe(false);
        if (terminal !== 'CANCELLED') expect(canTransitionTo(terminal, 'CANCELLED')).toBe(false);
      }
    });
  });

  describe('buildPrescriptionPatchPayload', () => {
    it('builds payload with status and valid expectedVersion', () => {
      const payload = buildPrescriptionPatchPayload({
        status: 'COMPLETED',
        expectedVersion: 2,
        notes: 'Course completed successfully',
      });

      expect(payload).toEqual({
        status: 'COMPLETED',
        expectedVersion: 2,
        notes: 'Course completed successfully',
      });
    });

    it('omits expectedVersion when undefined or null', () => {
      const payloadUndef = buildPrescriptionPatchPayload({
        status: 'DISCONTINUED',
      });
      expect(payloadUndef.expectedVersion).toBeUndefined();

      const payloadNull = buildPrescriptionPatchPayload({
        status: 'DISCONTINUED',
        expectedVersion: null,
      });
      expect(payloadNull.expectedVersion).toBeUndefined();
    });

    it('trims notes and sets null when empty or whitespace', () => {
      const payloadWithNotes = buildPrescriptionPatchPayload({
        status: 'CANCELLED',
        expectedVersion: 1,
        notes: '   Entered duplicate medication order   ',
      });
      expect(payloadWithNotes.notes).toBe('Entered duplicate medication order');

      const payloadEmptyNotes = buildPrescriptionPatchPayload({
        status: 'CANCELLED',
        expectedVersion: 1,
        notes: '   ',
      });
      expect(payloadEmptyNotes.notes).toBeNull();
    });

    it('rejects invalid expectedVersion values (< 1, non-integers, non-numbers, non-finite)', () => {
      const invalidVersions = [0, -1, -50, 1.5, NaN, Infinity, -Infinity, '1' as unknown as number];

      for (const invalidVer of invalidVersions) {
        expect(() =>
          buildPrescriptionPatchPayload({
            status: 'COMPLETED',
            expectedVersion: invalidVer,
          })
        ).toThrowError(/Invalid expectedVersion/);
      }
    });

    it('strictly excludes medication items or clinical orders from the mutation payload', () => {
      const payload = buildPrescriptionPatchPayload({
        status: 'DISCONTINUED',
        expectedVersion: 3,
        notes: 'Adverse rash reported',
      });

      expect(payload).not.toHaveProperty('items');
      expect(payload).not.toHaveProperty('medicationName');
      expect(payload).not.toHaveProperty('quantity');
      expect(payload).not.toHaveProperty('instructions');
    });
  });

  describe('parsePrescriptionApiError', () => {
    it('detects HTTP 409 as a concurrency conflict', () => {
      const result = parsePrescriptionApiError(409, {
        error: 'Prescription version conflict: current version is 3, but client submitted 2.',
      });

      expect(result.isConflict).toBe(true);
      expect(result.message).toContain('Prescription version conflict');
    });

    it('provides fallback message for HTTP 409 without explicit error string', () => {
      const result = parsePrescriptionApiError(409, null);
      expect(result.isConflict).toBe(true);
      expect(result.message).toContain('Prescription version conflict');
    });

    it('parses HTTP 400 validation error and captures validation field details', () => {
      const result = parsePrescriptionApiError(400, {
        error: 'Validation failed',
        details: {
          notes: ['Notes must not exceed 1000 characters'],
        },
      });

      expect(result.isConflict).toBe(false);
      expect(result.message).toBe('Validation failed');
      expect(result.details?.notes).toContain('Notes must not exceed 1000 characters');
    });

    it('parses HTTP 403 Forbidden with appropriate clinical message', () => {
      const result = parsePrescriptionApiError(403, { error: 'Insufficient permissions' });
      expect(result.isConflict).toBe(false);
      expect(result.message).toBe('Insufficient permissions');

      const resultDefault = parsePrescriptionApiError(403);
      expect(resultDefault.message).toContain('Access denied');
    });

    it('parses HTTP 404 Not Found safely', () => {
      const result = parsePrescriptionApiError(404);
      expect(result.isConflict).toBe(false);
      expect(result.message).toContain('Prescription record not found in active clinic');
    });

    it('handles malformed, primitive, or unexpected error bodies gracefully without throwing', () => {
      expect(() => parsePrescriptionApiError(500, 'Internal Server Error')).not.toThrow();
      expect(() => parsePrescriptionApiError(500, 12345)).not.toThrow();
      expect(() => parsePrescriptionApiError(500, undefined)).not.toThrow();
      expect(() => parsePrescriptionApiError(500, { error: '   ' })).not.toThrow();

      const result = parsePrescriptionApiError(500, 'Internal Server Error');
      expect(result.isConflict).toBe(false);
      expect(result.message).toContain('An unexpected error occurred');
    });
  });
});
