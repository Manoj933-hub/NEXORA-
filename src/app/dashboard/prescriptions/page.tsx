'use client';

import React, { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { PrescriptionStatus } from '@prisma/client';
import { PrescriptionStatusBadge } from '@/components/clinical/prescription-status-badge';

export interface PrescriptionItemMedication {
  id: string;
  prescriptionId: string;
  medicationName: string;
  strength?: string | null;
  route?: string | null;
  frequency: string;
  duration: string;
  quantity?: string | null;
  instructions?: string | null;
}

export interface PrescriptionListItem {
  id: string;
  clinicId: string;
  consultationId: string;
  patientId: string;
  doctorId: string;
  status: PrescriptionStatus;
  notes?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  patient: {
    id: string;
    mrn: string;
    name: string;
    gender?: string | null;
    dateOfBirth?: string | null;
  };
  doctor: {
    id: string;
    name: string;
    email: string;
  };
  items: PrescriptionItemMedication[];
}

export type StatusFilterOption = 'ALL' | PrescriptionStatus;

/**
 * Formats medication summary into a human-readable display structure.
 */
export function formatMedicationSummary(items: PrescriptionItemMedication[]): {
  primary: string;
  subtext: string;
  moreCount: number;
} {
  if (!items || items.length === 0) {
    return {
      primary: 'No medications listed',
      subtext: 'No clinical line items attached',
      moreCount: 0,
    };
  }

  const primaryItem = items[0];
  const primary = primaryItem.strength
    ? `${primaryItem.medicationName} ${primaryItem.strength}`
    : primaryItem.medicationName;

  const subtextParts = [primaryItem.frequency, primaryItem.duration, primaryItem.route].filter(
    (part): part is string => Boolean(part && part.trim().length > 0)
  );

  const subtext = subtextParts.length > 0 ? subtextParts.join(' • ') : 'Standard regimen';
  const moreCount = Math.max(0, items.length - 1);

  return {
    primary,
    subtext,
    moreCount,
  };
}

/**
 * Pure client-side filtering helper for prescriptions by status and text query.
 * Matches patient name, MRN, medication name, or prescribing doctor name.
 */
export function filterPrescriptions(
  prescriptions: PrescriptionListItem[],
  query: string,
  statusFilter: StatusFilterOption = 'ALL'
): PrescriptionListItem[] {
  const trimmed = query.toLowerCase().trim();
  const normalizedStatus = statusFilter.toUpperCase();

  return prescriptions.filter((rx) => {
    // 1. Status Filter
    if (normalizedStatus !== 'ALL' && rx.status !== normalizedStatus) {
      return false;
    }

    // 2. Query Search
    if (!trimmed) {
      return true;
    }

    const patientName = rx.patient?.name?.toLowerCase() || '';
    const mrn = rx.patient?.mrn?.toLowerCase() || '';
    const doctorName = rx.doctor?.name?.toLowerCase() || '';
    const medicationMatch = rx.items?.some((item) =>
      item.medicationName?.toLowerCase().includes(trimmed)
    );

    return (
      patientName.includes(trimmed) ||
      mrn.includes(trimmed) ||
      doctorName.includes(trimmed) ||
      medicationMatch
    );
  });
}

function formatDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

export interface PrescriptionDirectoryViewProps {
  prescriptions: PrescriptionListItem[];
  loading: boolean;
  error: string | null;
  statusFilter: StatusFilterOption;
  searchQuery: string;
  patientId?: string | null;
  onStatusFilterChange: (status: StatusFilterOption) => void;
  onSearchQueryChange: (query: string) => void;
  onClearFilters: () => void;
  onRefresh: () => void;
}

export function PrescriptionDirectoryView({
  prescriptions,
  loading,
  error,
  statusFilter,
  searchQuery,
  patientId,
  onStatusFilterChange,
  onSearchQueryChange,
  onClearFilters,
  onRefresh,
}: PrescriptionDirectoryViewProps) {
  const filtered = useMemo(
    () => filterPrescriptions(prescriptions, searchQuery, statusFilter),
    [prescriptions, searchQuery, statusFilter]
  );

  const statusTabs: { label: string; value: StatusFilterOption }[] = [
    { label: 'All Orders', value: 'ALL' },
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Discontinued', value: 'DISCONTINUED' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];

  // Derive patient name if filtered by patientId
  const activePatientName = useMemo(() => {
    if (!patientId || prescriptions.length === 0) return null;
    const match = prescriptions.find((p) => p.patientId === patientId);
    return match ? `${match.patient.name} (${match.patient.mrn})` : null;
  }, [patientId, prescriptions]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-800 text-[11px] font-semibold">
              Pharmacy &amp; Prescriptions
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Prescription Directory</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitor clinical medication orders, track therapy lifecycle states, and review patient prescriptions.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh prescriptions"
            className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition disabled:opacity-50"
            title="Refresh prescriptions"
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin text-teal-400' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Patient Filter Active Banner */}
      {patientId && (
        <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-cyan-200">
            <svg className="w-4 h-4 shrink-0 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span>
              Filtered for patient:{' '}
              <strong className="text-white font-semibold">
                {activePatientName || patientId}
              </strong>
            </span>
          </div>
          <Link
            href="/dashboard/prescriptions"
            className="px-3 py-1 rounded-md bg-cyan-900/50 hover:bg-cyan-900 text-cyan-300 font-medium text-[11px] border border-cyan-700/50 transition w-fit"
          >
            Clear Patient Filter
          </Link>
        </div>
      )}

      {/* Controls: Search and Status Filters */}
      <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <label htmlFor="prescription-search" className="sr-only">
            Search prescriptions
          </label>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            id="prescription-search"
            type="text"
            placeholder="Search by patient name, MRN, or medication..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full pl-9 pr-9 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchQueryChange('')}
              aria-label="Clear search query"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div
          role="tablist"
          aria-label="Filter by prescription status"
          className="flex flex-wrap items-center gap-1.5"
        >
          {statusTabs.map((tab) => {
            const isActive = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                role="tab"
                aria-selected={isActive}
                onClick={() => onStatusFilterChange(tab.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  isActive
                    ? 'bg-teal-500 text-slate-950 shadow-sm shadow-teal-500/20'
                    : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-850 border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-start justify-between gap-3 text-xs text-rose-200">
          <div className="flex items-start gap-2.5">
            <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <p className="font-semibold text-rose-100">Unable to load prescriptions</p>
              <p className="text-rose-300/90 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            onClick={onRefresh}
            className="px-3 py-1 rounded bg-rose-900/60 hover:bg-rose-900 text-white font-medium transition text-xs shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Content Area */}
      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden divide-y divide-slate-800">
          {[1, 2, 3, 4, 5].map((idx) => (
            <div key={idx} className="p-4 flex items-center justify-between gap-4 animate-pulse">
              <div className="space-y-2 flex-1">
                <div className="h-4 w-44 bg-slate-800 rounded" />
                <div className="h-3 w-28 bg-slate-850 rounded" />
              </div>
              <div className="space-y-2 flex-1 hidden md:block">
                <div className="h-4 w-40 bg-slate-800 rounded" />
                <div className="h-3 w-32 bg-slate-850 rounded" />
              </div>
              <div className="h-6 w-20 bg-slate-800 rounded-full" />
              <div className="h-8 w-16 bg-slate-800 rounded-lg" />
            </div>
          ))}
        </div>
      ) : prescriptions.length === 0 && !error ? (
        /* Empty Clinic Directory */
        <div className="p-12 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/20">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/60 flex items-center justify-center text-slate-400 mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-white">No Prescriptions Found</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {patientId
              ? 'There are no prescription records for this patient in the active clinic.'
              : statusFilter !== 'ALL'
              ? `No prescriptions found with status "${statusFilter}".`
              : 'Prescriptions generated during clinical consultations will appear here automatically.'}
          </p>
          {(patientId || statusFilter !== 'ALL') && (
            <button
              onClick={onClearFilters}
              className="mt-4 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-teal-300 border border-slate-700 transition"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : filtered.length === 0 && !error ? (
        /* No Search Matches */
        <div className="p-10 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/20">
          <p className="text-sm font-semibold text-white">No Matching Prescriptions</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            No orders match &quot;{searchQuery}&quot;
            {statusFilter !== 'ALL' ? ` with status ${statusFilter}` : ''}.
          </p>
          <button
            onClick={onClearFilters}
            className="mt-4 px-3.5 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-xs font-semibold text-slate-300 border border-slate-700 transition"
          >
            Clear Search &amp; Filters
          </button>
        </div>
      ) : (
        /* Prescription Table */
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" aria-label="Prescriptions directory table">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th scope="col" className="px-4 py-3">Patient</th>
                  <th scope="col" className="px-4 py-3">Medication &amp; Regimen</th>
                  <th scope="col" className="px-4 py-3 hidden md:table-cell">Prescribed By</th>
                  <th scope="col" className="px-4 py-3 hidden sm:table-cell">Issue Date</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((rx) => {
                  const medSummary = formatMedicationSummary(rx.items);
                  return (
                    <tr
                      key={rx.id}
                      className="hover:bg-slate-850/40 transition-colors group"
                    >
                      {/* Patient */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-white">
                          {rx.patient.name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          MRN: {rx.patient.mrn}
                        </div>
                      </td>

                      {/* Medication Summary */}
                      <td className="px-4 py-3.5 max-w-xs sm:max-w-md">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-slate-100">
                            {medSummary.primary}
                          </span>
                          {medSummary.moreCount > 0 && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700"
                              title={`${medSummary.moreCount} additional medication item(s) on this order`}
                            >
                              {`+${medSummary.moreCount} more`}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                          {medSummary.subtext}
                        </div>
                      </td>

                      {/* Prescribing Doctor */}
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <div className="font-medium text-slate-200">
                          {rx.doctor.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                          {rx.doctor.email}
                        </div>
                      </td>

                      {/* Issue Date */}
                      <td className="px-4 py-3.5 hidden sm:table-cell text-slate-300 whitespace-nowrap">
                        {formatDate(rx.createdAt)}
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <PrescriptionStatusBadge status={rx.status} size="sm" />
                      </td>

                      {/* Detail Link Action */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <Link
                          href={`/dashboard/prescriptions/${rx.id}`}
                          aria-label={`View prescription details for ${rx.patient.name}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 hover:border-slate-600 font-medium text-xs transition"
                        >
                          <span>View</span>
                          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-slate-800 bg-slate-950/40 text-[11px] text-slate-400 flex items-center justify-between">
            <span>
              Showing {filtered.length} of {prescriptions.length} order{prescriptions.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function PrescriptionDirectoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get('patientId');

  const [prescriptions, setPrescriptions] = useState<PrescriptionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshCounter, setRefreshCounter] = useState(0);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setRefreshCounter((prev) => prev + 1);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('ALL');
    if (patientId) {
      router.push('/dashboard/prescriptions');
    }
  }, [patientId, router]);

  useEffect(() => {
    let ignore = false;

    async function fetchPrescriptions() {
      try {
        const params = new URLSearchParams();
        if (patientId) {
          params.set('patientId', patientId);
        }
        if (statusFilter !== 'ALL') {
          params.set('status', statusFilter);
        }

        const url = `/api/prescriptions${params.toString() ? `?${params.toString()}` : ''}`;
        const res = await fetch(url);

        if (!res.ok) {
          if (res.status === 403) {
            throw new Error('Access restricted: Clinical records require Doctor, Admin, or Owner permissions.');
          }
          if (res.status === 404) {
            throw new Error('Patient not found in active clinic.');
          }
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error || 'Failed to load prescriptions from clinic.');
        }

        const data = await res.json();
        if (!ignore) {
          setPrescriptions(data.prescriptions || []);
          setError(null);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    fetchPrescriptions();

    return () => {
      ignore = true;
    };
  }, [patientId, statusFilter, refreshCounter]);

  return (
    <PrescriptionDirectoryView
      prescriptions={prescriptions}
      loading={loading}
      error={error}
      statusFilter={statusFilter}
      searchQuery={searchQuery}
      patientId={patientId}
      onStatusFilterChange={setStatusFilter}
      onSearchQueryChange={setSearchQuery}
      onClearFilters={handleClearFilters}
      onRefresh={handleRefresh}
    />
  );
}

function PrescriptionDirectorySkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 w-64 bg-slate-800 rounded" />
      <div className="h-12 bg-slate-900 rounded-xl" />
      <div className="h-64 bg-slate-900/40 rounded-xl" />
    </div>
  );
}

export default function PrescriptionDirectoryPage() {
  return (
    <Suspense fallback={<PrescriptionDirectorySkeleton />}>
      <PrescriptionDirectoryContent />
    </Suspense>
  );
}
