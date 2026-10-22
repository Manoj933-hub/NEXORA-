import { z } from 'zod';
import { ConsultationStatus, PrescriptionStatus } from '@prisma/client';

export { ConsultationStatus, PrescriptionStatus };

export const VALID_PRESCRIPTION_STATUS_TRANSITIONS: Record<
  PrescriptionStatus,
  readonly PrescriptionStatus[]
> = {
  ACTIVE: ['COMPLETED', 'DISCONTINUED', 'CANCELLED'],
  COMPLETED: [],
  DISCONTINUED: [],
  CANCELLED: [],
};

export function isValidPrescriptionStatusTransition(
  currentStatus: PrescriptionStatus,
  targetStatus: PrescriptionStatus
): boolean {
  if (currentStatus === targetStatus) return true;
  return VALID_PRESCRIPTION_STATUS_TRANSITIONS[currentStatus]?.includes(targetStatus) ?? false;
}

export const VALID_CONSULTATION_STATUS_TRANSITIONS: Record<
  ConsultationStatus,
  readonly ConsultationStatus[]
> = {
  DRAFT: ['DRAFT', 'FINALIZED'],
  FINALIZED: ['AMENDED'],
  AMENDED: ['AMENDED'],
};

export function isValidConsultationStatusTransition(
  currentStatus: ConsultationStatus,
  targetStatus: ConsultationStatus
): boolean {
  return VALID_CONSULTATION_STATUS_TRANSITIONS[currentStatus]?.includes(targetStatus) ?? false;
}

export const ObservationInputSchema = z
  .object({
    systolicBp: z
      .number()
      .int('Systolic BP must be an integer')
      .min(40, 'Systolic BP must be at least 40 mmHg')
      .max(300, 'Systolic BP must not exceed 300 mmHg')
      .optional()
      .nullable(),
    diastolicBp: z
      .number()
      .int('Diastolic BP must be an integer')
      .min(30, 'Diastolic BP must be at least 30 mmHg')
      .max(200, 'Diastolic BP must not exceed 200 mmHg')
      .optional()
      .nullable(),
    heartRate: z
      .number()
      .int('Heart rate must be an integer')
      .min(20, 'Heart rate must be at least 20 bpm')
      .max(300, 'Heart rate must not exceed 300 bpm')
      .optional()
      .nullable(),
    temperature: z
      .number()
      .optional()
      .nullable(),
    temperatureUnit: z.enum(['F', 'C']).default('F').optional().nullable(),
    respiratoryRate: z
      .number()
      .int('Respiratory rate must be an integer')
      .min(4, 'Respiratory rate must be at least 4 breaths/min')
      .max(80, 'Respiratory rate must not exceed 80 breaths/min')
      .optional()
      .nullable(),
    oxygenSaturation: z
      .number()
      .min(50, 'Oxygen saturation must be at least 50%')
      .max(100, 'Oxygen saturation cannot exceed 100%')
      .optional()
      .nullable(),
    height: z
      .number()
      .min(20, 'Height must be at least 20')
      .max(260, 'Height must not exceed 260')
      .optional()
      .nullable(),
    heightUnit: z.enum(['cm', 'in']).default('cm').optional().nullable(),
    weight: z
      .number()
      .min(0.5, 'Weight must be at least 0.5')
      .max(500, 'Weight must not exceed 500')
      .optional()
      .nullable(),
    weightUnit: z.enum(['kg', 'lbs']).default('kg').optional().nullable(),
    notes: z
      .string()
      .trim()
      .max(500, 'Observation notes must not exceed 500 characters')
      .optional()
      .nullable(),
  })
  .refine(
    (data) => {
      if (data.systolicBp != null && data.diastolicBp != null) {
        return data.systolicBp > data.diastolicBp;
      }
      return true;
    },
    {
      message: 'Systolic blood pressure must be greater than diastolic blood pressure',
      path: ['systolicBp'],
    }
  )
  .refine(
    (data) => {
      if (data.temperature != null) {
        const unit = data.temperatureUnit || 'F';
        if (unit === 'F') {
          return data.temperature >= 85 && data.temperature <= 115;
        } else {
          return data.temperature >= 30 && data.temperature <= 46;
        }
      }
      return true;
    },
    {
      message: 'Body temperature is outside the realistic physiological range',
      path: ['temperature'],
    }
  );

export type ObservationInput = z.infer<typeof ObservationInputSchema>;

export function calculateBMI(
  height?: number | null,
  heightUnit?: string | null,
  weight?: number | null,
  weightUnit?: string | null
): number | null {
  if (!height || !weight || height <= 0 || weight <= 0) return null;

  let heightInMeters: number;
  if (heightUnit === 'in') {
    heightInMeters = (height * 2.54) / 100;
  } else {
    heightInMeters = height / 100;
  }

  let weightInKg: number;
  if (weightUnit === 'lbs') {
    weightInKg = weight * 0.45359237;
  } else {
    weightInKg = weight;
  }

  const rawBMI = weightInKg / (heightInMeters * heightInMeters);
  if (isNaN(rawBMI) || !isFinite(rawBMI) || rawBMI < 5 || rawBMI > 120) return null;

  return Math.round(rawBMI * 10) / 10;
}

