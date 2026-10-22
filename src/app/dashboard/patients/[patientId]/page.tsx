'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface PatientDetails {
  id: string;
  mrn: string;
  name: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  bloodGroup?: string | null;
  allergies?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AppointmentSummary {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  reason?: string | null;
  doctor?: { id: string; name: string } | null;
}
function computeAgeDisplay(dobString?: string | null): string {
  if (!dobString) return 'Not recorded';
  const dob = new Date(dobString);
  if (isNaN(dob.getTime())) return 'Not recorded';
  const diffMs = Date.now() - dob.getTime();
  const ageDt = new Date(diffMs);
  const age = Math.abs(ageDt.getUTCFullYear() - 1970);
  return `${age} years (${dob.toLocaleDateString()})`;
}

interface ConsultationSummary {
  id: string;
  status: string;
  createdAt: string;
  assessment?: string | null;
  doctor?: { id: string; name: string } | null;
  diagnoses?: Array<{ name: string; type: string }> | null;
}

export default function PatientProfilePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const resolvedParams = use(params);
  const patientId = resolvedParams.patientId;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<PatientDetails | null>(null);
  const [patientAge, setPatientAge] = useState<string>('Not recorded');
  const [appointments, setAppointments] = useState<AppointmentSummary[]>([]);
  const [consultations, setConsultations] = useState<ConsultationSummary[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form edit state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editBloodGroup, setEditBloodGroup] = useState('');
  const [editEmergencyContact, setEditEmergencyContact] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editAllergies, setEditAllergies] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadPatient() {
      try {
        const res = await fetch(`/api/patients/${patientId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError('Patient record not found in active clinic.');
          } else {
            setError('Failed to load patient profile.');
          }
          return;
        }

        const data = await res.json();
        const p: PatientDetails = data.patient;
        setPatient(p);
        setPatientAge(computeAgeDisplay(p.dateOfBirth));
        setAppointments(data.appointments || []);

        try {
          const histRes = await fetch(`/api/patients/${patientId}/clinical-history`);
          if (histRes.ok) {
            const histData = await histRes.json();
            setConsultations(histData.consultations || []);
          }
        } catch (e) {
          console.error('Failed to load clinical history:', e);
        }

        setEditName(p.name);
        setEditPhone(p.phone || '');
        setEditGender(p.gender || '');
        setEditBloodGroup(p.bloodGroup || '');
        setEditEmergencyContact(p.emergencyContact || '');
        setEditAddress(p.address || '');
        setEditAllergies(p.allergies || '');
        setEditNotes(p.notes || '');
      } catch (err) {
        console.error('Error fetching patient profile:', err);
        setError('A network error occurred while loading patient.');
      } finally {
        setLoading(false);
      }
    }

    loadPatient();
  }, [patientId]);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/patients/${patientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          phone: editPhone.trim() || null,
          gender: editGender || null,
          bloodGroup: editBloodGroup || null,
          emergencyContact: editEmergencyContact.trim() || null,
          address: editAddress.trim() || null,
          allergies: editAllergies.trim() || null,
          notes: editNotes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update patient profile.');
        return;
      }

      setPatient(data.patient);
      setPatientAge(computeAgeDisplay(data.patient.dateOfBirth));
      setSuccessMessage('Patient record updated successfully.');
      setIsEditing(false);
      router.refresh();
    } catch (err) {
      console.error('Error updating patient:', err);
      setError('A network error occurred while saving.');
    } finally {
      setSaving(false);
    }
  }


  function getStatusBadge(status: string) {
    switch (status) {
      case 'SCHEDULED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-950 text-sky-300 border border-sky-800">Scheduled</span>;
      case 'CHECKED_IN':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800">Checked In</span>;
      case 'IN_PROGRESS':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800">In Consultation</span>;
      case 'COMPLETED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">Completed</span>;
      case 'CANCELLED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-300 border border-rose-800">Cancelled</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300">{status}</span>;
    }
  }

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-3 border-teal-500/30 border-t-teal-400 rounded-full animate-spin mb-3" />
        <span className="text-xs text-slate-400">Loading patient profile...</span>
      </div>
    );
  }

  if (error && !patient) {
    return (
      <div className="p-6 rounded-xl bg-red-950/40 border border-red-800 text-red-200 space-y-3">
        <div className="font-semibold">{error}</div>
        <Link href="/dashboard/patients" className="text-xs text-teal-400 underline inline-block">
          Return to Patients Directory
        </Link>
      </div>
    );
  }

  if (!patient) return null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Link href="/dashboard/patients" className="hover:text-teal-400 transition">
              Patients
            </Link>
            <span>/</span>
            <span className="text-slate-200">{patient.mrn}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">{patient.name}</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-teal-950/80 text-teal-300 border border-teal-700/60 font-mono text-xs font-semibold">
              {patient.mrn}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/records/new?patientId=${patient.id}`}
            className="px-3.5 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 transition flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Start Consultation
          </Link>
          <Link
            href={`/dashboard/appointments/new?patientId=${patient.id}`}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Book Appointment
          </Link>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-semibold text-xs transition"
          >
            {isEditing ? 'Cancel Edit' : 'Edit Profile'}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-xs">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs">
          {error}
        </div>
      )}

      {/* Profile Overview or Edit Form */}
      {isEditing ? (
        <form onSubmit={handleUpdate} className="p-6 sm:p-8 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
          <div className="font-semibold text-white text-sm border-b border-slate-800 pb-3">
            Edit Demographic Information
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Patient Name <span className="text-teal-400">*</span>
              </label>
              <input
                type="text"
                required
                disabled={saving}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Contact Phone
              </label>
              <input
                type="text"
                disabled={saving}
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Gender
              </label>
              <select
                disabled={saving}
                value={editGender}
                onChange={(e) => setEditGender(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white"
              >
                <option value="">Select Gender</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Blood Group
              </label>
              <select
                disabled={saving}
                value={editBloodGroup}
                onChange={(e) => setEditBloodGroup(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white"
              >
                <option value="">Unknown</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Emergency Contact
              </label>
              <input
                type="text"
                disabled={saving}
                value={editEmergencyContact}
                onChange={(e) => setEditEmergencyContact(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Address
            </label>
            <input
              type="text"
              disabled={saving}
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Known Allergies
              </label>
              <textarea
                rows={2}
                disabled={saving}
                value={editAllergies}
                onChange={(e) => setEditAllergies(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Clinical Notes
              </label>
              <textarea
                rows={2}
                disabled={saving}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 disabled:opacity-50 transition"
            >
              {saving ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left 2 Cols: Demographics */}
          <div className="md:col-span-2 space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Demographic Profile</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5">Primary Phone</span>
                  <span className="font-semibold text-white font-mono">{patient.phone || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Email</span>
                  <span className="font-semibold text-white">{patient.email || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Age &amp; Date of Birth</span>
                  <span className="font-semibold text-white">{patientAge}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Gender</span>
                  <span className="font-semibold text-white">{patient.gender || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Blood Group</span>
                  <span className="font-semibold text-rose-300 font-mono font-bold">
                    {patient.bloodGroup || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Emergency Contact</span>
                  <span className="font-semibold text-white">{patient.emergencyContact || '—'}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-400 block mb-0.5">Residential Address</span>
                  <span className="font-semibold text-white">{patient.address || '—'}</span>
                </div>
              </div>
            </div>

            {/* Allergies & Notes */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Medical Notes &amp; Allergies</h2>
              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-900/40">
                  <span className="text-rose-300 font-semibold block mb-1">Drug &amp; Environmental Allergies</span>
                  <p className="text-slate-300 leading-relaxed">
                    {patient.allergies || 'No known allergies recorded.'}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800">
                  <span className="text-slate-400 font-semibold block mb-1">Baseline Clinical Notes</span>
                  <p className="text-slate-300 leading-relaxed">
                    {patient.notes || 'No baseline notes recorded.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Col: Appointment History */}
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Visits &amp; Appointments</h2>
                <Link
                  href={`/dashboard/appointments/new?patientId=${patient.id}`}
                  className="text-xs text-teal-400 hover:underline font-medium"
                >
                  + Book
                </Link>
              </div>

              {appointments.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No appointments recorded for this patient.
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {appointments.map((apt) => (
                    <div
                      key={apt.id}
                      className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">
                          {new Date(apt.startTime).toLocaleDateString()}
                        </span>
                        {getStatusBadge(apt.status)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(apt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                        {new Date(apt.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {apt.doctor && (
                        <div className="text-[11px] text-teal-300">
                          Dr. {apt.doctor.name}
                        </div>
                      )}
                      {apt.reason && (
                        <div className="text-[11px] text-slate-400 italic">
                          &ldquo;{apt.reason}&rdquo;
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Clinical Consultations / EMR */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-teal-400" />
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Clinical Consultations (EMR)</h2>
                </div>
                <Link
                  href={`/dashboard/records/new?patientId=${patient.id}`}
                  className="text-xs text-teal-400 hover:underline font-medium"
                >
                  + New SOAP
                </Link>
              </div>

              {consultations.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 space-y-2">
                  <p>No consultation records logged yet for this patient.</p>
                  <Link
                    href={`/dashboard/records/new?patientId=${patient.id}`}
                    className="inline-block px-3 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-semibold transition"
                  >
                    Record First Consultation
                  </Link>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {consultations.map((c) => (
                    <div
                      key={c.id}
                      className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs space-y-2 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            c.status === 'FINALIZED'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : c.status === 'AMENDED'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>
                      {c.doctor && (
                        <div className="text-[11px] text-teal-300">
                          Attending: Dr. {c.doctor.name}
                        </div>
                      )}
                      {c.diagnoses && c.diagnoses.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.diagnoses.map((d, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-700 text-slate-300"
                            >
                              {d.name} {d.type === 'PRIMARY' ? '(Primary)' : ''}
                            </span>
                          ))}
                        </div>
                      )}
                      {c.assessment && (
                        <div className="text-[11px] text-slate-400 italic line-clamp-2">
                          &ldquo;{c.assessment}&rdquo;
                        </div>
                      )}
                      <div className="pt-1 border-t border-slate-900 flex justify-end">
                        <Link
                          href={`/dashboard/records/${c.id}`}
                          className="text-[11px] text-teal-400 hover:underline font-semibold"
                        >
                          View Full SOAP Encounter →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
