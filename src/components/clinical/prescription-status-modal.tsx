'use client';

import React, { useState } from 'react';
import {
  type PrescriptionStatus,
  canTransitionTo,
  isTerminalPrescriptionStatus,
  buildPrescriptionPatchPayload,
  parsePrescriptionApiError,
} from '@/lib/clinical/prescription-lifecycle';

export type AllowedTargetStatus = 'COMPLETED' | 'DISCONTINUED' | 'CANCELLED';

export interface PrescriptionUpdatedRecord {
  id: string;
  status: PrescriptionStatus;
  version: number;
  notes?: string | null;
  [key: string]: unknown;
}

export interface PrescriptionStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  prescriptionId: string;
  currentStatus: PrescriptionStatus;
  currentVersion: number;
  initialTargetStatus?: AllowedTargetStatus;
  onSuccess: (updatedPrescription: PrescriptionUpdatedRecord) => void;
  onReloadRequested?: () => Promise<void> | void;
  /** Optional custom fetch for testing */
  fetchFn?: typeof fetch;
}

interface StatusMeta {
  title: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  borderClass: string;
  notesLabel: string;
  notesPlaceholder: string;
  notesRequired: boolean;
  confirmLabel: string;
  buttonClass: string;
  submitLabel: string;
}

const STATUS_METADATA: Record<AllowedTargetStatus, StatusMeta> = {
  COMPLETED: {
    title: 'Mark Prescription as Completed',
    description:
      'Confirm that the patient has completed the full prescribed course of treatment. This status is terminal and permanently completes the order.',
    badgeBg: 'bg-teal-950/80',
    badgeText: 'text-teal-300',
    borderClass: 'border-teal-700/60',
    notesLabel: 'Completion Notes (Optional)',
    notesPlaceholder: 'Enter any completion observations or instructions...',
    notesRequired: false,
    confirmLabel: 'I confirm that the patient has completed their prescribed medication course.',
    buttonClass: 'bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold',
    submitLabel: 'Mark Completed',
  },
  DISCONTINUED: {
    title: 'Discontinue Prescription Early',
    description:
      'Permanently cease this medication before the scheduled duration. This action cannot be reversed and is recorded in the clinical audit log.',
    badgeBg: 'bg-amber-950/80',
    badgeText: 'text-amber-300',
    borderClass: 'border-amber-700/60',
    notesLabel: 'Clinical Reason for Discontinuation (Required)',
    notesPlaceholder: 'Specify clinical rationale (e.g., adverse reaction, condition resolved, therapy changed)...',
    notesRequired: true,
    confirmLabel: 'I confirm the early discontinuation of this prescription.',
    buttonClass: 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold',
    submitLabel: 'Discontinue Prescription',
  },
  CANCELLED: {
    title: 'Cancel Prescription Order',
    description:
      'Revoke or void this prescription order (e.g. entered in error or duplicate). This action is permanent and recorded in the audit log.',
    badgeBg: 'bg-rose-950/80',
    badgeText: 'text-rose-300',
    borderClass: 'border-rose-700/60',
    notesLabel: 'Reason for Cancellation (Required)',
    notesPlaceholder: 'State reason for cancellation (e.g., duplicate order, incorrect strength, physician change)...',
    notesRequired: true,
    confirmLabel: 'I confirm that this prescription order should be permanently cancelled.',
    buttonClass: 'bg-rose-600 hover:bg-rose-500 text-white font-bold',
    submitLabel: 'Cancel Prescription',
  },
};

