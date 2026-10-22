import { describe, it, expect } from 'vitest';
import {
  buildConsultationAmendmentPayload,
  parseConcurrencyError,
  formatClinicalChangesForClipboard,
  isValidConsultationVersion,
  type ClinicalUnsavedChanges,
} from './concurrency';

describe('Clinical Concurrency & OCC Utilities', () => {
  describe('buildConsultationAmendmentPayload', () => {
    it('includes expectedVersion when provided', () => {
      const payload = buildConsultationAmendmentPayload({
        status: 'FINALIZED',
        expectedVersion: 2,
        isLocked: true,
        subjective: 'Patient reports persistent headache.',
        amendmentReason: 'Updated laboratory findings',
      });

      expect(payload.expectedVersion).toBe(2);
      expect(payload.status).toBe('FINALIZED');
      expect(payload.subjective).toBe('Patient reports persistent headache.');
      expect(payload.amendmentReason).toBe('Updated laboratory findings');
    });

    it('omits expectedVersion when null or undefined', () => {
      const payloadNull = buildConsultationAmendmentPayload({
        expectedVersion: null,
        isLocked: false,
        subjective: 'Draft note',
      });
      expect(payloadNull.expectedVersion).toBeUndefined();

      const payloadUndef = buildConsultationAmendmentPayload({
        expectedVersion: undefined,
        isLocked: false,
        subjective: 'Draft note',
      });
      expect(payloadUndef.expectedVersion).toBeUndefined();
    });

    it('trims amendment reason only when isLocked is true', () => {
      const payloadLocked = buildConsultationAmendmentPayload({
        expectedVersion: 1,
        isLocked: true,
        amendmentReason: '   Valid clinical amendment reason   ',
      });
      expect(payloadLocked.amendmentReason).toBe('Valid clinical amendment reason');

      const payloadUnlocked = buildConsultationAmendmentPayload({
        expectedVersion: 1,
        isLocked: false,
        amendmentReason: 'Ignored for draft',
      });
      expect(payloadUnlocked.amendmentReason).toBeNull();
    });
  });

  describe('parseConcurrencyError', () => {
    it('identifies HTTP 409 as a concurrency conflict', () => {
      const result = parseConcurrencyError(409, {
        error: 'Consultation version conflict: current version is 2, but client submitted version 1. Please reload.',
      });

      expect(result.isConflict).toBe(true);
      expect(result.message).toContain('Consultation version conflict');
    });

    it('provides fallback message for 409 without explicit message', () => {
      const result = parseConcurrencyError(409, null);
      expect(result.isConflict).toBe(true);
      expect(result.message).toContain('Consultation version conflict');
    });

    it('identifies non-409 statuses as regular errors', () => {
      const result = parseConcurrencyError(400, { error: 'Validation failed' });
      expect(result.isConflict).toBe(false);
      expect(result.message).toBe('Validation failed');
    });
  });

  describe('formatClinicalChangesForClipboard', () => {
    const mockData: ClinicalUnsavedChanges = {
      consultationId: 'con-uuid-1234',
      patientName: 'Jane Doe',
      patientMrn: 'NXR-NP-000142',
      originalVersion: 2,
      status: 'FINALIZED',
      amendmentReason: 'Patient called with worsening symptoms',
      subjective: 'Patient reports severe throbbing frontal headache for 3 days.',
      objective: 'BP 130/85, neurological exam within normal limits.',
      assessment: 'Acute tension-type headache, secondary to stress.',
      plan: 'Prescribed Paracetamol and advised rest.',
      vitals: {
        systolicBp: '130',
        diastolicBp: '85',
        heartRate: '78',
        temperature: '98.6',
        temperatureUnit: 'F',
        respiratoryRate: '16',
        oxygenSaturation: '99',
        height: '165',
        heightUnit: 'cm',
        weight: '62',
        weightUnit: 'kg',
        bmi: 22.8,
        notes: 'Sitting position, right arm',
      },
      diagnoses: [
        {
          name: 'Tension-type headache',
          codeSystem: 'ICD-10',
          code: 'G44.2',
          type: 'PRIMARY',
        },
      ],
      prescriptions: [
        {
          notes: 'Drink plenty of fluids',
          items: [
            {
              medicationName: 'Paracetamol',
              strength: '500 mg',
              route: 'ORAL',
              frequency: '1-0-1',
              duration: '3 days',
              quantity: '6 tablets',
              instructions: 'Take after food',
            },
          ],
        },
      ],
    };

    it('formats a comprehensive, human-readable clinical export', () => {
      const output = formatClinicalChangesForClipboard(mockData);

      expect(output).toContain('NEXORA HEALTHCARE PLATFORM — UNSAVED CLINICAL MODIFICATIONS');
      expect(output).toContain('Consultation ID : con-uuid-1234');
      expect(output).toContain('Patient Name    : Jane Doe');
      expect(output).toContain('Patient MRN     : NXR-NP-000142');
      expect(output).toContain('Base Version    : v2');
      expect(output).toContain('[CLINICAL AMENDMENT REASON]');
      expect(output).toContain('Patient called with worsening symptoms');
      expect(output).toContain('[S - Subjective]');
      expect(output).toContain('Patient reports severe throbbing frontal headache for 3 days.');
      expect(output).toContain('[O - Objective]');
      expect(output).toContain('BP 130/85, neurological exam within normal limits.');
      expect(output).toContain('[A - Assessment]');
      expect(output).toContain('Acute tension-type headache, secondary to stress.');
      expect(output).toContain('[P - Plan]');
      expect(output).toContain('Prescribed Paracetamol and advised rest.');

      // Vitals
      expect(output).toContain('Blood Pressure      : 130 / 85 mmHg');
      expect(output).toContain('Heart Rate          : 78 bpm');
      expect(output).toContain('Temperature         : 98.6 °F');
      expect(output).toContain('Body Mass Index     : 22.8');

      // Diagnoses
      expect(output).toContain('[PRIMARY] Tension-type headache (ICD-10: G44.2)');

      // Prescriptions
      expect(output).toContain('Paracetamol 500 mg | Route: ORAL | Frequency: 1-0-1 | Duration: 3 days | Qty: 6 tablets');
      expect(output).toContain('Instructions: Take after food');
      expect(output).toContain('Doctor Advice: Drink plenty of fluids');

      // Safety note
      expect(output).toContain('NOTE: THESE ARE UNSAVED LOCAL CLINICAL MODIFICATIONS');
    });

    it('handles minimal/empty clinical inputs gracefully without crash', () => {
      const minimalData: ClinicalUnsavedChanges = {
        consultationId: 'con-empty',
        patientName: '',
        patientMrn: '',
        originalVersion: null,
        status: 'DRAFT',
      };

      const output = formatClinicalChangesForClipboard(minimalData);

      expect(output).toContain('Consultation ID : con-empty');
      expect(output).toContain('Patient Name    : Unknown');
      expect(output).toContain('Base Version    : Unversioned Draft');
      expect(output).toContain('(No complaints recorded)');
      expect(output).toContain('(No physical exam findings recorded)');
      expect(output).toContain('(No clinical assessment recorded)');
      expect(output).toContain('(No plan recorded)');
      expect(output).not.toContain('--- [VITAL SIGNS & OBSERVATIONS] ---');
      expect(output).not.toContain('--- [DIAGNOSES] ---');
      expect(output).not.toContain('--- [PRESCRIPTIONS & MEDICATIONS] ---');
    });
  });

  describe('isValidConsultationVersion', () => {
    it('accepts valid positive integers', () => {
      expect(isValidConsultationVersion(1)).toBe(true);
      expect(isValidConsultationVersion(2)).toBe(true);
      expect(isValidConsultationVersion(42)).toBe(true);
      expect(isValidConsultationVersion(1000)).toBe(true);
    });

    it('rejects null and undefined', () => {
      expect(isValidConsultationVersion(null)).toBe(false);
      expect(isValidConsultationVersion(undefined)).toBe(false);
    });

    it('rejects non-number types', () => {
      expect(isValidConsultationVersion('1')).toBe(false);
      expect(isValidConsultationVersion('')).toBe(false);
      expect(isValidConsultationVersion(true)).toBe(false);
      expect(isValidConsultationVersion({})).toBe(false);
      expect(isValidConsultationVersion([])).toBe(false);
    });

    it('rejects non-finite numbers', () => {
      expect(isValidConsultationVersion(NaN)).toBe(false);
      expect(isValidConsultationVersion(Infinity)).toBe(false);
      expect(isValidConsultationVersion(-Infinity)).toBe(false);
    });

    it('rejects numbers less than 1', () => {
      expect(isValidConsultationVersion(0)).toBe(false);
      expect(isValidConsultationVersion(-1)).toBe(false);
      expect(isValidConsultationVersion(-99)).toBe(false);
    });

    it('rejects non-integer floating point numbers', () => {
      expect(isValidConsultationVersion(1.5)).toBe(false);
      expect(isValidConsultationVersion(2.0001)).toBe(false);
    });
  });
});
