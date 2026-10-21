import { z } from 'zod';
import { AppointmentStatus } from '@prisma/client';

export { AppointmentStatus };

export const AppointmentStatusEnum = z.enum([
  'SCHEDULED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);

export const VALID_STATUS_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  SCHEDULED: ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function isValidStatusTransition(
  currentStatus: AppointmentStatus,
  targetStatus: AppointmentStatus
): boolean {
  if (currentStatus === targetStatus) return true;
  return VALID_STATUS_TRANSITIONS[currentStatus]?.includes(targetStatus) ?? false;
}

export const CreateAppointmentInputSchema = z
  .object({
    patientId: z.string().min(1, 'Patient ID is required'),
    doctorId: z.string().min(1).optional().nullable(),
    startTime: z.string().datetime({ message: 'Start time must be a valid ISO 8601 datetime' }),
    endTime: z.string().datetime({ message: 'End time must be a valid ISO 8601 datetime' }),
    reason: z
      .string()
      .trim()
      .max(255, 'Reason must not exceed 255 characters')
      .optional()
      .nullable(),
    notes: z
      .string()
      .trim()
      .max(1000, 'Notes must not exceed 1000 characters')
      .optional()
      .nullable(),
  })
  .refine(
    (data) => new Date(data.endTime).getTime() > new Date(data.startTime).getTime(),
    {
      message: 'End time must be after start time',
      path: ['endTime'],
    }
  );

export type CreateAppointmentInput = z.infer<typeof CreateAppointmentInputSchema>;

export const RescheduleAppointmentInputSchema = z
  .object({
    startTime: z.string().datetime({ message: 'Start time must be a valid ISO 8601 datetime' }),
    endTime: z.string().datetime({ message: 'End time must be a valid ISO 8601 datetime' }),
    reason: z
      .string()
      .trim()
      .max(255, 'Reason must not exceed 255 characters')
      .optional()
      .nullable(),
  })
  .refine(
    (data) => new Date(data.endTime).getTime() > new Date(data.startTime).getTime(),
    {
      message: 'End time must be after start time',
      path: ['endTime'],
    }
  );

export type RescheduleAppointmentInput = z.infer<typeof RescheduleAppointmentInputSchema>;

export const UpdateAppointmentStatusInputSchema = z.object({
  status: AppointmentStatusEnum,
  cancelledReason: z
    .string()
    .trim()
    .max(500, 'Cancellation reason must not exceed 500 characters')
    .optional()
    .nullable(),
});

export type UpdateAppointmentStatusInput = z.infer<typeof UpdateAppointmentStatusInputSchema>;

export const AppointmentQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: AppointmentStatusEnum.optional(),
  patientId: z.string().optional(),
  doctorId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AppointmentQuery = z.infer<typeof AppointmentQuerySchema>;
