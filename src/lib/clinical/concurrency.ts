/**
 * Clinical Concurrency & Optimistic Concurrency Control (OCC) Utilities
 *
 * Provides structured formatting for unsaved clinical modifications during
 * 409 Conflict scenarios, clipboard export generation, and concurrency validation.
 */

export interface ClinicalVitalsUnsaved {
  systolicBp?: string | number | null;
  diastolicBp?: string | number | null;
  heartRate?: string | number | null;
  temperature?: string | number | null;
  temperatureUnit?: string | null;
  respiratoryRate?: string | number | null;
  oxygenSaturation?: string | number | null;
  height?: string | number | null;
  heightUnit?: string | null;
  weight?: string | number | null;
  weightUnit?: string | null;
  bmi?: number | null;
  notes?: string | null;
}

export interface ClinicalDiagnosisUnsaved {
  name: string;
  codeSystem?: string | null;
  code?: string | null;
  type: string;
}

export interface ClinicalPrescriptionItemUnsaved {
  medicationName: string;
  strength?: string | null;
  route?: string | null;
  frequency: string;
  duration: string;
  quantity?: string | null;
  instructions?: string | null;
}

export interface ClinicalPrescriptionUnsaved {
  notes?: string | null;
  items: ClinicalPrescriptionItemUnsaved[];
}

export interface ClinicalUnsavedChanges {
  consultationId: string;
  patientName: string;
  patientMrn: string;
  originalVersion: number | null;
  status: string;
  amendmentReason?: string | null;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  vitals?: ClinicalVitalsUnsaved | null;
  diagnoses?: ClinicalDiagnosisUnsaved[] | null;
  prescriptions?: ClinicalPrescriptionUnsaved[] | null;
}

export interface ServerConsultationSnapshot {
  id: string;
  version: number;
  status: 'DRAFT' | 'FINALIZED' | 'AMENDED';
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  finalizedAt?: string | null;
  amendedAt?: string | null;
  amendmentReason?: string | null;
  createdAt: string;
  doctor?: { id: string; name: string; email?: string } | null;
  amendedBy?: { id: string; name: string } | null;
  observations?: Array<{
    id?: string;
    systolicBp?: number | null;
    diastolicBp?: number | null;
    heartRate?: number | null;
    temperature?: number | null;
    temperatureUnit?: string | null;
    respiratoryRate?: number | null;
    oxygenSaturation?: number | null;
    height?: number | null;
    heightUnit?: string | null;
    weight?: number | null;
    weightUnit?: string | null;
    bmi?: number | null;
    notes?: string | null;
  }>;
  diagnoses?: Array<{
    id?: string;
    name: string;
    codeSystem?: string | null;
    code?: string | null;
    type: 'PRIMARY' | 'SECONDARY';
  }>;
  prescriptions?: Array<{
    id?: string;
    status: string;
    notes?: string | null;
    items: Array<{
      id?: string;
      medicationName: string;
      strength?: string | null;
      route?: string | null;
      frequency: string;
      duration: string;
      quantity?: string | null;
      instructions?: string | null;
    }>;
  }>;
}

/**
 * Validates whether a value is a valid consultation version for optimistic concurrency control.
 * A valid version must be a finite integer greater than or equal to 1.
 * Rejects null, undefined, non-numbers, non-finite values (NaN, Infinity), non-integers, and numbers < 1.
 */
export function isValidConsultationVersion(version: unknown): version is number {
  return (
    typeof version === 'number' &&
    Number.isFinite(version) &&
    Number.isInteger(version) &&
    version >= 1
  );
}

/**
 * Builds the PATCH payload for consultation update/amendment with OCC protection.
 */
export function buildConsultationAmendmentPayload(params: {
  status?: 'DRAFT' | 'FINALIZED' | 'AMENDED';
  expectedVersion: number | null | undefined;
  isLocked: boolean;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  amendmentReason?: string | null;
  vitalsPayload?: unknown;
  diagnosesPayload?: unknown;
  prescriptionsPayload?: unknown;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    status: params.status,
    subjective: params.subjective ? params.subjective.trim() : null,
    objective: params.objective ? params.objective.trim() : null,
    assessment: params.assessment ? params.assessment.trim() : null,
    plan: params.plan ? params.plan.trim() : null,
    amendmentReason: params.isLocked && params.amendmentReason ? params.amendmentReason.trim() : null,
    vitals: params.vitalsPayload ?? null,
    diagnoses: params.diagnosesPayload ?? null,
    prescriptions: params.prescriptionsPayload ?? null,
  };

  if (params.expectedVersion !== null && params.expectedVersion !== undefined) {
    payload.expectedVersion = params.expectedVersion;
  }

  return payload;
}

/**
 * Parses an API error response to detect concurrency conflict.
 */
export function parseConcurrencyError(
  status: number,
  data?: { error?: string } | null
): { isConflict: boolean; message: string } {
  if (status === 409) {
    return {
      isConflict: true,
      message:
        data?.error ||
        'Consultation version conflict: this clinical record was modified concurrently by another user.',
    };
  }
  return {
    isConflict: false,
    message: data?.error || 'An unexpected error occurred.',
  };
}

/**
 * Formats unsaved clinical modifications into human-readable text suitable
 * for clipboard export, allowing the clinician to safeguard their notes.
 */
