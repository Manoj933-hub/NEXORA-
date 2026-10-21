import { z } from 'zod';

export const BloodGroupEnum = z.enum([
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
  'UNKNOWN',
]);

export const GenderEnum = z.enum(['MALE', 'FEMALE', 'OTHER']);

export const CreatePatientInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Patient name must be at least 2 characters long')
    .max(100, 'Patient name must not exceed 100 characters'),
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
    .optional()
    .nullable(),
  gender: GenderEnum.optional().nullable(),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9\s-]{7,20}$/, 'Invalid phone number format')
    .optional()
    .nullable(),
  email: z
    .string()
    .trim()
    .email('Invalid email address format')
    .optional()
    .nullable()
    .or(z.literal('')),
  address: z
    .string()
    .trim()
    .max(255, 'Address must not exceed 255 characters')
    .optional()
    .nullable(),
  emergencyContact: z
    .string()
    .trim()
    .max(100, 'Emergency contact must not exceed 100 characters')
    .optional()
    .nullable(),
  bloodGroup: BloodGroupEnum.optional().nullable(),
  allergies: z
    .string()
    .trim()
    .max(500, 'Allergies note must not exceed 500 characters')
    .optional()
    .nullable(),
  notes: z
    .string()
    .trim()
    .max(1000, 'Notes must not exceed 1000 characters')
    .optional()
    .nullable(),
});

export type CreatePatientInput = z.infer<typeof CreatePatientInputSchema>;

export const UpdatePatientInputSchema = CreatePatientInputSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type UpdatePatientInput = z.infer<typeof UpdatePatientInputSchema>;

export const PatientQuerySchema = z.object({
  query: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PatientQuery = z.infer<typeof PatientQuerySchema>;
