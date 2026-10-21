'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RoleBadge } from './role-badge';
import type { ClinicRole } from '@/lib/auth/permissions';

interface ClinicSummary {
  id: string;
  name: string;
  slug: string;
  country: string;
  currency: string;
  role: ClinicRole | string;
}

interface HeaderProps {
  userName?: string;
  userEmail?: string;
  activeClinic?: ClinicSummary | null;
  clinics?: ClinicSummary[];
  onToggleMobileMenu?: () => void;
}

export function Header({
  userName = 'Doctor',
  userEmail = '',
  activeClinic,
  clinics = [],
  onToggleMobileMenu,
}: HeaderProps) {
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleSwitchClinic(clinicId: string) {
    if (activeClinic?.id === clinicId) {
      setDropdownOpen(false);
      return;
    }
    setSwitching(true);
    try {
      const res = await fetch('/api/auth/switch-clinic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId }),
      });
      if (res.ok) {
        setDropdownOpen(false);
        router.refresh();
        window.location.reload();
      } else {
        alert('Failed to switch clinic');
      }
    } catch {
      alert('Network error switching clinic');
    } finally {
      setSwitching(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    }
  }

  return (
    <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Left: Mobile Toggle & Clinic Switcher */}
      <div className="flex items-center gap-3">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none"
            aria-label="Toggle navigation menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        {/* Quick Clinic Switcher dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-slate-700 text-left transition"
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-xs sm:text-sm font-semibold text-white max-w-[140px] sm:max-w-[200px] truncate">
              {activeClinic ? activeClinic.name : 'Select Clinic'}
            </span>
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 mt-2 w-72 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl z-50 p-2">
              <div className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                Your Clinic Memberships ({clinics.length})
              </div>
              <div className="max-h-60 overflow-y-auto py-1 space-y-1">
                {clinics.map((c) => {
                  const isCurrent = c.id === activeClinic?.id;
                  return (
                    <button
                      key={c.id}
                      disabled={switching}
                      onClick={() => handleSwitchClinic(c.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition ${
                        isCurrent
                          ? 'bg-teal-950/70 text-teal-300 border border-teal-800/60'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="font-semibold text-white truncate">{c.name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {c.country === 'NP' ? '🇳🇵 Nepal (NPR)' : '🇮🇳 India (INR)'}
                        </div>
                      </div>
                      <RoleBadge role={c.role} size="sm" />
                    </button>
                  );
                })}
              </div>
              <div className="pt-2 border-t border-slate-800 mt-1">
                <Link
                  href="/onboarding"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-lg text-xs font-medium text-teal-400 hover:bg-teal-950/40 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Register New Clinic
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: User Profile & Logout */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex flex-col text-right">
          <span className="text-xs font-semibold text-slate-200">{userName}</span>
          <span className="text-[11px] text-slate-400 truncate max-w-[150px]">{userEmail}</span>
        </div>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 border border-slate-700 transition"
          title="Sign out of current session"
        >
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="hidden sm:inline">{loggingOut ? 'Signing out...' : 'Logout'}</span>
        </button>
      </div>
    </header>
  );
}
