/**
 * Clinical Prescription Lifecycle Management Utilities
 *
 * Provides status configurations, transition rules, optimistic concurrency control (OCC)
 * payload generation, and error parsing for prescription orders.
 */

import { PrescriptionStatus } from '@prisma/client';
import {
  VALID_PRESCRIPTION_STATUS_TRANSITIONS,
  isValidPrescriptionStatusTransition,
} from '@/lib/validations/clinical';

export { PrescriptionStatus };

export interface PrescriptionStatusConfig {
  label: string;
  description: string;
  badgeClasses: {
    bg: string;
    text: string;
    border: string;
    dot: string;
  };
}

export const PRESCRIPTION_STATUS_CONFIGS: Record<
  PrescriptionStatus,
  PrescriptionStatusConfig
> = {
  ACTIVE: {
    label: 'Active',
    description: 'Prescription is active and currently being taken by the patient.',
    badgeClasses: {
      bg: 'bg-emerald-950/80',
      text: 'text-emerald-300',
      border: 'border-emerald-700/60',
      dot: 'bg-emerald-400',
    },
  },
  COMPLETED: {
    label: 'Completed',
    description: 'Course of treatment has finished or medication has been fully taken.',
    badgeClasses: {
      bg: 'bg-teal-950/80',
      text: 'text-teal-300',
      border: 'border-teal-700/60',
      dot: 'bg-teal-400',
    },
  },
  DISCONTINUED: {
    label: 'Discontinued',
    description: 'Medication ceased early by clinician due to clinical reasons or therapy changes.',
    badgeClasses: {
      bg: 'bg-amber-950/80',
      text: 'text-amber-300',
      border: 'border-amber-700/60',
      dot: 'bg-amber-400',
    },
  },
  CANCELLED: {
    label: 'Cancelled',
    description: 'Prescription revoked or voided (e.g. prescribed in error).',
    badgeClasses: {
      bg: 'bg-rose-950/80',
      text: 'text-rose-300',
      border: 'border-rose-700/60',
      dot: 'bg-rose-400',
    },
  },
};

/**
 * Returns the status config for a given prescription status, with safe fallback.
 */
export function getPrescriptionStatusConfig(
  status: PrescriptionStatus | string
): PrescriptionStatusConfig {
  if (status in PRESCRIPTION_STATUS_CONFIGS) {
    return PRESCRIPTION_STATUS_CONFIGS[status as PrescriptionStatus];
  }
  return {
    label: String(status),
    description: 'Unknown prescription status.',
    badgeClasses: {
      bg: 'bg-slate-800/80',
      text: 'text-slate-300',
      border: 'border-slate-700/60',
      dot: 'bg-slate-400',
    },
  };
}

/**
 * Evaluates whether a prescription status transition is permitted,
 * using the backend transition engine as the single source of truth.
 */
export function canTransitionTo(
  currentStatus: PrescriptionStatus,
  targetStatus: PrescriptionStatus
): boolean {
  return isValidPrescriptionStatusTransition(currentStatus, targetStatus);
}

/**
 * Returns the list of permitted target statuses from a given current status.
 */
export function getAllowedTransitions(
  currentStatus: PrescriptionStatus
): readonly PrescriptionStatus[] {
  return VALID_PRESCRIPTION_STATUS_TRANSITIONS[currentStatus] || [];
}

/**
 * Checks whether a prescription status is terminal (cannot transition to any other status).
 */
export function isTerminalPrescriptionStatus(status: PrescriptionStatus): boolean {
  const allowed = VALID_PRESCRIPTION_STATUS_TRANSITIONS[status];
  return !allowed || allowed.length === 0;
}

export interface BuildPrescriptionPatchParams {
  status: PrescriptionStatus;
  expectedVersion?: number | null;
  notes?: string | null;
}

export interface PrescriptionPatchPayload {
  status: PrescriptionStatus;
  expectedVersion?: number;
  notes?: string | null;
}

/**
 * Builds the PATCH payload for a prescription status mutation with optimistic concurrency protection.
 * Enforces positive integer versioning and strictly excludes medication items.
 */
export function buildPrescriptionPatchPayload(
  params: BuildPrescriptionPatchParams
): PrescriptionPatchPayload {
  const payload: PrescriptionPatchPayload = {
    status: params.status,
  };

  if (params.expectedVersion !== undefined && params.expectedVersion !== null) {
    if (
      typeof params.expectedVersion !== 'number' ||
      !Number.isFinite(params.expectedVersion) ||
      !Number.isInteger(params.expectedVersion) ||
      params.expectedVersion < 1
    ) {
      throw new Error(
        `Invalid expectedVersion: ${String(params.expectedVersion)}. Expected version must be a positive integer greater than or equal to 1.`
      );
    }
    payload.expectedVersion = params.expectedVersion;
  }

  if (params.notes !== undefined) {
    if (params.notes === null) {
      payload.notes = null;
    } else {
      const trimmed = params.notes.trim();
      payload.notes = trimmed.length > 0 ? trimmed : null;
    }
  }

  return payload;
}

export interface ParsedPrescriptionApiError {
  isConflict: boolean;
  message: string;
  details?: Record<string, string[]>;
}

/**
 * Safely parses API error responses from prescription endpoints,
 * detecting 409 concurrency conflicts, 400 validation errors, and other HTTP failures.
 */
export function parsePrescriptionApiError(
  status: number,
  data?: unknown
): ParsedPrescriptionApiError {
  const dataObj =
    typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>)
      : undefined;

  const errorMessage =
    typeof dataObj?.error === 'string' && dataObj.error.trim().length > 0
      ? dataObj.error.trim()
      : undefined;

  const details =
    typeof dataObj?.details === 'object' && dataObj.details !== null
      ? (dataObj.details as Record<string, string[]>)
      : undefined;

  if (status === 409) {
    return {
      isConflict: true,
      message:
        errorMessage ||
        'Prescription version conflict: this record was modified concurrently by another user. Please reload.',
    };
  }

  if (status === 400) {
    return {
      isConflict: false,
      message: errorMessage || 'Invalid prescription request or illegal status transition.',
      details,
    };
  }

  if (status === 403) {
    return {
      isConflict: false,
      message: errorMessage || 'Access denied: You do not have permission to modify prescriptions.',
    };
  }

  if (status === 404) {
    return {
      isConflict: false,
      message: errorMessage || 'Prescription record not found in active clinic.',
    };
  }

  return {
    isConflict: false,
    message: errorMessage || 'An unexpected error occurred while processing the prescription.',
  };
}