export function PrescriptionStatusModal({
  isOpen,
  onClose,
  prescriptionId,
  currentStatus,
  currentVersion,
  initialTargetStatus = 'COMPLETED',
  onSuccess,
  onReloadRequested,
  fetchFn = typeof fetch !== 'undefined' ? fetch : undefined,
}: PrescriptionStatusModalProps) {
  const [targetStatus, setTargetStatus] = useState<AllowedTargetStatus>(initialTargetStatus);
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  if (!isOpen) return null;

  const isTerminal = isTerminalPrescriptionStatus(currentStatus);
  const meta = STATUS_METADATA[targetStatus];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setClientError(null);
    setConflictError(null);

    // 1. Guard against terminal status
    if (isTerminal) {
      setClientError(
        `Cannot update prescription: current status "${currentStatus}" is terminal and cannot be transitioned.`
      );
      return;
    }

    // 2. Guard legal transition
    if (!canTransitionTo(currentStatus, targetStatus)) {
      setClientError(
        `Illegal status transition: cannot transition from "${currentStatus}" to "${targetStatus}".`
      );
      return;
    }

    // 3. Guard expected version
    if (
      typeof currentVersion !== 'number' ||
      !Number.isFinite(currentVersion) ||
      !Number.isInteger(currentVersion) ||
      currentVersion < 1
    ) {
      setClientError('Invalid prescription version. Please reload the prescription.');
      return;
    }

    // 4. Guard required confirmation
    if (!confirmed) {
      setClientError('Please verify and check the confirmation box to proceed.');
      return;
    }

    // 5. Guard required notes for Discontinue and Cancel
    if (meta.notesRequired && !notes.trim()) {
      setClientError(`A non-empty reason is required to ${targetStatus.toLowerCase()} this prescription.`);
      return;
    }

    // 6. Build exact payload with no extra fields
    let payload;
    try {
      payload = buildPrescriptionPatchPayload({
        status: targetStatus,
        expectedVersion: currentVersion,
        notes: notes.trim() || null,
      });
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'Invalid payload parameters.');
      return;
    }

    setSubmitting(true);

    try {
      if (!fetchFn) {
        throw new Error('Fetch function unavailable');
      }

      const res = await fetchFn(`/api/prescriptions/${prescriptionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (res.status === 409) {
        // Concurrency conflict: preserve entered notes and display conflict alert
        const parsed = parsePrescriptionApiError(409, data);
        setConflictError(parsed.message);
        return;
      }

      if (!res.ok) {
        const parsed = parsePrescriptionApiError(res.status, data);
        setClientError(parsed.message);
        return;
      }

      // Successful mutation: notify parent and close
      onSuccess(data.prescription);
      onClose();
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'Network error updating prescription.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReload() {
    if (reloading) return;
    setReloading(true);
    setClientError(null);
    try {
      if (onReloadRequested) {
        await onReloadRequested();
        setConflictError(null);
      }
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'Failed to reload latest prescription.');
    } finally {
      setReloading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="prescription-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in"
    >
      <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/40">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.badgeBg} ${meta.badgeText} ${meta.borderClass}`}>
                {targetStatus}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">{`Current: v${currentVersion}`}</span>
            </div>
            <h2 id="prescription-modal-title" className="text-base font-bold text-white tracking-tight">
              {meta.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Target Status Switcher */}
          {!isTerminal && (
            <div>
              <span className="block text-xs font-medium text-slate-400 mb-1.5">Action Target Status</span>
              <div role="tablist" aria-label="Select target status" className="grid grid-cols-3 gap-2">
                {(['COMPLETED', 'DISCONTINUED', 'CANCELLED'] as AllowedTargetStatus[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    role="tab"
                    aria-selected={targetStatus === st}
                    onClick={() => {
                      setTargetStatus(st);
                      setClientError(null);
                      setConflictError(null);
                    }}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold transition border ${
                      targetStatus === st
                        ? 'bg-slate-800 text-white border-teal-500/80 shadow-sm'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-850'
                    }`}
                  >
                    {st === 'COMPLETED' ? 'Complete' : st === 'DISCONTINUED' ? 'Discontinue' : 'Cancel'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Description Callout */}
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 leading-relaxed">
            {meta.description}
          </div>

          {/* Conflict 409 Alert */}
          {conflictError && (
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/80 space-y-2.5 text-xs text-amber-200">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <strong className="text-amber-100 font-semibold block">Version Conflict (HTTP 409)</strong>
                  <p className="mt-0.5">{conflictError}</p>
                </div>
              </div>
              <p className="text-[11px] text-amber-300/80">
                Your entered clinical reason has been preserved. Please reload the latest version to verify current therapy state before re-submitting.
              </p>
              <button
                type="button"
                onClick={handleReload}
                disabled={reloading}
                aria-busy={reloading}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {reloading ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Reloading Latest Prescription...</span>
                  </>
                ) : (
                  'Reload Latest Prescription'
                )}
              </button>
            </div>
          )}

          {/* General Error Alert */}
          {clientError && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/80 text-xs text-rose-200 flex items-start gap-2">
              <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{clientError}</span>
            </div>
          )}

          {/* Terminal Warning if status changed */}
          {isTerminal ? (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
              This prescription is in terminal state <strong className="text-slate-200">{currentStatus}</strong> and can no longer be modified.
            </div>
          ) : (
            <>
              {/* Clinical Notes / Reason Textarea */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="prescription-action-notes" className="text-xs font-medium text-slate-300">
                    {meta.notesLabel}
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">{`${notes.length}/1000`}</span>
                </div>
                <textarea
                  id="prescription-action-notes"
                  rows={3}
                  maxLength={1000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={meta.notesPlaceholder}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition"
                />
              </div>

              {/* Confirmation Checkbox */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-2.5">
                <input
                  id="prescription-confirm-check"
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-teal-500"
                />
                <label htmlFor="prescription-confirm-check" className="text-xs text-slate-300 select-none cursor-pointer leading-tight">
                  {meta.confirmLabel}
                </label>
              </div>
            </>
          )}

          {/* Action Footer */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition disabled:opacity-50"
            >
              Cancel
            </button>
            {!isTerminal && (
              <button
                type="submit"
                disabled={submitting || !confirmed || (meta.notesRequired && !notes.trim())}
                className={`px-4 py-2 rounded-lg text-xs transition shadow-md disabled:opacity-40 disabled:cursor-not-allowed ${meta.buttonClass}`}
              >
                {submitting ? 'Updating...' : meta.submitLabel}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
