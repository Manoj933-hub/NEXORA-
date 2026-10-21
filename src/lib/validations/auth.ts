import { z } from 'zod';

export const RegisterInputSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email address')
    .transform((val) => val.trim().toLowerCase()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters long')
    .max(100, 'Name must not exceed 100 characters'),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9\s-]{7,20}$/, 'Invalid phone number format')
    .optional()
    .nullable(),
  clinicName: z
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
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email address')
    .transform((val) => val.trim().toLowerCase()),
  password: z
    .string()
    .min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

export const SwitchClinicInputSchema = z.object({
  clinicId: z
    .string()
    .min(1, 'Clinic ID is required'),
});

export type SwitchClinicInput = z.infer<typeof SwitchClinicInputSchema>;
