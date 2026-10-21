'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface PatientOption {
  id: string;
  mrn: string;
  name: string;
  phone?: string | null;
}

interface PractitionerOption {
  userId: string;
  name: string;
  role: string;
}

function NewAppointmentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedPatientId = searchParams.get('patientId');

  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [practitioners, setPractitioners] = useState<PractitionerOption[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Form State
  const [selectedPatientId, setSelectedPatientId] = useState(preselectedPatientId || '');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('09:30');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadFormOptions() {
      try {
        const [patientsRes, meRes] = await Promise.all([
          fetch('/api/patients?limit=50'),
          fetch('/api/auth/me'),
        ]);

        if (patientsRes.ok) {
          const pData = await patientsRes.json();
          setPatients(pData.patients || []);
        }

        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData.activeClinic?.id) {
            const membersRes = await fetch(`/api/clinics/${meData.activeClinic.id}/members`);
            if (membersRes.ok) {
              const mData = await membersRes.json();
              // Filter doctors or practitioners
              const docs = (mData.members || []).filter(
                (m: PractitionerOption) => m.role === 'DOCTOR' || m.role === 'OWNER' || m.role === 'ADMIN'
              );
              setPractitioners(docs);
              if (docs.length > 0 && !selectedDoctorId) {
                setSelectedDoctorId(docs[0].userId);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error loading appointment booking options:', err);
      } finally {
        setLoadingData(false);
      }
    }

    loadFormOptions();
  }, [selectedDoctorId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const startIso = new Date(`${date}T${startTime}:00`).toISOString();
      const endIso = new Date(`${date}T${endTime}:00`).toISOString();

      if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
        setError('End time must be after start time.');
        setSubmitting(false);
        return;
      }

      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatientId,
          doctorId: selectedDoctorId || null,
          startTime: startIso,
          endTime: endIso,
          reason: reason.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to book appointment.');
        return;
      }

      router.push('/dashboard/appointments');
      router.refresh();
    } catch (err) {
      console.error('Error scheduling appointment:', err);
      setError('A network error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <Link href="/dashboard/appointments" className="hover:text-teal-400 transition">
            Appointments
          </Link>
          <span>/</span>
          <span className="text-slate-200">New Booking</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Schedule Patient Appointment</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Book an in-person clinic consultation slot. Doctor schedule conflicts will be validated automatically.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs">
          {error}
        </div>
      )}

      {loadingData ? (
        <div className="py-16 text-center text-xs text-slate-400">Loading clinic schedule data...</div>
      ) : (
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
          {/* Patient Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="patient" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Select Patient <span className="text-teal-400">*</span>
              </label>
              <Link href="/dashboard/patients/new" className="text-xs text-teal-400 hover:underline">
                + Register New Patient
              </Link>
            </div>
            <select
              id="patient"
              required
              disabled={submitting}
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white"
            >
              <option value="">Select a registered patient...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (MRN: {p.mrn}) {p.phone ? `— ${p.phone}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Practitioner Selection */}
          <div>
            <label htmlFor="doctor" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Assigned Doctor / Practitioner
            </label>
            <select
              id="doctor"
              disabled={submitting}
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white"
            >
              <option value="">Unassigned (General Clinic Queue)</option>
              {practitioners.map((pr) => (
                <option key={pr.userId} value={pr.userId}>
                  Dr. {pr.name} ({pr.role})
                </option>
              ))}
            </select>
          </div>

          {/* Date, Start Time, End Time */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="aptDate" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Consultation Date <span className="text-teal-400">*</span>
              </label>
              <input
                id="aptDate"
                type="date"
                required
                disabled={submitting}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white"
              />
            </div>

            <div>
              <label htmlFor="startTime" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Start Time <span className="text-teal-400">*</span>
              </label>
              <input
                id="startTime"
                type="time"
                required
                disabled={submitting}
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  // Auto-suggest 30 min later
                  const [h, m] = e.target.value.split(':').map(Number);
                  const endMin = (m + 30) % 60;
                  const endHour = h + Math.floor((m + 30) / 60);
                  const formatted = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
                  setEndTime(formatted);
                }}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white"
              />
            </div>

            <div>
              <label htmlFor="endTime" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                End Time <span className="text-teal-400">*</span>
              </label>
              <input
                id="endTime"
                type="time"
                required
                disabled={submitting}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white"
              />
            </div>
          </div>

          {/* Reason / Chief Complaint */}
          <div>
            <label htmlFor="reason" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Reason for Visit / Chief Complaint
            </label>
            <input
              id="reason"
              type="text"
              disabled={submitting}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Follow-up consultation, Seasonal viral fever, Routine checkup"
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white placeholder-slate-500 transition"
            />
          </div>

          {/* Internal Notes */}
          <div>
            <label htmlFor="notes" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Internal Reception Notes
            </label>
            <textarea
              id="notes"
              rows={2}
              disabled={submitting}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional scheduling notes..."
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white placeholder-slate-500 transition"
            />
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <Link
              href="/dashboard/appointments"
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting || !selectedPatientId}
              className="px-5 py-2.5 rounded-lg text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md shadow-teal-500/20 disabled:opacity-50 transition"
            >
              {submitting ? 'Booking Slot...' : 'Confirm & Schedule Appointment'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function NewAppointmentPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-xs text-slate-400">Loading booking screen...</div>}>
      <NewAppointmentForm />
    </Suspense>
  );
}
