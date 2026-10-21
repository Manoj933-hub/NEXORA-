'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { RoleBadge } from '@/components/dashboard/role-badge';
import type { ClinicRole } from '@/lib/auth/permissions';

interface ClinicDetails {
  id: string;
  name: string;
  slug: string;
  country: string;
  currency: string;
  phone?: string | null;
  address?: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ProfileResponse {
  clinic: ClinicDetails;
  membership: {
    role: ClinicRole;
    isActive: boolean;
    joinedAt: string;
  };
  stats: {
    totalActiveMembers: number;
  };
}

export default function DashboardHomePage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadActiveClinic() {
      try {
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) throw new Error('Failed to load session');
        const meData = await meRes.json();

        if (!meData.activeClinic?.id) {
          setError('No active clinic resolved.');
          setLoading(false);
          return;
        }

        const clinicRes = await fetch(`/api/clinics/${meData.activeClinic.id}`);
        if (!clinicRes.ok) throw new Error('Failed to load clinic details');
        const clinicData = await clinicRes.json();

        setProfile(clinicData);
      } catch (err) {
        console.error('Error fetching dashboard profile:', err);
        setError('Unable to load clinic details.');
      } finally {
        setLoading(false);
      }
    }

    loadActiveClinic();
  }, []);

  if (loading) {
    return (
      <div className="py-12 flex justify-center items-center">
        <div className="w-8 h-8 border-3 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-6 rounded-xl bg-red-950/40 border border-red-800 text-red-200">
        <div className="font-semibold text-base">Error Loading Dashboard</div>
        <p className="text-sm mt-1 text-red-300">{error || 'Clinic profile not available'}</p>
        <Link
          href="/select-clinic"
          className="mt-4 inline-block px-4 py-2 rounded-lg bg-red-900/60 hover:bg-red-800 text-xs font-semibold text-white transition"
        >
          Select Another Clinic
        </Link>
      </div>
    );
  }

  const { clinic, membership, stats } = profile;
  const isOwnerOrAdmin = membership.role === 'OWNER' || membership.role === 'ADMIN';

  return (
    <div className="space-y-8">
      {/* Top Banner / Welcome */}
      <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-teal-950/40 border border-slate-800 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 text-xs text-slate-300 font-medium mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Active Clinic Context
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {clinic.name}
          </h1>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            {clinic.country === 'NP' ? 'Federal Democratic Republic of Nepal' : 'Republic of India'} • Standard Currency: <span className="text-teal-300 font-mono font-medium">{clinic.currency}</span>
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <RoleBadge role={membership.role} size="md" />
            <span className="text-xs text-slate-400">
              Joined {new Date(membership.joinedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics & Operational Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Active Members</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.totalActiveMembers}</div>
          <div className="text-xs text-teal-400 mt-2">Verified Clinic Staff</div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Region / Market</div>
          <div className="text-2xl font-bold text-white mt-1">
            {clinic.country === 'NP' ? 'Nepal (NP)' : 'India (IN)'}
          </div>
          <div className="text-xs text-slate-400 mt-2">Currency: {clinic.currency}</div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Clinic Status</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            {clinic.isActive ? 'Active' : 'Deactivated'}
          </div>
          <div className="text-xs text-slate-400 mt-2">Tenant ID: {clinic.id.slice(0, 8)}...</div>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Contact Info</div>
          <div className="text-sm font-semibold text-white mt-2 truncate">
            {clinic.phone || 'No phone set'}
          </div>
          <div className="text-xs text-slate-400 mt-1 truncate">
            {clinic.address || 'No address configured'}
          </div>
        </div>
      </div>

      {/* Fast Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Patients Directory */}
        <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-teal-950 text-teal-300 border border-teal-800/60 flex items-center justify-center mb-4">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="font-bold text-white text-lg">Patient Directory</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Register new patients, view demographic profiles, search by MRN or phone, and manage medical notes.
            </p>
          </div>
          <div className="mt-6 flex items-center gap-2">
            <Link
              href="/dashboard/patients"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md shadow-teal-500/20 transition"
            >
              Open Patients
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/dashboard/patients/new"
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition"
            >
              + Register
            </Link>
          </div>
        </div>

        {/* Card 2: Appointments & Queue */}
        <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-sky-950 text-sky-300 border border-sky-800/60 flex items-center justify-center mb-4">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-bold text-white text-lg">Intake &amp; Queue</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Track today&apos;s arrivals in the lobby, perform fast check-ins, call patients into consultation, and complete visits.
            </p>
          </div>
          <div className="mt-6 flex items-center gap-2">
            <Link
              href="/dashboard/queue"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-md shadow-sky-500/20 transition"
            >
              Live Queue
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="/dashboard/appointments/new"
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition"
            >
              + Book Slot
            </Link>
          </div>
        </div>

        {/* Card 3: Clinic Configuration */}
        <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-lg bg-indigo-950 text-indigo-300 border border-indigo-800/60 flex items-center justify-center mb-4">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="font-bold text-white text-lg">Clinic Workspace</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Configure clinic profile, switch active practice organization, and inspect regional currency and tax settings.
            </p>
          </div>
          <div className="mt-6 flex items-center gap-2">
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition"
            >
              {isOwnerOrAdmin ? 'Edit Settings' : 'View Settings'}
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
