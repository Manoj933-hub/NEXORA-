'use client';

import React, { useEffect, useState, useMemo, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { calculateBMI } from '@/lib/validations/clinical';

interface DiagnosisRow {
  name: string;
  codeSystem: string;
  code: string;
  type: 'PRIMARY' | 'SECONDARY';
}

interface PrescriptionItemRow {
  medicationName: string;
  strength: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: string;
  instructions: string;
}

export default function EditConsultationPage({
  params,
}: {
  params: Promise<{ consultationId: string }>;
}) {
  const resolvedParams = use(params);
  const consultationId = resolvedParams.consultationId;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<'DRAFT' | 'FINALIZED' | 'AMENDED'>('DRAFT');
  const [patientName, setPatientName] = useState('');
  const [patientMrn, setPatientMrn] = useState('');

  // SOAP State
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [amendmentReason, setAmendmentReason] = useState('');

  // Vital Signs State
  const [systolicBp, setSystolicBp] = useState<string>('');
  const [diastolicBp, setDiastolicBp] = useState<string>('');
  const [heartRate, setHeartRate] = useState<string>('');
  const [temperature, setTemperature] = useState<string>('');
  const [temperatureUnit, setTemperatureUnit] = useState<'F' | 'C'>('F');
  const [respiratoryRate, setRespiratoryRate] = useState<string>('');
  const [oxygenSaturation, setOxygenSaturation] = useState<string>('');
  const [height, setHeight] = useState<string>('');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'in'>('cm');
  const [weight, setWeight] = useState<string>('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [vitalsNotes, setVitalsNotes] = useState('');

  // Diagnoses State
  const [diagnoses, setDiagnoses] = useState<DiagnosisRow[]>([]);

  // Prescriptions State
  const [rxNotes, setRxNotes] = useState('');
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionItemRow[]>([]);

  useEffect(() => {
    let ignore = false;

    async function loadData() {
      try {
        const res = await fetch(`/api/consultations/${consultationId}`);
        if (!res.ok) throw new Error('Failed to load consultation details');
        const data = await res.json();
        const c = data.consultation;

        if (!ignore && c) {
          setStatus(c.status);
          setPatientName(c.patient.name);
          setPatientMrn(c.patient.mrn);

          setSubjective(c.subjective || '');
          setObjective(c.objective || '');
          setAssessment(c.assessment || '');
          setPlan(c.plan || '');

          if (c.observations && c.observations.length > 0) {
            const obs = c.observations[0];
            setSystolicBp(obs.systolicBp ? String(obs.systolicBp) : '');
            setDiastolicBp(obs.diastolicBp ? String(obs.diastolicBp) : '');
            setHeartRate(obs.heartRate ? String(obs.heartRate) : '');
            setTemperature(obs.temperature ? String(obs.temperature) : '');
            setTemperatureUnit(obs.temperatureUnit || 'F');
            setRespiratoryRate(obs.respiratoryRate ? String(obs.respiratoryRate) : '');
            setOxygenSaturation(obs.oxygenSaturation ? String(obs.oxygenSaturation) : '');
            setHeight(obs.height ? String(obs.height) : '');
            setHeightUnit(obs.heightUnit || 'cm');
            setWeight(obs.weight ? String(obs.weight) : '');
            setWeightUnit(obs.weightUnit || 'kg');
            setVitalsNotes(obs.notes || '');
          }

          if (c.diagnoses && c.diagnoses.length > 0) {
            setDiagnoses(
              c.diagnoses.map((d: DiagnosisRow) => ({
                name: d.name,
                codeSystem: d.codeSystem || 'ICD-10',
                code: d.code || '',
                type: d.type || 'PRIMARY',
              }))
            );
          } else {
            setDiagnoses([{ name: '', codeSystem: 'ICD-10', code: '', type: 'PRIMARY' }]);
          }

          if (c.prescriptions && c.prescriptions.length > 0) {
            const rx = c.prescriptions[0];
            setRxNotes(rx.notes || '');
            if (rx.items && rx.items.length > 0) {
              setPrescriptionItems(
                rx.items.map((item: PrescriptionItemRow) => ({
                  medicationName: item.medicationName,
                  strength: item.strength || '',
                  route: item.route || 'ORAL',
                  frequency: item.frequency || '',
                  duration: item.duration || '',
                  quantity: item.quantity || '',
                  instructions: item.instructions || '',
                }))
              );
            }
          }
        }
      } catch (err) {
        console.error('Error fetching consultation for edit:', err);
        if (!ignore) setError('Could not load consultation record.');
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadData();

    return () => {
      ignore = true;
    };
  }, [consultationId]);

  const computedBmi = useMemo(() => {
    const h = parseFloat(height);
    const w = parseFloat(weight);
    if (isNaN(h) || isNaN(w) || h <= 0 || w <= 0) return null;
    return calculateBMI(h, heightUnit, w, weightUnit);
  }, [height, heightUnit, weight, weightUnit]);

  function addDiagnosisRow() {
    setDiagnoses([
      ...diagnoses,
      { name: '', codeSystem: 'ICD-10', code: '', type: 'SECONDARY' },
    ]);
  }

  function removeDiagnosisRow(index: number) {
    if (diagnoses.length <= 1) {
      setDiagnoses([{ name: '', codeSystem: 'ICD-10', code: '', type: 'PRIMARY' }]);
      return;
    }
    setDiagnoses(diagnoses.filter((_, i) => i !== index));
  }

  function updateDiagnosisRow(index: number, field: keyof DiagnosisRow, value: string) {
    const updated = [...diagnoses];
    updated[index] = { ...updated[index], [field]: value };
    setDiagnoses(updated);
  }

  function addPrescriptionItem() {
    setPrescriptionItems([
      ...prescriptionItems,
      {
        medicationName: '',
        strength: '',
        route: 'ORAL',
        frequency: '1-0-1',
        duration: '5 days',
        quantity: '10 tabs',
        instructions: 'Take after meals',
      },
    ]);
  }

  function removePrescriptionItem(index: number) {
    setPrescriptionItems(prescriptionItems.filter((_, i) => i !== index));
  }

  function updatePrescriptionItem(index: number, field: keyof PrescriptionItemRow, value: string) {
    const updated = [...prescriptionItems];
    updated[index] = { ...updated[index], [field]: value };
    setPrescriptionItems(updated);
  }

  async function handleUpdate(targetStatus?: 'DRAFT' | 'FINALIZED') {
    const isLocked = status === 'FINALIZED' || status === 'AMENDED';

    if (isLocked && (!amendmentReason || amendmentReason.trim().length === 0)) {
      setError('Please provide a specific clinical reason for amending this finalized consultation.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let vitalsPayload = null;
      if (
        systolicBp ||
        diastolicBp ||
        heartRate ||
        temperature ||
        respiratoryRate ||
        oxygenSaturation ||
        height ||
        weight ||
        vitalsNotes
      ) {
        vitalsPayload = {
          systolicBp: systolicBp ? parseInt(systolicBp, 10) : null,
          diastolicBp: diastolicBp ? parseInt(diastolicBp, 10) : null,
          heartRate: heartRate ? parseInt(heartRate, 10) : null,
          temperature: temperature ? parseFloat(temperature) : null,
          temperatureUnit,
          respiratoryRate: respiratoryRate ? parseInt(respiratoryRate, 10) : null,
          oxygenSaturation: oxygenSaturation ? parseFloat(oxygenSaturation) : null,
          height: height ? parseFloat(height) : null,
          heightUnit,
          weight: weight ? parseFloat(weight) : null,
          weightUnit,
          notes: vitalsNotes.trim() || null,
        };
      }

      const validDiagnoses = diagnoses
        .filter((d) => d.name.trim().length > 0)
        .map((d) => ({
          name: d.name.trim(),
          codeSystem: d.codeSystem.trim() || null,
          code: d.code.trim() || null,
          type: d.type,
          clinicalStatus: 'ACTIVE',
        }));

      let prescriptionsPayload = null;
      const validRxItems = prescriptionItems.filter((item) => item.medicationName.trim().length > 0);
      if (validRxItems.length > 0) {
        prescriptionsPayload = [
          {
            status: 'ACTIVE',
            notes: rxNotes.trim() || null,
            items: validRxItems.map((item) => ({
              medicationName: item.medicationName.trim(),
              strength: item.strength.trim() || null,
              route: item.route.trim() || 'ORAL',
              frequency: item.frequency.trim(),
              duration: item.duration.trim(),
              quantity: item.quantity.trim() || null,
              instructions: item.instructions.trim() || null,
            })),
          },
        ];
      }

      const res = await fetch(`/api/consultations/${consultationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: targetStatus,
          subjective: subjective.trim() || null,
          objective: objective.trim() || null,
          assessment: assessment.trim() || null,
          plan: plan.trim() || null,
          amendmentReason: isLocked ? amendmentReason.trim() : null,
          vitals: vitalsPayload,
          diagnoses: validDiagnoses.length > 0 ? validDiagnoses : null,
          prescriptions: prescriptionsPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.details) {
          const detailMsgs = Object.values(data.details).flat().join(', ');
          setError(`${data.error}: ${detailMsgs}`);
        } else {
          setError(data.error || 'Failed to update consultation');
        }
        return;
      }

      router.push(`/dashboard/records/${consultationId}`);
    } catch (err) {
      console.error('Error updating consultation:', err);
      setError('A network error occurred while updating the consultation.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-3 border-teal-500/30 border-t-teal-400 rounded-full animate-spin mb-3" />
        <span className="text-xs text-slate-400">Loading consultation editor...</span>
      </div>
    );
  }

  const isFinalizedOrAmended = status === 'FINALIZED' || status === 'AMENDED';

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Link href="/dashboard/records" className="hover:text-teal-400 transition">
              Clinical Records
            </Link>
            <span>/</span>
            <Link href={`/dashboard/records/${consultationId}`} className="hover:text-teal-400 transition">
              {patientMrn}
            </Link>
            <span>/</span>
            <span className="text-slate-200">
              {isFinalizedOrAmended ? 'Amend Encounter' : 'Edit Draft'}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {isFinalizedOrAmended ? 'Amend Clinical Encounter' : 'Edit Draft Consultation'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Patient: <strong className="text-white">{patientName}</strong> ({patientMrn})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/records/${consultationId}`}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 text-xs font-semibold transition"
          >
            Cancel
          </Link>
          {isFinalizedOrAmended ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleUpdate()}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {saving ? 'Recording Amendment...' : 'Record Amendment'}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleUpdate('DRAFT')}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-600 transition"
              >
                {saving ? 'Saving...' : 'Save Draft Changes'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleUpdate('FINALIZED')}
                className="px-5 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 transition flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {saving ? 'Finalizing...' : 'Finalize & Sign'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs">
          {error}
        </div>
      )}

      {/* Amendment Warning Banner if Finalized */}
      {isFinalizedOrAmended && (
        <div className="p-5 rounded-2xl bg-indigo-950/40 border border-indigo-800/80 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
            <h2 className="text-sm font-bold text-indigo-200">Clinical Record Amendment Protocol</h2>
          </div>
          <p className="text-xs text-indigo-300 leading-relaxed">
            This consultation has previously been finalized and signed. In accordance with healthcare audit standards, modifications will be recorded as an addendum/amendment in the permanent audit trail.
          </p>
          <div>
            <label className="block text-xs font-semibold text-white mb-1.5">
              Reason for Amendment <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Added secondary diagnosis following laboratory report review; updated dosage instructions"
              value={amendmentReason}
              onChange={(e) => setAmendmentReason(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-indigo-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
            />
          </div>
        </div>
      )}

      {/* SOAP Notes */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider border-b border-slate-800 pb-3">
          Structured SOAP Documentation
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider">
              S — Subjective
            </label>
            <textarea
              rows={4}
              value={subjective}
              onChange={(e) => setSubjective(e.target.value)}
              className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-teal-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider">
              O — Objective
            </label>
            <textarea
              rows={4}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-teal-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider">
              A — Assessment
            </label>
            <textarea
              rows={4}
              value={assessment}
              onChange={(e) => setAssessment(e.target.value)}
              className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-teal-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider">
              P — Plan
            </label>
            <textarea
              rows={4}
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-teal-500"
            />
          </div>
        </div>
      </div>

      {/* Vital Signs */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
            Vital Signs &amp; Observations
          </h2>
          {computedBmi && (
            <span className="px-3 py-1 rounded-lg bg-teal-950 border border-teal-800 text-xs font-mono font-bold text-teal-300">
              BMI: {computedBmi}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Systolic BP (mmHg)</label>
            <input
              type="number"
              value={systolicBp}
              onChange={(e) => setSystolicBp(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Diastolic BP (mmHg)</label>
            <input
              type="number"
              value={diastolicBp}
              onChange={(e) => setDiastolicBp(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Heart Rate (bpm)</label>
            <input
              type="number"
              value={heartRate}
              onChange={(e) => setHeartRate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Temperature (°{temperatureUnit})</label>
            <input
              type="number"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Resp. Rate (/min)</label>
            <input
              type="number"
              value={respiratoryRate}
              onChange={(e) => setRespiratoryRate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">SpO2 (%)</label>
            <input
              type="number"
              step="0.1"
              value={oxygenSaturation}
              onChange={(e) => setOxygenSaturation(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Height ({heightUnit})</label>
            <input
              type="number"
              step="0.5"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Weight ({weightUnit})</label>
            <input
              type="number"
              step="0.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>
        </div>
      </div>

      {/* Diagnoses */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
            Diagnoses
          </h2>
          <button
            type="button"
            onClick={addDiagnosisRow}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-teal-300 text-xs font-semibold border border-slate-700"
          >
            + Add Diagnosis
          </button>
        </div>
        <div className="space-y-3">
          {diagnoses.map((diag, index) => (
            <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="sm:col-span-5">
                <input
                  type="text"
                  placeholder="Diagnosis name"
                  value={diag.name}
                  onChange={(e) => updateDiagnosisRow(index, 'name', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                />
              </div>
              <div className="sm:col-span-2">
                <select
                  value={diag.codeSystem}
                  onChange={(e) => updateDiagnosisRow(index, 'codeSystem', e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                >
                  <option value="ICD-10">ICD-10</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <input
                  type="text"
                  placeholder="Code"
                  value={diag.code}
                  onChange={(e) => updateDiagnosisRow(index, 'code', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <select
                  value={diag.type}
                  onChange={(e) => updateDiagnosisRow(index, 'type', e.target.value as 'PRIMARY' | 'SECONDARY')}
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                >
                  <option value="PRIMARY">Primary</option>
                  <option value="SECONDARY">Secondary</option>
                </select>
              </div>
              <div className="sm:col-span-1 text-right">
                <button
                  type="button"
                  onClick={() => removeDiagnosisRow(index)}
                  className="text-xs text-rose-400 p-1"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Prescriptions */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
            Prescription Orders (Rx)
          </h2>
          <button
            type="button"
            onClick={addPrescriptionItem}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-teal-300 text-xs font-semibold border border-slate-700"
          >
            + Add Medication
          </button>
        </div>
        <div className="space-y-3">
          {prescriptionItems.map((item, index) => (
            <div key={index} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                <div className="sm:col-span-5">
                  <label className="block text-slate-400 mb-1">Medication Name *</label>
                  <input
                    type="text"
                    value={item.medicationName}
                    onChange={(e) => updatePrescriptionItem(index, 'medicationName', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-semibold"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-slate-400 mb-1">Strength</label>
                  <input
                    type="text"
                    value={item.strength}
                    onChange={(e) => updatePrescriptionItem(index, 'strength', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-slate-400 mb-1">Route</label>
                  <select
                    value={item.route}
                    onChange={(e) => updatePrescriptionItem(index, 'route', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
                  >
                    <option value="ORAL">Oral</option>
                    <option value="TOPICAL">Topical</option>
                    <option value="INHALATION">Inhalation</option>
                    <option value="INTRAVENOUS">IV</option>
                    <option value="INTRAMUSCULAR">IM</option>
                  </select>
                </div>
                <div className="sm:col-span-1 text-right pt-4">
                  <button
                    type="button"
                    onClick={() => removePrescriptionItem(index)}
                    className="text-rose-400 font-bold p-1"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Dosage Frequency *</label>
                  <input
                    type="text"
                    value={item.frequency}
                    onChange={(e) => updatePrescriptionItem(index, 'frequency', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Duration *</label>
                  <input
                    type="text"
                    value={item.duration}
                    onChange={(e) => updatePrescriptionItem(index, 'duration', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Total Quantity</label>
                  <input
                    type="text"
                    value={item.quantity}
                    onChange={(e) => updatePrescriptionItem(index, 'quantity', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
                  />
                </div>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Instructions (e.g. After meals with water)"
                  value={item.instructions}
                  onChange={(e) => updatePrescriptionItem(index, 'instructions', e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