export function formatClinicalChangesForClipboard(data: ClinicalUnsavedChanges): string {
  const lines: string[] = [];
  lines.push('================================================================');
  lines.push('   NEXORA HEALTHCARE PLATFORM — UNSAVED CLINICAL MODIFICATIONS  ');
  lines.push('================================================================');
  lines.push(`Consultation ID : ${data.consultationId}`);
  lines.push(`Patient Name    : ${data.patientName || 'Unknown'}`);
  lines.push(`Patient MRN     : ${data.patientMrn || 'N/A'}`);
  lines.push(`Clinical Status : ${data.status}`);
  lines.push(
    `Base Version    : ${data.originalVersion !== null ? `v${data.originalVersion}` : 'Unversioned Draft'}`
  );
  lines.push(`Exported At     : ${new Date().toISOString()}`);
  lines.push('');

  if (data.amendmentReason && data.amendmentReason.trim().length > 0) {
    lines.push('--- [CLINICAL AMENDMENT REASON] ---');
    lines.push(data.amendmentReason.trim());
    lines.push('');
  }

  lines.push('--- [SOAP CLINICAL NOTES] ---');
  lines.push(`[S - Subjective]`);
  lines.push(data.subjective && data.subjective.trim().length > 0 ? data.subjective.trim() : '(No complaints recorded)');
  lines.push('');
  lines.push(`[O - Objective]`);
  lines.push(data.objective && data.objective.trim().length > 0 ? data.objective.trim() : '(No physical exam findings recorded)');
  lines.push('');
  lines.push(`[A - Assessment]`);
  lines.push(data.assessment && data.assessment.trim().length > 0 ? data.assessment.trim() : '(No clinical assessment recorded)');
  lines.push('');
  lines.push(`[P - Plan]`);
  lines.push(data.plan && data.plan.trim().length > 0 ? data.plan.trim() : '(No plan recorded)');
  lines.push('');

  const v = data.vitals;
  if (v) {
    const vLines: string[] = [];
    if (v.systolicBp || v.diastolicBp) {
      vLines.push(`  Blood Pressure      : ${v.systolicBp || '—'} / ${v.diastolicBp || '—'} mmHg`);
    }
    if (v.heartRate) vLines.push(`  Heart Rate          : ${v.heartRate} bpm`);
    if (v.temperature) vLines.push(`  Temperature         : ${v.temperature} °${v.temperatureUnit || 'F'}`);
    if (v.respiratoryRate) vLines.push(`  Respiratory Rate    : ${v.respiratoryRate} breaths/min`);
    if (v.oxygenSaturation) vLines.push(`  Oxygen Saturation   : ${v.oxygenSaturation} % SpO2`);
    if (v.height) vLines.push(`  Height              : ${v.height} ${v.heightUnit || 'cm'}`);
    if (v.weight) vLines.push(`  Weight              : ${v.weight} ${v.weightUnit || 'kg'}`);
    if (v.bmi) vLines.push(`  Body Mass Index     : ${v.bmi}`);
    if (v.notes) vLines.push(`  Vitals Notes        : ${v.notes}`);

    if (vLines.length > 0) {
      lines.push('--- [VITAL SIGNS & OBSERVATIONS] ---');
      lines.push(...vLines);
      lines.push('');
    }
  }

  if (data.diagnoses && data.diagnoses.length > 0) {
    const validD = data.diagnoses.filter((d) => d.name && d.name.trim().length > 0);
    if (validD.length > 0) {
      lines.push('--- [DIAGNOSES] ---');
      validD.forEach((d, idx) => {
        const codeInfo = d.code ? ` (${d.codeSystem || 'ICD-10'}: ${d.code})` : '';
        lines.push(`  ${idx + 1}. [${d.type}] ${d.name}${codeInfo}`);
      });
      lines.push('');
    }
  }

  if (data.prescriptions && data.prescriptions.length > 0) {
    const allItems: Array<{ rxIdx: number; item: ClinicalPrescriptionItemUnsaved; notes?: string | null }> = [];
    data.prescriptions.forEach((rx, rxIdx) => {
      rx.items.forEach((item) => {
        if (item.medicationName && item.medicationName.trim().length > 0) {
          allItems.push({ rxIdx, item, notes: rx.notes });
        }
      });
    });

    if (allItems.length > 0) {
      lines.push('--- [PRESCRIPTIONS & MEDICATIONS] ---');
      allItems.forEach(({ item }, idx) => {
        lines.push(
          `  ${idx + 1}. ${item.medicationName}${item.strength ? ` ${item.strength}` : ''} | Route: ${
            item.route || 'ORAL'
          } | Frequency: ${item.frequency} | Duration: ${item.duration}${
            item.quantity ? ` | Qty: ${item.quantity}` : ''
          }`
        );
        if (item.instructions && item.instructions.trim().length > 0) {
          lines.push(`     Instructions: ${item.instructions.trim()}`);
        }
      });
      data.prescriptions.forEach((rx) => {
        if (rx.notes && rx.notes.trim().length > 0) {
          lines.push(`  Doctor Advice: ${rx.notes.trim()}`);
        }
      });
      lines.push('');
    }
  }

  lines.push('================================================================');
  lines.push('     NOTE: THESE ARE UNSAVED LOCAL CLINICAL MODIFICATIONS       ');
  lines.push('================================================================');
  return lines.join('\n');
}
