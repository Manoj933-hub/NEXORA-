'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface ConsultationItem {
  id: string;
  status: 'DRAFT' | 'FINALIZED' | 'AMENDED';
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  createdAt: string;
  finalizedAt?: string | null;
  amendedAt?: string | null;
  patient: {
    id: string;
    mrn: string;
    name: string;
    gender?: string | null;
    dateOfBirth?: string | null;
    phone?: string | null;
  };
  doctor: {
    id: string;
    name: string;
    email: string;
  };
  diagnoses: Array<{
    id: string;
    name: string;
    code?: string | null;
    type: 'PRIMARY' | 'SECONDARY';
  }>;
  observations: Array<{
    id: string;
    systolicBp?: number | null;
    diastolicBp?: number | null;
    heartRate?: number | null;
    temperature?: number | null;
    temperatureUnit?: string | null;
    oxygenSaturation?: number | null;
    bmi?: number | null;
  }>;
  prescriptions: Array<{
    id: string;
    status: string;
    _count: { items: number };
  }>;
}

export default function ClinicalRecordsListPage() {
  const [consultations, setConsultations] = useState<ConsultationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const reloadData = useCallback(() => {
    setLoading(true);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (statusFilter !== 'ALL') {
          params.set('status', statusFilter);
        }

        const res = await fetch(`/api/consultations?${params.toString()}`);
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error('Access restricted: Clinical records require Doctor, Admin, or Owner permissions.');
          }
          throw new Error('Failed to load clinical records');
        }

        const data = await res.json();
        if (!ignore) {
          setConsultations(data.consultations || []);
        }
      } catch (err: unknown) {
        console.error('Error fetching clinical records:', err);
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to load records.');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      ignore = true;
    };
  }, [statusFilter, refreshTrigger]);

  const filteredConsultations = consultations.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const patientName = item.patient.name.toLowerCase();
    const patientMrn = item.patient.mrn.toLowerCase();
    const doctorName = item.doctor.name.toLowerCase();
    const diagnosisMatch = item.diagnoses.some((d) => d.name.toLowerCase().includes(q));
    return (
      patientName.includes(q) ||
      patientMrn.includes(q) ||
      doctorName.includes(q) ||
      diagnosisMatch
    );
  });

  function getStatusBadge(status: string) {
    switch (status) {
      case 'FINALIZED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
            Finalized &amp; Signed
          </span>
        );
      case 'AMENDED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
            Amended Record
          </span>
        );
      case 'DRAFT':
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
            Draft
          </span>
        );
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-800 text-[11px] font-semibold">
              EMR &amp; Consultations
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Clinical Records</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Structured SOAP consultation notes, longitudinal vitals tracking, and digital prescriptions.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/dashboard/records/new"
            className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 transition flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Consultation
          </Link>
          <button
            onClick={reloadData}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition"
            title="Refresh clinical records"
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

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="w-full sm:w-80">
          <input
            type="text"
            placeholder="Search by patient, MRN, diagnosis..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-400 whitespace-nowrap">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setLoading(true);
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:border-teal-500"
          >
            <option value="ALL">All Records</option>
            <option value="DRAFT">Drafts</option>
            <option value="FINALIZED">Finalized</option>
            <option value="AMENDED">Amended</option>
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs">
          {error}
        </div>
      )}

      {/* Clinical Encounters List */}
      <div className="rounded-xl bg-slate-900/40 border border-slate-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-3 border-teal-500/30 border-t-teal-400 rounded-full animate-spin mb-3" />
            <span className="text-xs text-slate-400">Loading clinical encounters...</span>
          </div>
        ) : filteredConsultations.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-white">No Clinical Consultations Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery
                ? 'No encounters match your search criteria.'
                : 'No consultations have been recorded yet in this clinic.'}
            </p>
            <div className="pt-2">
              <Link
                href="/dashboard/records/new"
                className="px-3.5 py-1.5 rounded-lg bg-teal-500 text-slate-950 text-xs font-bold hover:bg-teal-400 transition inline-block"
              >
                + Start Consultation
              </Link>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filteredConsultations.map((c) => {
              const obs = c.observations[0];
              const primaryDiag = c.diagnoses.find((d) => d.type === 'PRIMARY') || c.diagnoses[0];
              const dateStr = new Date(c.createdAt).toLocaleDateString([], {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });
              const timeStr = new Date(c.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={c.id}
                  className="p-5 hover:bg-slate-850/30 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/records/${c.id}`}
                        className="font-bold text-white text-sm hover:text-teal-400 transition"
                      >
                        {c.patient.name}
                      </Link>
                      <span className="px-2 py-0.5 rounded bg-teal-950/80 text-teal-300 font-mono text-[10px] border border-teal-800/60 font-semibold">
                        {c.patient.mrn}
                      </span>
                      {getStatusBadge(c.status)}
                    </div>

                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span>
                        <strong className="text-slate-300 font-medium">Doctor:</strong> {c.doctor.name}
                      </span>
                      <span>
                        <strong className="text-slate-300 font-medium">Date:</strong> {dateStr} at {timeStr}
                      </span>
                      {primaryDiag && (
                        <span className="text-rose-300 font-medium">
                          Dx: {primaryDiag.name} {primaryDiag.code ? `(${primaryDiag.code})` : ''}
                        </span>
                      )}
                    </div>

                    {/* Vitals Summary Pill Bar if present */}
                    {obs && (
                      <div className="flex flex-wrap gap-2 text-[11px] text-slate-400 pt-1">
                        {obs.systolicBp && obs.diastolicBp && (
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                            BP: <span className="text-white font-mono">{obs.systolicBp}/{obs.diastolicBp}</span> mmHg
                          </span>
                        )}
                        {obs.heartRate && (
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                            Pulse: <span className="text-white font-mono">{obs.heartRate}</span> bpm
                          </span>
                        )}
                        {obs.temperature && (
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                            Temp: <span className="text-white font-mono">{obs.temperature}°{obs.temperatureUnit || 'F'}</span>
                          </span>
                        )}
                        {obs.bmi && (
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                            BMI: <span className="text-white font-mono">{obs.bmi}</span>
                          </span>
                        )}
                      </div>
                    )}

                    {/* SOAP Snippet */}
                    {c.assessment && (
                      <p className="text-xs text-slate-300 italic line-clamp-1">
                        &ldquo;{c.assessment}&rdquo;
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-center">
                    <Link
                      href={`/dashboard/records/${c.id}`}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold transition"
                    >
                      View Encounter
                    </Link>
                    <Link
                      href={`/dashboard/records/${c.id}/edit`}
                      className="px-3 py-1.5 rounded-lg bg-teal-950 hover:bg-teal-900 text-teal-300 border border-teal-800/80 text-xs font-semibold transition"
                    >
                      {c.status === 'FINALIZED' ? 'Amend' : 'Edit'}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