export const DiagnosisItemInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Diagnosis name must be at least 2 characters')
    .max(200, 'Diagnosis name must not exceed 200 characters'),
  codeSystem: z
    .string()
    .trim()
    .max(50, 'Code system must not exceed 50 characters')
    .optional()
    .nullable(),
  code: z
    .string()
    .trim()
    .max(30, 'Diagnosis code must not exceed 30 characters')
    .optional()
    .nullable(),
  type: z.enum(['PRIMARY', 'SECONDARY']).default('PRIMARY'),
  clinicalStatus: z
    .string()
    .trim()
    .max(30)
    .default('ACTIVE')
    .optional()
    .nullable(),
  notes: z
    .string()
    .trim()
    .max(500, 'Diagnosis notes must not exceed 500 characters')
    .optional()
    .nullable(),
});

export type DiagnosisItemInput = z.infer<typeof DiagnosisItemInputSchema>;

export const PrescriptionItemInputSchema = z.object({
  medicationName: z
    .string()
    .trim()
    .min(2, 'Medication name must be at least 2 characters')
    .max(200, 'Medication name must not exceed 200 characters'),
  strength: z
    .string()
    .trim()
    .max(100, 'Strength must not exceed 100 characters')
    .optional()
    .nullable(),
  route: z
    .string()
    .trim()
    .max(50, 'Route must not exceed 50 characters')
    .default('ORAL')
    .optional()
    .nullable(),
  frequency: z
    .string()
    .trim()
    .min(1, 'Frequency/instructions are required (e.g. 1-0-1 or Twice daily)')
    .max(100, 'Frequency must not exceed 100 characters'),
  duration: z
    .string()
    .trim()
    .min(1, 'Duration is required (e.g. 5 days or 1 month)')
    .max(100, 'Duration must not exceed 100 characters'),
  quantity: z
    .string()
    .trim()
    .max(50, 'Quantity must not exceed 50 characters')
    .optional()
    .nullable(),
  instructions: z
    .string()
    .trim()
    .max(500, 'Instructions must not exceed 500 characters')
    .optional()
    .nullable(),
});

export type PrescriptionItemInput = z.infer<typeof PrescriptionItemInputSchema>;

export const PrescriptionInputSchema = z.object({
  status: z
    .enum(['ACTIVE', 'COMPLETED', 'DISCONTINUED', 'CANCELLED'])
    .default('ACTIVE')
    .optional(),
  notes: z
    .string()
    .trim()
    .max(1000, 'Prescription notes must not exceed 1000 characters')
    .optional()
    .nullable(),
  items: z
    .array(PrescriptionItemInputSchema)
    .min(1, 'At least one medication item must be added to the prescription'),
});

export type PrescriptionInput = z.infer<typeof PrescriptionInputSchema>;

export const CreateConsultationInputSchema = z.object({
  patientId: z.string().trim().min(1, 'Patient ID is required'),
  appointmentId: z.string().trim().optional().nullable(),
  status: z.enum(['DRAFT', 'FINALIZED']).default('DRAFT').optional(),
  subjective: z
    .string()
    .trim()
    .max(5000, 'Subjective notes must not exceed 5000 characters')
    .optional()
    .nullable(),
  objective: z
    .string()
    .trim()
    .max(5000, 'Objective notes must not exceed 5000 characters')
    .optional()
    .nullable(),
  assessment: z
    .string()
    .trim()
    .max(5000, 'Assessment must not exceed 5000 characters')
    .optional()
    .nullable(),
  plan: z
    .string()
    .trim()
    .max(5000, 'Plan must not exceed 5000 characters')
    .optional()
    .nullable(),
  vitals: ObservationInputSchema.optional().nullable(),
  diagnoses: z.array(DiagnosisItemInputSchema).optional().nullable(),
  prescriptions: z.array(PrescriptionInputSchema).optional().nullable(),
});

export type CreateConsultationInput = z.infer<typeof CreateConsultationInputSchema>;

export const UpdateConsultationInputSchema = z.object({
  status: z.enum(['DRAFT', 'FINALIZED', 'AMENDED']).optional(),
  expectedVersion: z.number().int().min(1).optional(),
  subjective: z
    .string()
    .trim()
    .max(5000, 'Subjective notes must not exceed 5000 characters')
    .optional()
    .nullable(),
  objective: z
    .string()
    .trim()
    .max(5000, 'Objective notes must not exceed 5000 characters')
    .optional()
    .nullable(),
  assessment: z
    .string()
    .trim()
    .max(5000, 'Assessment must not exceed 5000 characters')
    .optional()
    .nullable(),
  plan: z
    .string()
    .trim()
    .max(5000, 'Plan must not exceed 5000 characters')
    .optional()
    .nullable(),
  amendmentReason: z
    .string()
    .trim()
    .max(1000, 'Amendment reason must not exceed 1000 characters')
    .optional()
    .nullable(),
  vitals: ObservationInputSchema.optional().nullable(),
  diagnoses: z.array(DiagnosisItemInputSchema).optional().nullable(),
  prescriptions: z.array(PrescriptionInputSchema).optional().nullable(),
});

export type UpdateConsultationInput = z.infer<typeof UpdateConsultationInputSchema>;
