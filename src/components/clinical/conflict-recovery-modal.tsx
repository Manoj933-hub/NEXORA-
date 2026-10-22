'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  formatClinicalChangesForClipboard,
  type ClinicalUnsavedChanges,
  type ServerConsultationSnapshot,
} from '@/lib/clinical/concurrency';

export type ConflictModalView = 'OPTIONS' | 'VIEW_SERVER' | 'CONFIRM_RELOAD';

export interface ConflictRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  consultationId: string;
  conflictError?: string | null;
  currentClientVersion: number | null;
  unsavedData: ClinicalUnsavedChanges;
  onReloadConfirm: (serverData: ServerConsultationSnapshot) => void;
  /** Optional custom fetch for testing */
  fetchFn?: typeof fetch;
  /** Optional custom clipboard write function for testing */
  clipboardFn?: (text: string) => Promise<void>;
  /** Optional initial view for testing */
  initialView?: ConflictModalView;
}

export function ConflictRecoveryModal({
  isOpen,
  onClose,
  consultationId,
  conflictError,
  currentClientVersion,
  unsavedData,
  onReloadConfirm,
  fetchFn = typeof fetch !== 'undefined' ? fetch : undefined,
  clipboardFn,
  initialView = 'OPTIONS',
}: ConflictRecoveryModalProps) {
  const [view, setView] = useState<ConflictModalView>(initialView);
  const [serverData, setServerData] = useState<ServerConsultationSnapshot | null>(null);
  const [loadingServerData, setLoadingServerData] = useState(false);
  const [serverFetchError, setServerFetchError] = useState<string | null>(null);

  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [clipboardFallbackText, setClipboardFallbackText] = useState<string | null>(null);


  // Fetch server consultation details
  const fetchServerVersion = useCallback(async () => {
    if (!fetchFn) return null;
    setLoadingServerData(true);
    setServerFetchError(null);
    try {
      const res = await fetchFn(`/api/consultations/${consultationId}`);
      if (!res.ok) {
        throw new Error(`Failed to load server version (HTTP ${res.status})`);
      }
      const data = await res.json();
      const c = data.consultation as ServerConsultationSnapshot;
      setServerData(c);
      return c;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve current server consultation.';
      setServerFetchError(msg);
      return null;
    } finally {
      setLoadingServerData(false);
    }
  }, [consultationId, fetchFn]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (view === 'VIEW_SERVER' || view === 'CONFIRM_RELOAD') {
          setView('OPTIONS');
        } else {
          onClose();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, view, onClose]);

  if (!isOpen) return null;

  async function handleCopyChanges() {
    const formatted = formatClinicalChangesForClipboard(unsavedData);
    try {
      if (clipboardFn) {
        await clipboardFn(formatted);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(formatted);
      } else {
        throw new Error('Clipboard API not available');
      }
      setCopyStatus('success');
      setClipboardFallbackText(null);
      setTimeout(() => setCopyStatus('idle'), 4000);
    } catch {
      setCopyStatus('failed');
      setClipboardFallbackText(formatted);
    }
  }

  async function handleOpenViewServer() {
    setView('VIEW_SERVER');
    if (!serverData) {
      await fetchServerVersion();
    }
  }

  async function handleOpenConfirmReload() {
    setView('CONFIRM_RELOAD');
    if (!serverData) {
      await fetchServerVersion();
    }
  }

  async function handleConfirmReloadAction() {
    let latest = serverData;
    if (!latest) {
      latest = await fetchServerVersion();
    }
    if (latest) {
      onReloadConfirm(latest);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-dialog-title"
      aria-describedby="conflict-dialog-desc"
    >
      <div className="w-full max-w-2xl bg-slate-900 border border-amber-600/60 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900 border-b border-amber-800/40 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="conflict-dialog-title" className="text-base font-bold text-white tracking-tight">
                  Consultation Concurrency Conflict
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  HTTP 409
                </span>
              </div>
              <p id="conflict-dialog-desc" className="text-xs text-slate-400 mt-0.5">
                Record modified concurrently. Base loaded version was{' '}
                <strong className="text-slate-200">
                  {currentClientVersion !== null ? `v${currentClientVersion}` : 'unversioned'}
                </strong>
                .
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close conflict dialog"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body: Switch by View */}
        <div className="p-6 space-y-5">
          {view === 'OPTIONS' && (
            <>
              {/* Conflict Explanation Box */}
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 text-xs text-amber-200 space-y-1.5 leading-relaxed">
                <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <span>Server Notice:</span>
                </div>
                <p>
                  {conflictError ||
                    'Another clinician has signed or amended this consultation record since you opened it. To protect clinical integrity, your modifications cannot overwrite the server record without resolution.'}
                </p>
                <p className="text-[11px] text-amber-300/80 font-medium">
                  ✓ Your current unsaved form modifications are preserved intact in the background.
                </p>
              </div>

              {/* Unsaved Snapshot Summary */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-800 pb-1.5">
                  Your Current Unsaved Edits
                </span>
                <div className="grid grid-cols-2 gap-2 text-slate-300">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Patient:</span>
                    <span className="font-semibold text-white">{unsavedData.patientName}</span> ({unsavedData.patientMrn})
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Amendment Reason:</span>
                    <span className="text-slate-200 italic line-clamp-1">
                      {unsavedData.amendmentReason || '(None recorded)'}
                    </span>
                  </div>
                </div>

                <div className="pt-1 text-[11px] text-slate-400 space-y-1">
                  <div>
                    <strong className="text-slate-300">SOAP Notes:</strong> S:{' '}
                    {unsavedData.subjective ? `${unsavedData.subjective.length} chars` : 'empty'}, O:{' '}
                    {unsavedData.objective ? `${unsavedData.objective.length} chars` : 'empty'}, A:{' '}
                    {unsavedData.assessment ? `${unsavedData.assessment.length} chars` : 'empty'}, P:{' '}
                    {unsavedData.plan ? `${unsavedData.plan.length} chars` : 'empty'}
                  </div>
                  <div>
                    <strong className="text-slate-300">Diagnoses:</strong>{' '}
                    {unsavedData.diagnoses?.filter((d) => d.name.trim().length > 0).length || 0} entered
                  </div>
                  <div>
                    <strong className="text-slate-300">Prescriptions:</strong>{' '}
                    {unsavedData.prescriptions?.[0]?.items?.filter((i) => i.medicationName.trim().length > 0).length || 0}{' '}
                    items entered
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <span className="text-xs font-semibold text-white block">Recommended Recovery Actions:</span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Action 1: Copy My Changes */}
                  <button
                    type="button"
                    onClick={handleCopyChanges}
                    className="p-3.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-left transition space-y-1 group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white group-hover:text-teal-300 transition">
                        <svg className="w-4 h-4 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                          />
                        </svg>
                        Copy My Changes
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                        Copies a full text representation of your unsaved notes to clipboard.
                      </p>
                    </div>
                    {copyStatus === 'success' && (
                      <span className="text-[10px] font-bold text-emerald-400 block pt-1">
                        ✓ Copied to clipboard!
                      </span>
                    )}
                  </button>

                  {/* Action 2: View Server Version */}
                  <button
                    type="button"
                    onClick={handleOpenViewServer}
                    className="p-3.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-left transition space-y-1 group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white group-hover:text-indigo-300 transition">
                        <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                        View Current Version
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                        Inspect the latest version currently saved on the server without losing your draft.
                      </p>
                    </div>
                    <span className="text-[10px] text-indigo-400 pt-1 block">Read-only preview →</span>
                  </button>

                  {/* Action 3: Reload Latest Version */}
                  <button
                    type="button"
                    onClick={handleOpenConfirmReload}
                    className="p-3.5 rounded-xl bg-rose-950/30 hover:bg-rose-950/50 border border-rose-900/60 text-left transition space-y-1 group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-rose-300 group-hover:text-rose-200 transition">
                        <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        Reload Latest Version
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                        Replace your editor form with the newest server version (requires confirmation).
                      </p>
                    </div>
                    <span className="text-[10px] text-rose-400 pt-1 block">Overwrites form →</span>
                  </button>
                </div>
              </div>

              {/* Clipboard Fallback Text Area (if clipboard permission was blocked) */}
              {clipboardFallbackText && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300">
                      Clipboard Access Blocked — Manual Copy Box
                    </span>
                    <span className="text-[11px] text-slate-400">Select all &amp; copy (Ctrl+C / Cmd+C)</span>
                  </div>
                  <textarea
                    readOnly
                    rows={6}
                    value={clipboardFallbackText}
                    aria-label="Manual copy of clinical changes"
                    className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 font-mono focus:border-teal-400"
                    onFocus={(e) => e.target.select()}
                  />
                </div>
              )}
            </>
          )}

          {/* VIEW: Server Version Preview */}
          {view === 'VIEW_SERVER' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <button
                  type="button"
                  onClick={() => setView('OPTIONS')}
                  className="inline-flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 font-semibold"
                >
                  ← Back to Conflict Options
                </button>
                {serverData && (
                  <span className="px-2.5 py-1 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-800 text-xs font-mono font-bold">
                    Server Version: v{serverData.version} ({serverData.status})
                  </span>
                )}
              </div>

              {loadingServerData && (
                <div className="py-12 flex flex-col items-center justify-center space-y-2">
                  <div className="w-8 h-8 border-3 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
                  <span className="text-xs text-slate-400">Fetching latest server consultation...</span>
                </div>
              )}

              {serverFetchError && (
                <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-xs text-red-200 space-y-2">
                  <p>{serverFetchError}</p>
                  <button
                    type="button"
                    onClick={fetchServerVersion}
                    className="px-3 py-1 rounded bg-red-900 hover:bg-red-800 text-white text-xs font-semibold"
                  >
                    Retry Fetch
                  </button>
                </div>
              )}

              {serverData && !loadingServerData && (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1 text-xs">
                  {serverData.amendmentReason && (
                    <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-900/60">
                      <span className="text-[10px] font-bold uppercase text-indigo-300 block mb-0.5">
                        Latest Amendment Reason (v{serverData.version}):
                      </span>
                      <p className="text-slate-200 italic">{serverData.amendmentReason}</p>
                      {serverData.amendedBy && (
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Amended by: Dr. {serverData.amendedBy.name}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <span className="font-bold text-white block">Server SOAP Record:</span>
                    <div className="space-y-1.5 text-slate-300">
                      <p>
                        <strong className="text-slate-400">S:</strong> {serverData.subjective || '—'}
                      </p>
                      <p>
                        <strong className="text-slate-400">O:</strong> {serverData.objective || '—'}
                      </p>
                      <p>
                        <strong className="text-slate-400">A:</strong> {serverData.assessment || '—'}
                      </p>
                      <p>
                        <strong className="text-slate-400">P:</strong> {serverData.plan || '—'}
                      </p>
                    </div>
                  </div>

                  {serverData.diagnoses && serverData.diagnoses.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <span className="font-bold text-white block">Server Diagnoses:</span>
                      <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                        {serverData.diagnoses.map((d, i) => (
                          <li key={i}>
                            [{d.type}] {d.name} {d.code ? `(${d.codeSystem || 'ICD-10'}: ${d.code})` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400">
                    ℹ️ You are in read-only preview. Your unsaved modifications in the editor remain intact.
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setView('OPTIONS')}
                  className="px-3.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white"
                >
                  Return to Options
                </button>
                <button
                  type="button"
                  onClick={handleOpenConfirmReload}
                  className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition"
                >
                  Proceed to Reload This Version →
                </button>
              </div>
            </div>
          )}

          {/* VIEW: Confirmation Step Before Reloading */}
          {view === 'CONFIRM_RELOAD' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-rose-950/40 border-2 border-rose-600/80 text-xs text-rose-200 space-y-3">
                <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
                  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  Permanent Overwrite Warning
                </div>
                <p className="leading-relaxed">
                  Reloading will <strong>discard all your unsaved modifications</strong> in the form and overwrite it with
                  the latest record from the server{' '}
                  {serverData?.version ? `(Version ${serverData.version})` : ''}.
                </p>
                <p className="text-[11px] text-rose-300/90 font-medium">
                  This action cannot be undone. If you need your notes, please return to options and copy them to your clipboard first.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setView('OPTIONS')}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 transition"
                >
                  Cancel (Keep My Changes)
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReloadAction}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/40 transition"
                >
                  Confirm &amp; Overwrite Form
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {view === 'OPTIONS' && (
          <div className="p-4 bg-slate-950/70 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              Closing this dialog preserves your unsaved inputs in the editor.
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 transition"
            >
              Dismiss &amp; Review Form
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
