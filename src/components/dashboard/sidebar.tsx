'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClinicRole, hasPermission } from '@/lib/auth/permissions';
import { RoleBadge } from './role-badge';

interface SidebarProps {
  clinicName?: string;
  clinicCountry?: string;
  role?: ClinicRole | string;
  onCloseMobile?: () => void;
}

export function Sidebar({
  clinicName = 'NEXORA Clinic',
  clinicCountry = 'IN',
  role = ClinicRole.STAFF,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const roleKey = role as ClinicRole;

  const canUpdateClinic = hasPermission(roleKey, 'clinic:update');
  const canAccessPatients = hasPermission(roleKey, 'patients:read');
  const canAccessAppointments = hasPermission(roleKey, 'reception:appointments:manage');
  const canAccessQueue = hasPermission(roleKey, 'reception:queue:manage');
  const canAccessClinical = hasPermission(roleKey, 'clinical:records:read');
  const canAccessBilling = hasPermission(roleKey, 'patients:read');
  const canManageMembers = hasPermission(roleKey, 'members:manage');

  const navItems = [
    {
      name: 'Overview',
      href: '/dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
      allowed: true,
      badge: null,
    },
    {
      name: 'Patients',
      href: '/dashboard/patients',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      allowed: canAccessPatients,
      badge: null,
    },
    {
      name: 'Appointments',
      href: '/dashboard/appointments',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      allowed: canAccessAppointments,
      badge: null,
    },
    {
      name: 'Patient Intake & Queue',
      href: '/dashboard/queue',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      allowed: canAccessQueue,
      badge: null,
    },
    {
      name: 'Clinical Records',
      href: '/dashboard/records',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      allowed: canAccessClinical,
      badge: null,
    },
    {
      name: 'Prescriptions',
      href: '/dashboard/prescriptions',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
      ),
      allowed: canAccessClinical,
      badge: null,
    },
    {
      name: 'Billing & Invoices',
      href: '/dashboard/billing',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z"
          />
        </svg>
      ),
      allowed: canAccessBilling,
      badge: null,
    },
    {
      name: 'Communications',
      href: '/dashboard/communications',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      ),
      allowed: canAccessPatients,
      badge: null,
    },
    {
      name: 'Clinic Profile',
      href: '/dashboard/settings',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      allowed: canUpdateClinic,
      badge: canUpdateClinic ? null : 'Owner / Admin',
    },
    {
      name: 'Staff & Members',
      href: '#members',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      allowed: canManageMembers,
      badge: canManageMembers ? 'Task 005' : 'Admin only',
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full select-none">
      {/* Brand & Clinic Identifier */}
      <div className="p-5 border-b border-slate-800">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center font-black text-slate-950 text-base shadow-md shadow-teal-500/20">
            N
          </div>
          <div>
            <div className="font-bold text-lg text-white leading-none">NEXORA</div>
            <div className="text-[10px] text-teal-400 font-medium tracking-wider uppercase mt-1">
              Clinical Platform
            </div>
          </div>
        </Link>

        {/* Active Clinic Summary */}
        <div className="mt-4 p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Active Clinic</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
              {clinicCountry === 'NP' ? '🇳🇵 NP' : '🇮🇳 IN'}
            </span>
          </div>
          <div className="font-semibold text-sm text-slate-100 truncate mt-1" title={clinicName}>
            {clinicName}
          </div>
          <div className="mt-2">
            <RoleBadge role={role} size="sm" />
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
          Clinic Workspace
        </div>
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' &&
              !item.href.startsWith('#') &&
              Boolean(pathname && pathname.startsWith(`${item.href}/`)));
          const isAccessible = item.allowed;

          if (!isAccessible) {
            return (
              <div
                key={item.name}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-500 bg-slate-900/30 border border-transparent cursor-not-allowed"
                title={`Requires permission not held by your current role (${role})`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-600">{item.icon}</span>
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700/60 font-mono">
                    {item.badge}
                  </span>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onCloseMobile}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={isActive ? 'text-teal-400' : 'text-slate-400'}>{item.icon}</span>
                <span>{item.name}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Switcher & Onboarding Quick Links */}
      <div className="p-4 border-t border-slate-800 space-y-2">
        <Link
          href="/select-clinic"
          onClick={onCloseMobile}
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-slate-600 transition"
        >
          <svg className="w-4 h-4 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          Switch Clinic
        </Link>
        <Link
          href="/onboarding"
          onClick={onCloseMobile}
          className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium bg-teal-950/60 hover:bg-teal-900/60 text-teal-300 border border-teal-800/60 hover:border-teal-700 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Another Clinic
        </Link>
      </div>
    </aside>
  );
}
