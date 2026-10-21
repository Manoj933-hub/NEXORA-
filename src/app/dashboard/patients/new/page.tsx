'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewPatientPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<string>('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [bloodGroup, setBloodGroup] = useState<string>('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [address, setAddress] = useState('');
  const [allergies, setAllergies] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          dateOfBirth: dateOfBirth || null,
          gender: gender || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          bloodGroup: bloodGroup || null,
          emergencyContact: emergencyContact.trim() || null,
          address: address.trim() || null,
          allergies: allergies.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.details) {
          setFieldErrors(data.details);
        } else {
          setError(data.error || 'Failed to register patient profile.');
        }
        return;
      }

      router.push(`/dashboard/patients/${data.patient.id}`);
      router.refresh();
    } catch (err) {
      console.error('Error submitting patient:', err);
      setError('A network error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <Link href="/dashboard/patients" className="hover:text-teal-400 transition">
            Patients
          </Link>
          <span>/</span>
          <span className="text-slate-200">New Registration</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Register Patient Profile</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Create an official demographic record. A unique clinic Medical Record Number (MRN) will be automatically generated.
        </p>
      </div>

      {/* Form Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs">
          {error}
        </div>
      )}

      {/* Registration Form */}
      <form onSubmit={handleSubmit} className="p-6 sm:p-8 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
        {/* Name & Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Full Patient Name <span className="text-teal-400">*</span>
            </label>
            <input
              id="name"
              type="text"
              required
              disabled={submitting}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramesh Chandra Adhikari"
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white placeholder-slate-500 transition"
            />
            {fieldErrors.name && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.name[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="phone" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Primary Phone Number
            </label>
            <input
              id="phone"
              type="text"
              disabled={submitting}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+977 9800000000 or +91 9800000000"
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white placeholder-slate-500 transition"
            />
            {fieldErrors.phone && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.phone[0]}</p>
            )}
          </div>
        </div>

        {/* DOB, Gender, Blood Group */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="dob" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Date of Birth
            </label>
            <input
              id="dob"
              type="date"
              disabled={submitting}
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white transition"
            />
            {fieldErrors.dateOfBirth && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.dateOfBirth[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="gender" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Gender
            </label>
            <select
              id="gender"
              disabled={submitting}
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white transition"
            >
              <option value="">Select Gender</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other / Prefer not to say</option>
            </select>
            {fieldErrors.gender && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.gender[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="bloodGroup" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Blood Group
            </label>
            <select
              id="bloodGroup"
              disabled={submitting}
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white transition"
            >
              <option value="">Unknown / Not Tested</option>
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
        </div>

        {/* Email & Emergency Contact */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              disabled={submitting}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="patient@example.com"
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white placeholder-slate-500 transition"
            />
            {fieldErrors.email && (
              <p className="text-xs text-red-400 mt-1">{fieldErrors.email[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="emergencyContact" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Emergency Contact (Name & Phone)
            </label>
            <input
              id="emergencyContact"
              type="text"
              disabled={submitting}
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              placeholder="e.g. Suman (Spouse): +977 9840000000"
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white placeholder-slate-500 transition"
            />
          </div>
        </div>

        {/* Street Address */}
        <div>
          <label htmlFor="address" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Address / City
          </label>
          <input
            id="address"
            type="text"
            disabled={submitting}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ward No. 3, Biratnagar or Sector 18, Noida"
            className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white placeholder-slate-500 transition"
          />
        </div>

        {/* Known Allergies & Clinical Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="allergies" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Known Drug / Environmental Allergies
            </label>
            <textarea
              id="allergies"
              rows={3}
              disabled={submitting}
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="e.g. Penicillin, NSAIDs, Sulfa drugs"
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white placeholder-slate-500 transition"
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Intake / Baseline Notes
            </label>
            <textarea
              id="notes"
              rows={3}
              disabled={submitting}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Relevant medical history, pre-existing chronic conditions..."
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white placeholder-slate-500 transition"
            />
          </div>
        </div>

        {/* Form Actions */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
          <Link
            href="/dashboard/patients"
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 rounded-lg text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md shadow-teal-500/20 disabled:opacity-50 transition"
          >
            {submitting ? 'Registering Patient...' : 'Save & Register Patient'}
          </button>
        </div>
      </form>
    </div>
  );
}
