import React from 'react';
import type { InvoiceStatus } from '@/lib/validations/billing';

export interface InvoiceStatusConfig {
  label: string;
  description: string;
  badgeClasses: {
    bg: string;
    text: string;
    border: string;
    dot: string;
  };
}

export const INVOICE_STATUS_CONFIGS: Record<InvoiceStatus, InvoiceStatusConfig> = {
  DRAFT: {
    label: 'Draft',
    description: 'Unissued invoice draft',
    badgeClasses: {
      bg: 'bg-slate-800/80',
      text: 'text-slate-300',
      border: 'border-slate-700',
      dot: 'bg-slate-400',
    },
  },
  ISSUED: {
    label: 'Issued',
    description: 'Issued and awaiting payment',
    badgeClasses: {
      bg: 'bg-sky-950/60',
      text: 'text-sky-300',
      border: 'border-sky-800/80',
      dot: 'bg-sky-400',
    },
  },
  PARTIALLY_PAID: {
    label: 'Partially Paid',
    description: 'Partial payment received',
    badgeClasses: {
      bg: 'bg-amber-950/60',
      text: 'text-amber-300',
      border: 'border-amber-800/80',
      dot: 'bg-amber-400',
    },
  },
  PAID: {
    label: 'Paid',
    description: 'Fully settled invoice',
    badgeClasses: {
      bg: 'bg-emerald-950/60',
      text: 'text-emerald-300',
      border: 'border-emerald-800/80',
      dot: 'bg-emerald-400',
    },
  },
  VOID: {
    label: 'Void',
    description: 'Voided unpaid invoice',
    badgeClasses: {
      bg: 'bg-rose-950/60',
      text: 'text-rose-300',
      border: 'border-rose-800/80',
      dot: 'bg-rose-400',
    },
  },
  REFUNDED: {
    label: 'Refunded',
    description: 'Refunded invoice',
    badgeClasses: {
      bg: 'bg-purple-950/60',
      text: 'text-purple-300',
      border: 'border-purple-800/80',
      dot: 'bg-purple-400',
    },
  },
};

export function getInvoiceStatusConfig(status: InvoiceStatus | string): InvoiceStatusConfig {
  const normalized = (status || '').toUpperCase() as InvoiceStatus;
  return (
    INVOICE_STATUS_CONFIGS[normalized] || {
      label: status || 'Unknown',
      description: 'Unknown invoice status',
      badgeClasses: {
        bg: 'bg-slate-800/60',
        text: 'text-slate-400',
        border: 'border-slate-700',
        dot: 'bg-slate-500',
      },
    }
  );
}

export interface InvoiceStatusBadgeProps {
  status: InvoiceStatus | string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Accessible status badge for invoices.
 * Renders distinct color tokens, an indicator dot, and explicit text to ensure
 * accessibility for color-blind users and screen readers.
 */
export function InvoiceStatusBadge({
  status,
  size = 'sm',
  className = '',
}: InvoiceStatusBadgeProps) {
  const config = getInvoiceStatusConfig(status);
  const sizeClasses =
    size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold rounded-full border transition-colors select-none ${config.badgeClasses.bg} ${config.badgeClasses.text} ${config.badgeClasses.border} ${sizeClasses} ${className}`}
      title={`Invoice Status: ${config.label} — ${config.description}`}
      aria-label={`Invoice status: ${config.label}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.badgeClasses.dot}`}
        aria-hidden="true"
      />
      <span>{config.label}</span>
    </span>
  );
}
