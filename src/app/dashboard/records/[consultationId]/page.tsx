'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ConsultationDetails {
  id: string;
  status: 'DRAFT' | 'FINALIZED' | 'AMENDED';
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  finalizedAt?: string | null;
  amendedAt?: string | null;
  amendmentReason?: string | null;
  createdAt: string;
  updatedAt: string;
  patient: {
    id: string;
    mrn: string;
    name: string;
    dateOfBirth?: string | null;
    gender?: string | null;
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
  appointment?: {
    id: string;
    startTime: string;
    endTime: string;
    reason?: string | null;
  } | null;
  observations: Array<{
    id: string;
    systolicBp?: number | null;
    diastolicBp?: number | null;
    heartRate?: number | null;
    temperature?: number | null;
    temperatureUnit?: string | null;
    respiratoryRate?: number | null;
    oxygenSaturation?: number | null;
    height?: number | null;
    heightUnit?: string | null;
    weight?: number | null;
    weightUnit?: string | null;
    bmi?: number | null;
    notes?: string | null;
  }>;
  diagnoses: Array<{
    id: string;
    name: string;
    codeSystem?: string | null;
    code?: string | null;
    type: 'PRIMARY' | 'SECONDARY';
    clinicalStatus?: string | null;
    notes?: string | null;
  }>;
  prescriptions: Array<{
    id: string;
    status: string;
    notes?: string | null;
    doctor?: { name: string } | null;
    items: Array<{
      id: string;
      medicationName: string;
      strength?: string | null;
      route?: string | null;
      frequency: string;
      duration: string;
      quantity?: string | null;
      instructions?: string | null;
    }>;
  }>;
  version?: number;
  versions?: Array<{
    id: string;
    versionNumber: number;
    status: string;
    subjective?: string | null;
    objective?: string | null;
    assessment?: string | null;
    plan?: string | null;
    finalizedAt?: string | null;
    amendedAt?: string | null;
    amendmentReason?: string | null;
    createdAt: string;
    doctor?: { name: string } | null;
    amendedBy?: { name: string } | null;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    actorName: string;
    actorRole: string;
    details?: string | null;
    createdAt: string;
  }>;
}

