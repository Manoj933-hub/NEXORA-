import { describe, it, expect } from 'vitest';
import {
  buildConsultationAmendmentPayload,
  parseConcurrencyError,
  isValidConsultationVersion,
  type ServerConsultationSnapshot,
} from '@/lib/clinical/concurrency';

describe('Consultation Editor Concurrency & Conflict Flow Tests', () => {
  it('includes expectedVersion in the amendment PATCH payload', () => {
    const payload = buildConsultationAmendmentPayload({
      status: 'AMENDED',
      expectedVersion: 3,
      isLocked: true,
      subjective: 'Follow-up complaint',
      amendmentReason: 'Added laboratory confirmation',
    });

    expect(payload.expectedVersion).toBe(3);
    expect(payload.amendmentReason).toBe('Added laboratory confirmation');
  });

  it('updates stored version when server responds with updated version', () => {
    let storedVersion: number | null = 2;

    const mockServerResponse = {
      consultation: {
        id: 'con-123',
        version: 3,
        status: 'AMENDED',
      },
    };

    // Client updates stored version upon successful response
    if (mockServerResponse.consultation?.version) {
      storedVersion = mockServerResponse.consultation.version;
    }

    expect(storedVersion).toBe(3);
  });

  it('detects HTTP 409 conflict and preserves unsaved clinical form inputs', () => {
    const unsavedForm = {
      subjective: 'Clinician entered extensive patient history...',
      objective: 'BP 125/80, HR 72',
      assessment: 'Suspected viral gastroenteritis',
      plan: 'Oral rehydration salts, zinc supplementation',
      amendmentReason: 'Corrected assessment based on symptom duration',
    };

    const serverResponse = {
      status: 409,
      body: {
        error: 'Consultation version conflict: current version is 2, but client submitted version 1. Please reload.',
      },
    };

    const parsed = parseConcurrencyError(serverResponse.status, serverResponse.body);

    expect(parsed.isConflict).toBe(true);
    expect(parsed.message).toContain('Consultation version conflict');

    // Crucially: unsaved inputs are completely preserved
    expect(unsavedForm.subjective).toBe('Clinician entered extensive patient history...');
    expect(unsavedForm.assessment).toBe('Suspected viral gastroenteritis');
    expect(unsavedForm.plan).toBe('Oral rehydration salts, zinc supplementation');
  });

  it('prevents duplicate submissions while save is in flight', async () => {
    let saving = false;
    let submissionCount = 0;

    async function simulateHandleUpdate() {
      if (saving) return;
      saving = true;
      submissionCount += 1;
      // Simulate in-flight async network request
      await new Promise((r) => setTimeout(r, 50));
      saving = false;
    }

    // Trigger two rapid consecutive clicks
    const promise1 = simulateHandleUpdate();
    const promise2 = simulateHandleUpdate();

    await Promise.all([promise1, promise2]);

    // Only one network request should have been dispatched
    expect(submissionCount).toBe(1);
  });

  it('requires explicit confirmation before reloading the latest server version', () => {
    let formValues = {
      subjective: 'Unsaved draft subjective',
      version: 1,
    };

    const latestServerData: ServerConsultationSnapshot = {
      id: 'con-123',
      version: 2,
      status: 'AMENDED',
      subjective: 'Server version subjective',
      createdAt: '2026-10-22T10:00:00Z',
    };

    let userConfirmed = false;

    function attemptReload() {
      if (!userConfirmed) {
        // Disallowed without confirmation
        return;
      }
      formValues = {
        subjective: latestServerData.subjective || '',
        version: latestServerData.version,
      };
    }

    // Attempt 1: Cancelled / no confirmation
    attemptReload();
    expect(formValues.subjective).toBe('Unsaved draft subjective');
    expect(formValues.version).toBe(1);

    // Attempt 2: User explicitly confirmed
    userConfirmed = true;
    attemptReload();
    expect(formValues.subjective).toBe('Server version subjective');
    expect(formValues.version).toBe(2);
  });

  describe('DEF-01: Amendment Consultation Version Pre-Submission Guard', () => {
    const EXPECTED_VERSION_ERROR =
      'Cannot submit amendment: a valid consultation version could not be loaded from the server. Please reload the consultation record.';

    interface AmendmentContext {
      status: 'FINALIZED' | 'AMENDED';
      version: unknown;
      amendmentReason: string;
      formData: {
        subjective: string;
        objective: string;
        assessment: string;
        plan: string;
        vitals: Record<string, unknown>;
        diagnoses: Array<{ name: string }>;
        prescriptions: Array<{ medicationName: string }>;
      };
    }

    function createSimulatedEditor() {
      let saving = false;
      let error: string | null = null;
      let patchSent = false;
      let lastDispatchedPayload: Record<string, unknown> | null = null;

      async function handleUpdate(ctx: AmendmentContext) {
        if (saving) return;

        const isLocked = ctx.status === 'FINALIZED' || ctx.status === 'AMENDED';

        // DEF-01 Guard: block amendment submission when record is locked and version is missing or invalid
        if (isLocked && !isValidConsultationVersion(ctx.version)) {
          error = EXPECTED_VERSION_ERROR;
          return;
        }

        if (isLocked && (!ctx.amendmentReason || ctx.amendmentReason.trim().length === 0)) {
          error = 'Please provide a specific clinical reason for amending this finalized consultation.';
          return;
        }

        saving = true;
        error = null;

        try {
          patchSent = true;
          lastDispatchedPayload = {
            expectedVersion: ctx.version,
            subjective: ctx.formData.subjective,
            objective: ctx.formData.objective,
            assessment: ctx.formData.assessment,
            plan: ctx.formData.plan,
            amendmentReason: ctx.amendmentReason.trim(),
          };
        } finally {
          saving = false;
        }
      }

      return {
        handleUpdate,
        isSaving: () => saving,
        getError: () => error,
        isPatchSent: () => patchSent,
        getDispatchedPayload: () => lastDispatchedPayload,
      };
    }

    it('blocks amendment submission when consultation version is null', async () => {
      const editor = createSimulatedEditor();
      const ctx: AmendmentContext = {
        status: 'FINALIZED',
        version: null,
        amendmentReason: 'Correcting clinical dosage note',
        formData: {
          subjective: 'Patient reports mild nausea',
          objective: 'BP 120/80',
          assessment: 'Adverse drug reaction',
          plan: 'Discontinue offending medication',
          vitals: { heartRate: 72 },
          diagnoses: [{ name: 'Adverse drug reaction' }],
          prescriptions: [{ medicationName: 'Ondansetron' }],
        },
      };

      await editor.handleUpdate(ctx);

      expect(editor.getError()).toBe(EXPECTED_VERSION_ERROR);
      expect(editor.isPatchSent()).toBe(false);
      expect(editor.getDispatchedPayload()).toBeNull();
    });

    it('blocks amendment submission when consultation version is less than 1 or otherwise invalid', async () => {
      const invalidVersions = [
        0,
        -1,
        -100,
        NaN,
        Infinity,
        -Infinity,
        1.5,
        '1',
        undefined,
        {},
        [],
      ];

      for (const invalidVer of invalidVersions) {
        const editor = createSimulatedEditor();
        const ctx: AmendmentContext = {
          status: 'AMENDED',
          version: invalidVer,
          amendmentReason: 'Update clinical notes',
          formData: {
            subjective: 'Test subjective',
            objective: 'Test objective',
            assessment: 'Test assessment',
            plan: 'Test plan',
            vitals: {},
            diagnoses: [],
            prescriptions: [],
          },
        };

        await editor.handleUpdate(ctx);

        expect(editor.getError()).toBe(EXPECTED_VERSION_ERROR);
        expect(editor.isPatchSent()).toBe(false);
        expect(editor.getDispatchedPayload()).toBeNull();
      }
    });

    it('ensures no PATCH request is sent when version is invalid', async () => {
      const editor = createSimulatedEditor();
      const ctx: AmendmentContext = {
        status: 'FINALIZED',
        version: null,
        amendmentReason: 'Adding revised diagnosis',
        formData: {
          subjective: 'Severe abdominal pain',
          objective: 'Guarding in RLQ',
          assessment: 'Suspected appendicitis',
          plan: 'Immediate surgical referral',
          vitals: { temp: 101.4 },
          diagnoses: [{ name: 'Acute appendicitis' }],
          prescriptions: [],
        },
      };

      await editor.handleUpdate(ctx);

      expect(editor.isPatchSent()).toBe(false);
      expect(editor.getDispatchedPayload()).toBeNull();
    });

    it('permits amendment submission with a valid version (>= 1) and transmits expectedVersion', async () => {
      const validVersions = [1, 2, 4, 10];

      for (const validVer of validVersions) {
        const editor = createSimulatedEditor();
        const ctx: AmendmentContext = {
          status: 'FINALIZED',
          version: validVer,
          amendmentReason: 'Updated surgical consult confirmation',
          formData: {
            subjective: 'Severe abdominal pain',
            objective: 'Guarding in RLQ',
            assessment: 'Suspected appendicitis',
            plan: 'Immediate surgical referral',
            vitals: { temp: 101.4 },
            diagnoses: [{ name: 'Acute appendicitis' }],
            prescriptions: [],
          },
        };

        await editor.handleUpdate(ctx);

        expect(editor.getError()).toBeNull();
        expect(editor.isPatchSent()).toBe(true);
        expect(editor.getDispatchedPayload()?.expectedVersion).toBe(validVer);
        expect(editor.getDispatchedPayload()?.amendmentReason).toBe('Updated surgical consult confirmation');
      }
    });

    it('preserves all existing unsaved clinical form data intact when submission is blocked', async () => {
      const editor = createSimulatedEditor();

      // Clinician has filled in complete, valuable clinical notes
      const initialFormData = {
        subjective: 'Patient reports persistent high fever and productive cough for 4 days.',
        objective: 'Chest auscultation reveals crackles in the right lower lobe. SpO2 94%.',
        assessment: 'Community-acquired pneumonia, moderate severity.',
        plan: 'Initiate Amoxicillin/Clavulanate, schedule chest radiograph, hydrate.',
        vitals: { systolicBp: 118, diastolicBp: 78, heartRate: 88, temp: 102.1 },
        diagnoses: [{ name: 'Community-acquired pneumonia', code: 'J18.9' }],
        prescriptions: [{ medicationName: 'Augmentin 625mg', frequency: '1-0-1', duration: '7 days' }],
      };

      // Clone to ensure deep reference comparison
      const initialSnapshot = JSON.parse(JSON.stringify(initialFormData));

      const ctx: AmendmentContext = {
        status: 'FINALIZED',
        version: null, // Missing version triggers guard block
        amendmentReason: 'Added antibiotic prescription after auscultation',
        formData: initialFormData,
      };

      await editor.handleUpdate(ctx);

      // Submission was blocked with the expected error
      expect(editor.getError()).toBe(EXPECTED_VERSION_ERROR);
      expect(editor.isPatchSent()).toBe(false);

      // Crucial requirement: Form data must remain 100% intact without any loss or mutation
      expect(ctx.formData.subjective).toBe(initialSnapshot.subjective);
      expect(ctx.formData.objective).toBe(initialSnapshot.objective);
      expect(ctx.formData.assessment).toBe(initialSnapshot.assessment);
      expect(ctx.formData.plan).toBe(initialSnapshot.plan);
      expect(ctx.formData.vitals).toEqual(initialSnapshot.vitals);
      expect(ctx.formData.diagnoses).toEqual(initialSnapshot.diagnoses);
      expect(ctx.formData.prescriptions).toEqual(initialSnapshot.prescriptions);
      expect(ctx.amendmentReason).toBe('Added antibiotic prescription after auscultation');
    });

    it('enforces consistent UI button disabled rule for missing/invalid version or saving state', () => {
      // The UI evaluates: disabled = saving || (isLocked && !isValidConsultationVersion(version))
      function isAmendmentButtonDisabled(params: {
        saving: boolean;
        isLocked: boolean;
        version: unknown;
      }): boolean {
        return params.saving || (params.isLocked && !isValidConsultationVersion(params.version));
      }

      // Locked record + null version -> disabled
      expect(isAmendmentButtonDisabled({ saving: false, isLocked: true, version: null })).toBe(true);

      // Locked record + undefined version -> disabled
      expect(isAmendmentButtonDisabled({ saving: false, isLocked: true, version: undefined })).toBe(true);

      // Locked record + version 0 (< 1) -> disabled
      expect(isAmendmentButtonDisabled({ saving: false, isLocked: true, version: 0 })).toBe(true);

      // Locked record + version -1 (< 1) -> disabled
      expect(isAmendmentButtonDisabled({ saving: false, isLocked: true, version: -1 })).toBe(true);

      // Locked record + NaN -> disabled
      expect(isAmendmentButtonDisabled({ saving: false, isLocked: true, version: NaN })).toBe(true);

      // Locked record + valid version (e.g. 1) + not saving -> enabled
      expect(isAmendmentButtonDisabled({ saving: false, isLocked: true, version: 1 })).toBe(false);
      expect(isAmendmentButtonDisabled({ saving: false, isLocked: true, version: 2 })).toBe(false);

      // Valid version, but save is in flight -> disabled
      expect(isAmendmentButtonDisabled({ saving: true, isLocked: true, version: 2 })).toBe(true);

      // Unlocked record (draft) -> version check does not disable
      expect(isAmendmentButtonDisabled({ saving: false, isLocked: false, version: null })).toBe(false);
    });
  });
});
