'use client';

import React, { useEffect, useState, use, useCallback } from 'react';
import Link from 'next/link';
import { PrescriptionStatus, ClinicRole } from '@prisma/client';
import { hasPermission } from '@/lib/auth/permissions';
import { PrescriptionStatusBadge } from '@/components/clinical/prescription-status-badge';
import {
  PrescriptionStatusModal,
  type AllowedTargetStatus,
  type PrescriptionUpdatedRecord,
} from '@/components/clinical/prescription-status-modal';

export interface PrescriptionDetailItem {
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

export interface PrescriptionDetailData {
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
    phone?: string | null;
    bloodGroup?: string | null;
    allergies?: string | null;
    address?: string | null;
  };
  doctor: {
    id: string;
    name: string;
    email: string;
  };
  items: PrescriptionDetailItem[];
}

function formatDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

/**
 * Resolves the authenticated user's ClinicRole within the active clinic
 * by matching the active clinic ID against membership records from /api/auth/me.
 */
export function resolveUserClinicRole(authData: unknown): ClinicRole | null {
  if (!authData || typeof authData !== 'object') return null;
  const data = authData as {
    activeClinic?: { id?: string } | null;
    clinics?: Array<{ id?: string; role?: string }>;
  };
  const activeClinicId = data.activeClinic?.id;
  if (!activeClinicId || !Array.isArray(data.clinics)) return null;
  const membership = data.clinics.find(
    (c) => Boolean(c && typeof c === 'object' && c.id === activeClinicId)
  );
  if (!membership?.role) return null;
  const role = membership.role as ClinicRole;
  if (['OWNER', 'ADMIN', 'DOCTOR', 'NURSE', 'STAFF'].includes(role)) {
    return role;
  }
  return null;
}

export interface PrescriptionDetailViewProps {
  prescription: PrescriptionDetailData | null;
  loading: boolean;
  isRefreshing?: boolean;
  error: string | null;
  userRole?: ClinicRole | string | null;
  onRefresh: () => void;
  onReloadLatest?: () => Promise<PrescriptionDetailData | null>;
  onStatusUpdated: (updated: PrescriptionDetailData) => void;
  fetchFn?: typeof fetch;
}

