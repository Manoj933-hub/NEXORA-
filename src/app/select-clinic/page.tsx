'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RoleBadge } from '@/components/dashboard/role-badge';
import type { ClinicRole } from '@/lib/auth/permissions';

interface ClinicItem {
  id: string;
  name: string;
  slug: string;
  country: string;
  currency: string;
  phone?: string | null;
  address?: string | null;
  role: ClinicRole | string;
  joinedAt?: string;
}

export default function SelectClinicPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [clinics, setClinics] = useState<ClinicItem[]>([]);
  const [activeClinicId, setActiveClinicId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUserClinics() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        if (!res.ok) {
          throw new Error('Failed to load session');
        }
        const data = await res.json();
        setUserName(data.user?.name || 'Doctor');
        setActiveClinicId(data.activeClinic?.id || null);
        setClinics(data.clinics || []);
      } catch (err) {
        console.error('Error fetching clinics:', err);
        setError('Failed to load your clinic memberships. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    fetchUserClinics();
  }, [router]);

  async function handleSelectClinic(clinicId: string) {
    if (clinicId === activeClinicId) {
      router.push('/dashboard');
      return;
    }

    setSwitchingId(clinicId);
    setError(null);

    try {
      const res = await fetch('/api/auth/switch-clinic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to switch active clinic.');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      console.error('Error switching clinic:', err);
      setError('A network error occurred while switching clinics.');
    } finally {
      setSwitchingId(null);
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 sm:px-6 py-12">
      <div className="w-full max-w-2xl">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center font-black text-slate-950 text-xl shadow-lg shadow-teal-500/20">
              N
            </div>
            <span className="font-bold text-2xl text-white tracking-tight">NEXORA</span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Select Practice Workspace
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
            {userName ? `Welcome, ${userName}. ` : ''}
            Choose which clinic or hospital workspace you want to access for this session.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="p-12 rounded-2xl bg-slate-900/50 border border-slate-800 text-center flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-3 border-teal-500/30 border-t-teal-400 rounded-full animate-spin mb-3" />
            <span className="text-xs text-slate-400">Loading your clinic memberships...</span>
          </div>
        ) : clinics.length === 0 ? (
          /* Empty State */
          <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-base text-white">No Clinic Organizations Found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                You do not currently hold membership in any active clinic. Set up your practice to get started.
              </p>
            </div>
            <div>
              <Link
                href="/onboarding"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 transition"
              >
                Register Your Clinic
              </Link>
            </div>
          </div>
        ) : (
          /* Clinics List */
          <div className="space-y-3">
            {clinics.map((clinic) => {
              const isActive = clinic.id === activeClinicId;
              const isSwitching = switchingId === clinic.id;

              return (
                <div
                  key={clinic.id}
                  className={`p-5 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-slate-900/90 border-teal-500/50 shadow-lg shadow-teal-950/20'
                      : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="font-bold text-base text-white">{clinic.name}</span>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                            Current Active
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span>{clinic.country === 'NP' ? '🇳🇵 Nepal' : '🇮🇳 India'}</span>
                        <span>•</span>
                        <span className="font-mono text-slate-300">{clinic.currency}</span>
                        {clinic.phone && (
                          <>
                            <span>•</span>
                            <span>{clinic.phone}</span>
                          </>
                        )}
                      </div>
                      <div className="pt-1">
                        <RoleBadge role={clinic.role} size="sm" />
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      <button
                        onClick={() => handleSelectClinic(clinic.id)}
                        disabled={isSwitching}
                        className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 ${
                          isActive
                            ? 'bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40'
                            : 'bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md shadow-teal-500/20'
                        } disabled:opacity-50`}
                      >
                        {isSwitching ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Switching...
                          </>
                        ) : isActive ? (
                          <>
                            Enter Dashboard
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </>
                        ) : (
                          <>
                            Select & Switch
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Bottom Actions */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
              <Link
                href="/onboarding"
                className="inline-flex items-center gap-1.5 text-teal-400 hover:text-teal-300 font-medium transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Register Another Clinic
              </Link>

              <button
                onClick={handleLogout}
                className="text-slate-500 hover:text-slate-300 transition"
              >
                Sign out of account
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
