import React from 'react';
import {
  type PrescriptionStatus,
  getPrescriptionStatusConfig,
} from '@/lib/clinical/prescription-lifecycle';

export interface PrescriptionStatusBadgeProps {
  status: PrescriptionStatus | string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Accessible status badge for prescriptions.
 * Renders distinct color tokens, an indicator dot, and explicit text to ensure
 * accessibility for color-blind users and screen readers.
 */
export function PrescriptionStatusBadge({
  status,
  size = 'sm',
  className = '',
}: PrescriptionStatusBadgeProps) {
  const config = getPrescriptionStatusConfig(status);
  const sizeClasses =
    size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold rounded-full border transition-colors select-none ${config.badgeClasses.bg} ${config.badgeClasses.text} ${config.badgeClasses.border} ${sizeClasses} ${className}`}
      title={`Prescription Status: ${config.label} — ${config.description}`}
      aria-label={`Prescription status: ${config.label}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.badgeClasses.dot}`}
        aria-hidden="true"
      />
      <span>{config.label}</span>
    </span>
  );
}