export function PrescriptionDetailView({
  prescription,
  loading,
  isRefreshing = false,
  error,
  userRole,
  onRefresh,
  onReloadLatest,
  onStatusUpdated,
  fetchFn,
}: PrescriptionDetailViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<AllowedTargetStatus>('COMPLETED');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const canWrite = Boolean(
    userRole && hasPermission(userRole as ClinicRole, 'clinical:records:write')
  );

  function openActionModal(status: AllowedTargetStatus) {
    setTargetStatus(status);
    setModalOpen(true);
  }

  function handleSuccess(updated: PrescriptionUpdatedRecord) {
    if (prescription) {
      onStatusUpdated({
        ...prescription,
        ...updated,
        status: updated.status,
        version: updated.version,
        notes: updated.notes !== undefined ? updated.notes : prescription.notes,
        doctor: {
          ...prescription.doctor,
          ...((updated as unknown as { doctor?: Partial<PrescriptionDetailData['doctor']> }).doctor || {}),
        },
      } as PrescriptionDetailData);
    }
    setToastMessage(`Prescription successfully updated to ${updated.status}.`);
    setTimeout(() => setToastMessage(null), 4000);
  }

  if (loading && !prescription) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto py-8 animate-pulse">
        <div className="h-6 w-36 bg-slate-800 rounded" />
        <div className="h-10 w-80 bg-slate-800 rounded" />
        <div className="h-44 bg-slate-900 rounded-2xl" />
        <div className="h-64 bg-slate-900 rounded-2xl" />
      </div>
    );
  }

  if (error || !prescription) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="p-6 rounded-2xl bg-rose-950/40 border border-rose-800/80 text-rose-200 space-y-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h2 className="text-base font-bold text-rose-100">Prescription Error</h2>
              <p className="text-xs text-rose-300/90 mt-1">{error || 'Prescription not found.'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={onRefresh}
              className="px-4 py-2 rounded-lg bg-rose-900 hover:bg-rose-850 text-white font-semibold text-xs transition"
            >
              Retry
            </button>
            <Link
              href="/dashboard/prescriptions"
              className="text-xs font-semibold text-teal-400 hover:text-teal-300 transition"
            >
              &larr; Return to Prescription Directory
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const p = prescription.patient;
  const isTerminal = prescription.status !== 'ACTIVE';

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-700/60 text-emerald-200 text-xs font-medium flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-400 hover:text-white">
            &times;
          </button>
        </div>
      )}

      {/* Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5">
            <Link href="/dashboard/prescriptions" className="hover:text-teal-400 transition">
              Prescription Directory
            </Link>
            <span>/</span>
            <span className="font-mono text-slate-300">{p.mrn}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white tracking-tight">Prescription Order</h1>
            <PrescriptionStatusBadge status={prescription.status} size="md" />
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
              {`v${prescription.version}`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {prescription.consultationId && (
            <Link
              href={`/dashboard/records/${prescription.consultationId}`}
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-teal-300 border border-teal-800/80 text-xs font-semibold transition flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Originating Encounter
            </Link>
          )}
          <button
            onClick={onRefresh}
            disabled={loading || isRefreshing}
            aria-label="Refresh prescription details"
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition disabled:opacity-50"
            title="Refresh details"
          >
            <svg
              className={`w-4 h-4 ${loading || isRefreshing ? 'animate-spin text-teal-400' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Patient & Order Metadata Banner */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white">{p.name}</span>
              <span className="px-2 py-0.5 rounded bg-teal-950 font-mono text-xs font-bold text-teal-300 border border-teal-800">
                MRN: {p.mrn}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-2 flex flex-wrap gap-x-5 gap-y-1">
              <span>Gender: <strong className="text-slate-200">{p.gender || '—'}</strong></span>
              <span>Blood Group: <strong className="text-rose-300 font-mono font-bold">{p.bloodGroup || '—'}</strong></span>
              <span>Phone: <strong className="text-slate-200">{p.phone || '—'}</strong></span>
              {p.allergies && (
                <span className="text-amber-300">
                  Allergies: <strong>{p.allergies}</strong>
                </span>
              )}
            </div>
          </div>

          <div className="text-xs text-slate-400 md:text-right space-y-1">
            <div>
              <span className="text-slate-500">Prescribing Clinician:</span>{' '}
              <strong className="text-slate-200">{prescription.doctor.name}</strong>
            </div>
            <div className="text-[11px] text-slate-500">{prescription.doctor.email}</div>
            <div>
              <span className="text-slate-500">Issued On:</span>{' '}
              <strong className="text-slate-300">{formatDate(prescription.createdAt)}</strong>
            </div>
          </div>
        </div>

        {/* Prescription Notes */}
        <div>
          <span className="block text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
            Prescription Notes
          </span>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300">
            {prescription.notes ? prescription.notes : 'No additional clinical notes recorded.'}
          </div>
        </div>
      </div>

      {/* Medication Items (Read-Only Table) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">Prescribed Medication Items</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Read-only clinical orders generated during consultation.
            </p>
          </div>
          <span className="text-xs font-semibold text-teal-400">
            {prescription.items.length} item{prescription.items.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" aria-label="Medication items table">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th scope="col" className="px-4 py-3">Medication</th>
                <th scope="col" className="px-4 py-3">Strength</th>
                <th scope="col" className="px-4 py-3">Route</th>
                <th scope="col" className="px-4 py-3">Frequency</th>
                <th scope="col" className="px-4 py-3">Duration</th>
                <th scope="col" className="px-4 py-3">Quantity</th>
                <th scope="col" className="px-4 py-3">Instructions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {prescription.items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-850/30 transition-colors">
                  <td className="px-4 py-3.5 font-semibold text-white">{item.medicationName}</td>
                  <td className="px-4 py-3.5 text-slate-300 font-mono text-[11px]">{item.strength || '—'}</td>
                  <td className="px-4 py-3.5 text-slate-300">{item.route || 'Oral'}</td>
                  <td className="px-4 py-3.5 text-teal-300 font-medium">{item.frequency}</td>
                  <td className="px-4 py-3.5 text-slate-300">{item.duration}</td>
                  <td className="px-4 py-3.5 text-slate-400">{item.quantity || '—'}</td>
                  <td className="px-4 py-3.5 text-slate-400 italic max-w-xs">{item.instructions || 'As directed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lifecycle Actions Panel */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
        <h2 className="text-sm font-bold text-white tracking-tight">Prescription Lifecycle Management</h2>

        {isTerminal ? (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center gap-2.5">
            <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>
              This prescription is in terminal status (<strong className="text-slate-200">{prescription.status}</strong>).
              Therapy status is finalized and cannot be transitioned further.
            </span>
          </div>
        ) : canWrite ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">
              Update the clinical lifecycle state for this active prescription order.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => openActionModal('COMPLETED')}
                className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 transition flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Mark Course Completed
              </button>

              <button
                type="button"
                onClick={() => openActionModal('DISCONTINUED')}
                className="px-4 py-2 rounded-lg bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800/80 font-semibold text-xs transition flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Discontinue Prescription
              </button>

              <button
                type="button"
                onClick={() => openActionModal('CANCELLED')}
                className="px-4 py-2 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800/80 font-semibold text-xs transition flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Cancel Order
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
            Read-only access: Modifying prescription lifecycle states requires clinical write permissions (Doctor, Admin, or Owner).
          </div>
        )}
      </div>

      {/* Lifecycle Mutation Modal */}
      {modalOpen && (
        <PrescriptionStatusModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          prescriptionId={prescription.id}
          currentStatus={prescription.status}
          currentVersion={prescription.version}
          initialTargetStatus={targetStatus}
          onSuccess={handleSuccess}
          onReloadRequested={onReloadLatest || onRefresh}
          fetchFn={fetchFn}
        />
      )}
    </div>
  );
}