export default function ConsultationDetailPage({
  params,
}: {
  params: Promise<{ consultationId: string }>;
}) {
  const resolvedParams = use(params);
  const consultationId = resolvedParams.consultationId;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [consultation, setConsultation] = useState<ConsultationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const res = await fetch(`/api/consultations/${consultationId}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Clinical consultation record not found.');
          }
          throw new Error('Failed to load consultation details.');
        }
        const data = await res.json();
        if (!ignore) {
          setConsultation(data.consultation);
        }
      } catch (err: unknown) {
        console.error('Error fetching consultation:', err);
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Error loading record.');
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
  }, [consultationId]);

  async function handleFinalize() {
    if (!confirm('Are you sure you want to finalize and sign this consultation? It will lock direct editing.')) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/consultations/${consultationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'FINALIZED' }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to finalize consultation');
        return;
      }

      setConsultation(data.consultation);
      router.refresh();
    } catch {
      alert('Network error finalizing consultation');
    } finally {
      setActionLoading(false);
    }
  }

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

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-3 border-teal-500/30 border-t-teal-400 rounded-full animate-spin mb-3" />
        <span className="text-xs text-slate-400">Loading consultation encounter...</span>
      </div>
    );
  }

  if (error || !consultation) {
    return (
      <div className="max-w-3xl mx-auto p-6 rounded-2xl bg-red-950/40 border border-red-800 text-red-200 space-y-3">
        <div className="font-semibold text-sm">{error || 'Consultation not found'}</div>
        <Link href="/dashboard/records" className="text-xs text-teal-400 underline inline-block">
          Return to Clinical Records
        </Link>
      </div>
    );
  }

  const p = consultation.patient;
  const obs = consultation.observations[0];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Action Bar (Hidden in Print) */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Link href="/dashboard/records" className="hover:text-teal-400 transition">
              Clinical Records
            </Link>
            <span>/</span>
            <span className="text-slate-200 font-mono">{p.mrn}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">Clinical Encounter</h1>
            {getStatusBadge(consultation.status)}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold transition flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Prescription / Slip
          </button>

          {consultation.status === 'DRAFT' ? (
            <>
              <Link
                href={`/dashboard/records/${consultation.id}/edit`}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-800/80 text-xs font-semibold transition"
              >
                Edit Draft
              </Link>
              <button
                disabled={actionLoading}
                onClick={handleFinalize}
                className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 transition flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {actionLoading ? 'Finalizing...' : 'Finalize & Sign'}
              </button>
            </>
          ) : (
            <Link
              href={`/dashboard/records/${consultation.id}/edit`}
              className="px-4 py-2 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 text-xs font-semibold transition"
            >
              Amend Encounter
            </Link>
          )}
        </div>
      </div>

      {/* Patient Header Banner */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-white">{p.name}</span>
              <span className="px-2 py-0.5 rounded bg-teal-950 font-mono text-xs font-bold text-teal-300 border border-teal-800">
                {p.mrn}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-4">
              <span>Gender: <strong className="text-slate-200">{p.gender || '—'}</strong></span>
              <span>Blood Group: <strong className="text-rose-300 font-mono font-bold">{p.bloodGroup || '—'}</strong></span>
              <span>Contact: <strong className="text-slate-200">{p.phone || '—'}</strong></span>
            </div>
          </div>

          <div className="text-xs sm:text-right text-slate-400 space-y-0.5">
            <div>
              <strong className="text-slate-300">Consulting Physician:</strong> {consultation.doctor.name}
            </div>
            <div>
              <strong className="text-slate-300">Encounter Date:</strong>{' '}
              {new Date(consultation.createdAt).toLocaleDateString([], {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}{' '}
              at{' '}
              {new Date(consultation.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        </div>

        {p.allergies && (
          <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-900/40 text-xs text-rose-300 flex items-center gap-2">
            <span className="font-bold">⚠️ Documented Patient Allergies:</span>
            <span>{p.allergies}</span>
          </div>
        )}

        {consultation.status === 'AMENDED' && consultation.amendmentReason && (
          <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/60 text-xs text-indigo-200 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <span>ℹ️ Record Amended on:</span>
              <span className="font-mono">
                {consultation.amendedAt ? new Date(consultation.amendedAt).toLocaleString() : ''}
              </span>
            </div>
            <p className="italic text-slate-300">
              Reason: &ldquo;{consultation.amendmentReason}&rdquo;
            </p>
          </div>
        )}
      </div>

      {/* Vital Signs Grid */}
      {obs && (
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
              Recorded Vital Signs
            </h2>
            {obs.bmi && (
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
                BMI: {obs.bmi}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Blood Pressure</span>
              <span className="text-sm font-bold text-white font-mono">
                {obs.systolicBp && obs.diastolicBp ? `${obs.systolicBp}/${obs.diastolicBp} mmHg` : '—'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Heart Rate / Pulse</span>
              <span className="text-sm font-bold text-white font-mono">
                {obs.heartRate ? `${obs.heartRate} bpm` : '—'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Temperature</span>
              <span className="text-sm font-bold text-white font-mono">
                {obs.temperature ? `${obs.temperature}°${obs.temperatureUnit || 'F'}` : '—'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Oxygen Saturation</span>
              <span className="text-sm font-bold text-white font-mono">
                {obs.oxygenSaturation ? `${obs.oxygenSaturation}% SpO2` : '—'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Respiratory Rate</span>
              <span className="text-sm font-bold text-white font-mono">
                {obs.respiratoryRate ? `${obs.respiratoryRate} /min` : '—'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Height</span>
              <span className="text-sm font-bold text-white font-mono">
                {obs.height ? `${obs.height} ${obs.heightUnit || 'cm'}` : '—'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Weight</span>
              <span className="text-sm font-bold text-white font-mono">
                {obs.weight ? `${obs.weight} ${obs.weightUnit || 'kg'}` : '—'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Body Mass Index</span>
              <span className="text-sm font-bold text-teal-300 font-mono">
                {obs.bmi ? `${obs.bmi}` : '—'}
              </span>
            </div>
          </div>

          {obs.notes && (
            <p className="text-xs text-slate-400 italic">
              Vitals Note: {obs.notes}
            </p>
          )}
        </div>
      )}

      {/* Structured SOAP Notes */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
        <h2 className="text-xs font-semibold text-white uppercase tracking-wider border-b border-slate-800 pb-3">
          Clinical SOAP Documentation
        </h2>

        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
            <span className="text-xs font-bold text-teal-300 uppercase tracking-wider block">
              S — Subjective (Symptoms &amp; Clinical History)
            </span>
            <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
              {consultation.subjective || 'No subjective complaints recorded.'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
            <span className="text-xs font-bold text-teal-300 uppercase tracking-wider block">
              O — Objective (Examination Findings)
            </span>
            <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
              {consultation.objective || 'No physical examination findings recorded.'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
            <span className="text-xs font-bold text-teal-300 uppercase tracking-wider block">
              A — Assessment (Clinical Reasoning &amp; Diagnoses)
            </span>
            <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
              {consultation.assessment || 'No clinical assessment recorded.'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
            <span className="text-xs font-bold text-teal-300 uppercase tracking-wider block">
              P — Plan (Treatment, Follow-up &amp; Counseling)
            </span>
            <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
              {consultation.plan || 'No management plan recorded.'}
            </p>
          </div>
        </div>
      </div>

      {/* Diagnoses List */}
      {consultation.diagnoses.length > 0 && (
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
          <h2 className="text-xs font-semibold text-white uppercase tracking-wider border-b border-slate-800 pb-3">
            Diagnoses
          </h2>
          <div className="space-y-2">
            {consultation.diagnoses.map((d) => (
              <div
                key={d.id}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{d.name}</span>
                    {d.code && (
                      <span className="px-2 py-0.5 rounded bg-slate-900 text-teal-300 font-mono text-[10px] border border-slate-700">
                        {d.codeSystem ? `${d.codeSystem}: ` : ''}{d.code}
                      </span>
                    )}
                  </div>
                  {d.notes && <p className="text-[11px] text-slate-400">{d.notes}</p>}
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    d.type === 'PRIMARY'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {d.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Digital Prescription */}
      {consultation.prescriptions.length > 0 && (
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              Prescription Orders (Rx)
            </h2>
            <span className="text-[11px] text-teal-300 font-semibold">
              Status: {consultation.prescriptions[0].status}
            </span>
          </div>

          {consultation.prescriptions.map((rx) => (
            <div key={rx.id} className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-3">Medication</th>
                      <th className="py-2 px-3">Strength</th>
                      <th className="py-2 px-3">Route</th>
                      <th className="py-2 px-3">Frequency</th>
                      <th className="py-2 px-3">Duration</th>
                      <th className="py-2 px-3">Quantity</th>
                      <th className="py-2 pl-3">Instructions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {rx.items.map((item) => (
                      <tr key={item.id} className="text-slate-200">
                        <td className="py-2.5 pr-3 font-bold text-white">{item.medicationName}</td>
                        <td className="py-2.5 px-3 font-mono">{item.strength || '—'}</td>
                        <td className="py-2.5 px-3">{item.route || 'Oral'}</td>
                        <td className="py-2.5 px-3 font-mono text-teal-300 font-semibold">{item.frequency}</td>
                        <td className="py-2.5 px-3">{item.duration}</td>
                        <td className="py-2.5 px-3 font-mono">{item.quantity || '—'}</td>
                        <td className="py-2.5 pl-3 text-slate-300 italic">{item.instructions || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rx.notes && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
                  <strong className="text-slate-400">Physician Notes / Advice:</strong> {rx.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Durable Clinical Version History */}
      {consultation.versions && consultation.versions.length > 0 && (
        <div className="print:hidden p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              Durable Version History (Encounters &amp; Amendments)
            </h2>
            <span className="text-[11px] text-slate-400 font-mono">
              Current: v{consultation.version || 1}
            </span>
          </div>
          <div className="space-y-3">
            {consultation.versions.map((ver) => (
              <div
                key={ver.id}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
                      v{ver.versionNumber} ({ver.status})
                    </span>
                    {ver.doctor && (
                      <span className="text-slate-300">Author: Dr. {ver.doctor.name}</span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {new Date(ver.createdAt).toLocaleString()}
                  </span>
                </div>
                {ver.amendmentReason && (
                  <div className="p-2.5 rounded bg-amber-950/30 border border-amber-900/50 text-[11px] text-amber-200">
                    <strong>Amendment Reason:</strong> &ldquo;{ver.amendmentReason}&rdquo;
                    {ver.amendedBy && (
                      <span className="text-slate-400 ml-2">— amended by Dr. {ver.amendedBy.name}</span>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1">
                  <div>
                    <strong className="text-slate-400">Subjective:</strong> {ver.subjective || '—'}
                  </div>
                  <div>
                    <strong className="text-slate-400">Assessment:</strong> {ver.assessment || '—'}
                  </div>
                  <div>
                    <strong className="text-slate-400">Objective:</strong> {ver.objective || '—'}
                  </div>
                  <div>
                    <strong className="text-slate-400">Plan:</strong> {ver.plan || '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Append-Only Clinical Audit Trail */}
      {consultation.auditLogs.length > 0 && (
        <div className="print:hidden p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
          <h2 className="text-xs font-semibold text-white uppercase tracking-wider border-b border-slate-800 pb-3">
            Append-Only Clinical Audit Trail
          </h2>
          <div className="space-y-2">
            {consultation.auditLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-900 text-teal-300 border border-slate-700">
                    {log.action}
                  </span>
                  <span className="text-slate-200 font-semibold">{log.actorName}</span>
                  <span className="text-[11px] text-slate-400">({log.actorRole})</span>
                  {log.details && (
                    <span className="text-[11px] text-slate-400 italic">
                      — &ldquo;{log.details}&rdquo;
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-500 font-mono">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
