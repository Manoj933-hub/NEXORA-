import { z } from 'zod';

export const CreateClinicInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Clinic name must be at least 2 characters long')
    .max(120, 'Clinic name must not exceed 120 characters'),
  country: z
    .enum(['IN', 'NP'] as const)
    .default('IN'),
  currency: z
    .enum(['INR', 'NPR'] as const)
    .default('INR'),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9\s-]{7,20}$/, 'Invalid phone number format')
    .optional()
    .nullable(),
  address: z
    .string()
    .trim()
    .max(250, 'Address must not exceed 250 characters')
    .optional()
    .nullable(),
});

export type CreateClinicInput = z.infer<typeof CreateClinicInputSchema>;

export const UpdateClinicInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Clinic name must be at least 2 characters long')
    .max(120, 'Clinic name must not exceed 120 characters')
    .optional(),
  country: z
    .enum(['IN', 'NP'] as const)
    .optional(),
  currency: z
    .enum(['INR', 'NPR'] as const)
    .optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9\s-]{7,20}$/, 'Invalid phone number format')
    .optional()
    .nullable(),
  address: z
    .string()
    .trim()
    .max(250, 'Address must not exceed 250 characters')
    .optional()
    .nullable(),
});

export type UpdateClinicInput = z.infer<typeof UpdateClinicInputSchema>;