export interface LoadedPrescriptionPageData {
  role: ClinicRole | null;
  prescription: PrescriptionDetailData | null;
  error: string | null;
}

/**
 * Loads both active user session role and prescription detail data in a single coordinated pipeline.
 */
export async function loadPrescriptionPageData(
  prescriptionId: string,
  fetchFn: typeof fetch
): Promise<LoadedPrescriptionPageData> {
  let role: ClinicRole | null = null;
  let prescription: PrescriptionDetailData | null = null;
  let error: string | null = null;

  try {
    // 1. Load active user session role
    const authRes = await fetchFn('/api/auth/me');
    if (authRes.ok) {
      const authData = await authRes.json();
      role = resolveUserClinicRole(authData);
    }

    // 2. Load prescription details
    const res = await fetchFn(`/api/prescriptions/${prescriptionId}`);
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('Prescription record not found in active clinic.');
      }
      if (res.status === 403) {
        throw new Error('Access denied: You do not have permission to view clinical prescriptions.');
      }
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.error || 'Failed to load prescription details.');
    }

    const data = await res.json();
    prescription = data?.prescription || null;
  } catch (err) {
    error = err instanceof Error ? err.message : 'An unexpected error occurred.';
  }

  return { role, prescription, error };
}

export default function PrescriptionDetailPage({
  params,
  fetchFn,
}: {
  params: Promise<{ prescriptionId: string }>;
  fetchFn?: typeof fetch;
}) {
  const resolvedParams = use(params);
  const prescriptionId = resolvedParams.prescriptionId;

  const [prescription, setPrescription] = useState<PrescriptionDetailData | null>(null);
  const [userRole, setUserRole] = useState<ClinicRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const customFetch = fetchFn || (typeof fetch !== 'undefined' ? fetch : undefined);

  const handleRefresh = useCallback(() => {
    if (!prescription) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setRefreshTrigger((prev) => prev + 1);
  }, [prescription]);

  const handleReloadLatest = useCallback(async (): Promise<PrescriptionDetailData | null> => {
    if (!customFetch) return null;
    setIsRefreshing(true);
    try {
      const res = await customFetch(`/api/prescriptions/${prescriptionId}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to reload latest prescription.');
      }
      const data = await res.json();
      if (data?.prescription) {
        setPrescription(data.prescription);
        setError(null);
        return data.prescription;
      }
      return null;
    } finally {
      setIsRefreshing(false);
    }
  }, [prescriptionId, customFetch]);

  const handleStatusUpdated = useCallback((updated: PrescriptionDetailData) => {
    setPrescription(updated);
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadData() {
      if (!customFetch) return;
      const result = await loadPrescriptionPageData(prescriptionId, customFetch);
      if (!ignore) {
        if (result.role) {
          setUserRole(result.role);
        }
        if (result.prescription) {
          setPrescription(result.prescription);
          setError(null);
        } else if (result.error) {
          setError(result.error);
        }
        setLoading(false);
        setIsRefreshing(false);
      }
    }

    loadData();

    return () => {
      ignore = true;
    };
  }, [prescriptionId, refreshTrigger, customFetch]);

  return (
    <PrescriptionDetailView
      prescription={prescription}
      loading={loading}
      isRefreshing={isRefreshing}
      error={error}
      userRole={userRole}
      onRefresh={handleRefresh}
      onReloadLatest={handleReloadLatest}
      onStatusUpdated={handleStatusUpdated}
      fetchFn={customFetch}
    />
  );
}
