import React from 'react';
import { ClinicRole } from '@/lib/auth/permissions';

interface RoleBadgeProps {
  role: ClinicRole | string;
  size?: 'sm' | 'md';
}

const ROLE_STYLES: Record<
  ClinicRole,
  { label: string; bg: string; text: string; border: string }
> = {
  OWNER: {
    label: 'Clinic Owner',
    bg: 'bg-emerald-950/80',
    text: 'text-emerald-400',
    border: 'border-emerald-700/50',
  },
  ADMIN: {
    label: 'Administrator',
    bg: 'bg-purple-950/80',
    text: 'text-purple-300',
    border: 'border-purple-700/50',
  },
  DOCTOR: {
    label: 'Doctor / Physician',
    bg: 'bg-sky-950/80',
    text: 'text-sky-300',
    border: 'border-sky-700/50',
  },
  RECEPTIONIST: {
    label: 'Reception Desk',
    bg: 'bg-amber-950/80',
    text: 'text-amber-300',
    border: 'border-amber-700/50',
  },
  STAFF: {
    label: 'Support Staff',
    bg: 'bg-slate-800/80',
    text: 'text-slate-300',
    border: 'border-slate-700/50',
  },
};

export function RoleBadge({ role, size = 'sm' }: RoleBadgeProps) {
  const roleKey = role as ClinicRole;
  const config = ROLE_STYLES[roleKey] || {
    label: role,
    bg: 'bg-slate-800',
    text: 'text-slate-300',
    border: 'border-slate-700',
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${config.bg} ${config.text} ${config.border} ${sizeClasses}`}
      title={`Role: ${config.label}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
}
