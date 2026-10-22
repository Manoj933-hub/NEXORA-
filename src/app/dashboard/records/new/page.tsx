'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { calculateBMI } from '@/lib/validations/clinical';

interface PatientOption {
  id: string;
  mrn: string;
  name: string;
  phone?: string | null;
  gender?: string | null;
  bloodGroup?: string | null;
  allergies?: string | null;
}

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

export default function NewConsultationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedPatientId = searchParams.get('patientId') || '';
  const preselectedAppointmentId = searchParams.get('appointmentId') || '';

  // Patient selection state
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState(preselectedPatientId);
  const [loadingPatients, setLoadingPatients] = useState(false);

  // SOAP State
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');

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
  const [diagnoses, setDiagnoses] = useState<DiagnosisRow[]>([
    { name: '', codeSystem: 'ICD-10', code: '', type: 'PRIMARY' },
  ]);

  // Prescriptions State
  const [rxNotes, setRxNotes] = useState('');
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionItemRow[]>([]);

  // Submission State
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load patients if none preselected or to provide switcher
  useEffect(() => {
    let ignore = false;
    async function fetchPatients() {
      setLoadingPatients(true);
      try {
        const res = await fetch('/api/patients?limit=100');
        if (!res.ok) throw new Error('Failed to load patients list');
        const data = await res.json();
        if (!ignore) {
          setPatients(data.patients || []);
          if (!selectedPatientId && data.patients && data.patients.length > 0 && !preselectedPatientId) {
            setSelectedPatientId(data.patients[0].id);
          }
        }
      } catch (err) {
        console.error('Error fetching patients for encounter:', err);
      } finally {
        if (!ignore) {
          setLoadingPatients(false);
        }
      }
    }

    fetchPatients();

    return () => {
      ignore = true;
    };
  }, [preselectedPatientId, selectedPatientId]);

  // Live BMI Calculation
  const computedBmi = useMemo(() => {
    const h = parseFloat(height);
    const w = parseFloat(weight);
    if (isNaN(h) || isNaN(w) || h <= 0 || w <= 0) return null;
    return calculateBMI(h, heightUnit, w, weightUnit);
  }, [height, heightUnit, weight, weightUnit]);

  // Find active patient details
  const activePatient = useMemo(() => {
    return patients.find((p) => p.id === selectedPatientId) || null;
  }, [patients, selectedPatientId]);

  // Diagnosis handlers
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

  // Prescription handlers
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

  async function handleSubmit(targetStatus: 'DRAFT' | 'FINALIZED') {
    if (!selectedPatientId) {
      setError('Please select a patient for this consultation encounter.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Build vitals payload if any field filled
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

      // Filter valid diagnoses
      const validDiagnoses = diagnoses
        .filter((d) => d.name.trim().length > 0)
        .map((d) => ({
          name: d.name.trim(),
          codeSystem: d.codeSystem.trim() || null,
          code: d.code.trim() || null,
          type: d.type,
          clinicalStatus: 'ACTIVE',
        }));

      // Filter valid prescriptions
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

      const res = await fetch('/api/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatientId,
          appointmentId: preselectedAppointmentId || null,
          status: targetStatus,
          subjective: subjective.trim() || null,
          objective: objective.trim() || null,
          assessment: assessment.trim() || null,
          plan: plan.trim() || null,
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
          setError(data.error || 'Failed to save consultation encounter');
        }
        return;
      }

      router.push(`/dashboard/records/${data.consultation.id}`);
    } catch (err) {
      console.error('Error saving consultation:', err);
      setError('A network error occurred while saving the consultation.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Link href="/dashboard/records" className="hover:text-teal-400 transition">
              Clinical Records
            </Link>
            <span>/</span>
            <span className="text-slate-200">New Consultation Encounter</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Record Clinical Consultation</h1>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/records"
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 text-xs font-semibold transition"
          >
            Cancel
          </Link>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSubmit('DRAFT')}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-600 transition"
          >
            {saving ? 'Saving...' : 'Save as Draft'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSubmit('FINALIZED')}
            className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 transition flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {saving ? 'Signing...' : 'Finalize & Sign'}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs">
          {error}
        </div>
      )}

      {/* 1. Patient Selection & Context Card */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            Patient Context
          </h2>
          {preselectedAppointmentId && (
            <span className="text-[11px] font-mono text-teal-300 px-2 py-0.5 rounded bg-teal-950 border border-teal-800">
              Linked to Appointment
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">
              Select Patient <span className="text-teal-400">*</span>
            </label>
            {loadingPatients ? (
              <div className="text-xs text-slate-500">Loading clinic patients...</div>
            ) : (
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                disabled={Boolean(preselectedPatientId) || saving}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.mrn}) {p.phone ? `— ${p.phone}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {activePatient && (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs">{activePatient.name}</span>
                <span className="font-mono text-[11px] text-teal-300 font-semibold">{activePatient.mrn}</span>
              </div>
              <div className="text-[11px] text-slate-400 flex flex-wrap gap-x-4">
                <span>Gender: <strong className="text-slate-200">{activePatient.gender || '—'}</strong></span>
                <span>Blood: <strong className="text-rose-300 font-mono">{activePatient.bloodGroup || '—'}</strong></span>
              </div>
              {activePatient.allergies && (
                <div className="text-[11px] text-rose-300 pt-0.5">
                  ⚠️ Allergies: <strong>{activePatient.allergies}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Structured SOAP Documentation */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
        <div className="border-b border-slate-800 pb-3">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            Structured SOAP Notes
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Document clinical reasoning following the standard healthcare SOAP format.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Subjective */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider">
              S — Subjective (Symptoms &amp; History)
            </label>
            <textarea
              rows={4}
              value={subjective}
              onChange={(e) => setSubjective(e.target.value)}
              placeholder="Chief complaints, duration, history of presenting illness, patient-reported symptoms..."
              className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-teal-500 placeholder-slate-600"
            />
          </div>

          {/* Objective */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider">
              O — Objective (Examination Findings)
            </label>
            <textarea
              rows={4}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="General appearance, systemic examination, throat, chest, abdomen findings..."
              className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-teal-500 placeholder-slate-600"
            />
          </div>

          {/* Assessment */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider">
              A — Assessment (Clinical Impression)
            </label>
            <textarea
              rows={4}
              value={assessment}
              onChange={(e) => setAssessment(e.target.value)}
              placeholder="Clinical reasoning, differential diagnoses, disease severity evaluation..."
              className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-teal-500 placeholder-slate-600"
            />
          </div>

          {/* Plan */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-teal-300 uppercase tracking-wider">
              P — Plan (Treatment &amp; Follow-up)
            </label>
            <textarea
              rows={4}
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="Patient counseling, lifestyle/diet advice, follow-up date, investigation tests requested..."
              className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-teal-500 placeholder-slate-600"
            />
          </div>
        </div>
      </div>

      {/* 3. Vital Signs & Clinical Observations */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              Vital Signs &amp; Observations
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Calibrated physiological metrics with unit tracking and automatic BMI calculation.
            </p>
          </div>
          {computedBmi && (
            <div className="px-3 py-1 rounded-lg bg-teal-950/80 border border-teal-800 text-xs font-mono font-bold text-teal-300">
              Calculated BMI: {computedBmi}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          {/* BP Systolic */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Systolic BP (mmHg)</label>
            <input
              type="number"
              min={40}
              max={300}
              placeholder="120"
              value={systolicBp}
              onChange={(e) => setSystolicBp(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>

          {/* BP Diastolic */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Diastolic BP (mmHg)</label>
            <input
              type="number"
              min={30}
              max={200}
              placeholder="80"
              value={diastolicBp}
              onChange={(e) => setDiastolicBp(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>

          {/* Heart Rate */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Heart Rate (bpm)</label>
            <input
              type="number"
              min={20}
              max={300}
              placeholder="72"
              value={heartRate}
              onChange={(e) => setHeartRate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>

          {/* Temperature */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium flex items-center justify-between">
              <span>Temperature</span>
              <span className="text-[10px] text-teal-400 cursor-pointer" onClick={() => setTemperatureUnit(temperatureUnit === 'F' ? 'C' : 'F')}>
                [Switch to °{temperatureUnit === 'F' ? 'C' : 'F'}]
              </span>
            </label>
            <div className="flex">
              <input
                type="number"
                step="0.1"
                placeholder={temperatureUnit === 'F' ? '98.6' : '37.0'}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                className="w-full px-3 py-2 rounded-l-lg bg-slate-950 border border-slate-800 text-white font-mono"
              />
              <span className="px-2.5 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-r-lg border-y border-r border-slate-800">
                °{temperatureUnit}
              </span>
            </div>
          </div>

          {/* Respiratory Rate */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Resp. Rate (/min)</label>
            <input
              type="number"
              min={4}
              max={80}
              placeholder="16"
              value={respiratoryRate}
              onChange={(e) => setRespiratoryRate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>

          {/* SpO2 */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">SpO2 Oxygen (%)</label>
            <input
              type="number"
              step="0.1"
              min={50}
              max={100}
              placeholder="98.5"
              value={oxygenSaturation}
              onChange={(e) => setOxygenSaturation(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
            />
          </div>

          {/* Height */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Height ({heightUnit})</label>
            <div className="flex">
              <input
                type="number"
                step="0.5"
                placeholder={heightUnit === 'cm' ? '172' : '68'}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="w-full px-3 py-2 rounded-l-lg bg-slate-950 border border-slate-800 text-white font-mono"
              />
              <select
                value={heightUnit}
                onChange={(e) => setHeightUnit(e.target.value as 'cm' | 'in')}
                className="px-2 bg-slate-800 text-slate-300 text-xs rounded-r-lg border-y border-r border-slate-800"
              >
                <option value="cm">cm</option>
                <option value="in">in</option>
              </select>
            </div>
          </div>

          {/* Weight */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">Weight ({weightUnit})</label>
            <div className="flex">
              <input
                type="number"
                step="0.5"
                placeholder={weightUnit === 'kg' ? '68' : '150'}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full px-3 py-2 rounded-l-lg bg-slate-950 border border-slate-800 text-white font-mono"
              />
              <select
                value={weightUnit}
                onChange={(e) => setWeightUnit(e.target.value as 'kg' | 'lbs')}
                className="px-2 bg-slate-800 text-slate-300 text-xs rounded-r-lg border-y border-r border-slate-800"
              >
                <option value="kg">kg</option>
                <option value="lbs">lbs</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <input
            type="text"
            placeholder="Additional observations notes (e.g. Patient rested 5 minutes prior to blood pressure reading)"
            value={vitalsNotes}
            onChange={(e) => setVitalsNotes(e.target.value)}
            className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300"
          />
        </div>
      </div>

      {/* 4. Diagnoses Management */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              Diagnosis Management
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Specify primary and secondary diagnoses with optional ICD-10 or custom terminology codes.
            </p>
          </div>
          <button
            type="button"
            onClick={addDiagnosisRow}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-teal-300 text-xs font-semibold border border-slate-700 transition"
          >
            + Add Diagnosis
          </button>
        </div>

        <div className="space-y-3">
          {diagnoses.map((diag, index) => (
            <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="sm:col-span-5">
                <input
                  type="text"
                  placeholder="Diagnosis name (e.g. Acute Pharyngitis)"
                  value={diag.name}
                  onChange={(e) => updateDiagnosisRow(index, 'name', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:border-teal-500"
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
                  placeholder="Code (e.g. J02.9)"
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
                  className="text-xs text-rose-400 hover:text-rose-300 p-1.5"
                  title="Remove diagnosis"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Prescription Generator */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              Digital Prescription Foundation
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Structured medication orders with route, strength, frequency instructions, and quantity.
            </p>
          </div>
          <button
            type="button"
            onClick={addPrescriptionItem}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-teal-300 text-xs font-semibold border border-slate-700 transition"
          >
            + Add Medication
          </button>
        </div>

        {prescriptionItems.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
            No medications added. Click &ldquo;+ Add Medication&rdquo; to prescribe treatments.
          </div>
        ) : (
          <div className="space-y-3">
            {prescriptionItems.map((item, index) => (
              <div key={index} className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <div className="sm:col-span-5">
                    <label className="block text-slate-400 mb-1">Medication Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Paracetamol"
                      value={item.medicationName}
                      onChange={(e) => updatePrescriptionItem(index, 'medicationName', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-semibold"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-slate-400 mb-1">Strength</label>
                    <input
                      type="text"
                      placeholder="e.g. 500 mg or 10 ml"
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
                      <option value="OPHTHALMIC">Eye Drops</option>
                    </select>
                  </div>
                  <div className="sm:col-span-1 text-right pt-4">
                    <button
                      type="button"
                      onClick={() => removePrescriptionItem(index)}
                      className="text-rose-400 hover:text-rose-300 font-bold p-1"
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
                      placeholder="e.g. 1-0-1 or Twice daily"
                      value={item.frequency}
                      onChange={(e) => updatePrescriptionItem(index, 'frequency', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Duration *</label>
                    <input
                      type="text"
                      placeholder="e.g. 5 days or 1 month"
                      value={item.duration}
                      onChange={(e) => updatePrescriptionItem(index, 'duration', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Total Quantity</label>
                    <input
                      type="text"
                      placeholder="e.g. 10 tablets"
                      value={item.quantity}
                      onChange={(e) => updatePrescriptionItem(index, 'quantity', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
                    />
                  </div>
                </div>

                <div>
                  <input
                    type="text"
                    placeholder="Specific patient instructions (e.g. Take after food with warm water; avoid driving)"
                    value={item.instructions}
                    onChange={(e) => updatePrescriptionItem(index, 'instructions', e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 placeholder-slate-600"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <textarea
            rows={2}
            placeholder="General prescription advice, lifestyle restrictions, diet modifications, emergency red-flag symptoms..."
            value={rxNotes}
            onChange={(e) => setRxNotes(e.target.value)}
            className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 placeholder-slate-600 focus:border-teal-500"
          />
        </div>
      </div>

      {/* Bottom Action Footer */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
        <Link
          href="/dashboard/records"
          className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition"
        >
          Cancel
        </Link>
        <button
          type="button"
          disabled={saving}
          onClick={() => handleSubmit('DRAFT')}
          className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-600 transition"
        >
          {saving ? 'Saving...' : 'Save as Draft'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => handleSubmit('FINALIZED')}
          className="px-6 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-teal-500/20 transition flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {saving ? 'Finalizing...' : 'Finalize & Sign Consultation'}
        </button>
      </div>
    </div>
  );
}
