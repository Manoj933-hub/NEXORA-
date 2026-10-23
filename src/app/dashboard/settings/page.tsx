'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { RoleBadge } from '@/components/dashboard/role-badge';
import type { ClinicRole } from '@/lib/auth/permissions';

interface ClinicProfile {
  id: string;
  name: string;
  slug: string;
  country: 'IN' | 'NP';
  currency: 'INR' | 'NPR';
  phone?: string | null;
  address?: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ResponseData {
  clinic: ClinicProfile;
  membership: {
    role: ClinicRole;
    isActive: boolean;
    joinedAt: string;
  };
  stats: {
    totalActiveMembers: number;
  };
}

export default function ClinicSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [role, setRole] = useState<ClinicRole | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [country, setCountry] = useState<'IN' | 'NP'>('IN');
  const [currency, setCurrency] = useState<'INR' | 'NPR'>('INR');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  // Status & Notifications
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadClinicProfile() {
      try {
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) throw new Error('Unauthenticated');
        const meData = await meRes.json();

        if (!meData.activeClinic?.id) {
          setError('No active clinic found.');
          setLoading(false);
          return;
        }

        const id = meData.activeClinic.id;
        setClinicId(id);

        const clinicRes = await fetch(`/api/clinics/${id}`);
        if (!clinicRes.ok) throw new Error('Failed to load clinic');
        const data: ResponseData = await clinicRes.json();

        setRole(data.membership.role);
        setName(data.clinic.name);
        setCountry(data.clinic.country);
        setCurrency(data.clinic.currency);
        setPhone(data.clinic.phone || '');
        setAddress(data.clinic.address || '');
      } catch (err) {
        console.error('Error loading clinic profile:', err);
        setError('Failed to load clinic profile details.');
      } finally {
        setLoading(false);
      }
    }

    loadClinicProfile();
  }, []);

  const canEdit = role === 'OWNER' || role === 'ADMIN';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !clinicId) return;

    setSaving(true);
    setError(null);
    setFieldErrors({});
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/clinics/${clinicId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          country,
          currency,
          phone: phone.trim() ? phone.trim() : null,
          address: address.trim() ? address.trim() : null,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        if (result.details) {
          setFieldErrors(result.details);
        } else {
          setError(result.error || 'Failed to update clinic profile.');
        }
        return;
      }

      setSuccessMessage('Clinic details updated successfully.');
      setName(result.clinic.name);
      setCountry(result.clinic.country);
      setCurrency(result.clinic.currency);
      setPhone(result.clinic.phone || '');
      setAddress(result.clinic.address || '');
    } catch (err) {
      console.error('Update clinic error:', err);
      setError('An unexpected network error occurred.');
    } finally {
      setSaving(false);
    }
  }

  function handleCountryChange(newCountry: 'IN' | 'NP') {
    setCountry(newCountry);
    // Suggest regional currency
    if (newCountry === 'NP') setCurrency('NPR');
    if (newCountry === 'IN') setCurrency('INR');
  }

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-3 border-teal-500/30 border-t-teal-400 rounded-full animate-spin mb-3" />
        <span className="text-xs text-slate-400">Loading clinic configuration...</span>
      </div>
    );
  }

  if (error && !clinicId) {
    return (
      <div className="p-6 rounded-xl bg-red-950/40 border border-red-800 text-red-200">
        <div className="font-semibold">{error}</div>
        <Link href="/dashboard" className="text-xs text-teal-400 underline mt-3 inline-block">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Clinic Profile & Settings</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Manage operational details, contact channels, and currency configurations for this clinic.
            </p>
          </div>
          {role && <RoleBadge role={role} size="md" />}
        </div>
      </div>

      {/* Role Notice for Restricted Members */}
      {!canEdit && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 text-amber-200 text-xs flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <span className="font-semibold text-amber-100">View-only mode:</span> Your current role ({role}) does not hold clinic administrative permissions. Only Clinic Owners and Administrators can modify these settings.
          </div>
        </div>
      )}

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-xs flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {successMessage}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs">
          {error}
        </div>
      )}

      {/* Profile Form */}
      <form onSubmit={handleSubmit} className="p-6 sm:p-8 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
        <div>
          <label htmlFor="name" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Clinic Name <span className="text-teal-400">*</span>
          </label>
          <input
            id="name"
            type="text"
            required
            disabled={!canEdit || saving}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm text-white disabled:opacity-60 disabled:cursor-not-allowed transition"
            placeholder="e.g. Biratnagar Specialty Clinic"
          />
          {fieldErrors.name && (
            <p className="text-xs text-red-400 mt-1.5">{fieldErrors.name[0]}</p>
          )}
        </div>

        {/* Region & Currency */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label htmlFor="country" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Country Region <span className="text-teal-400">*</span>
            </label>
            <select
              id="country"
              disabled={!canEdit || saving}
              value={country}
              onChange={(e) => handleCountryChange(e.target.value as 'IN' | 'NP')}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              <option value="IN">India (IN)</option>
              <option value="NP">Nepal (NP)</option>
            </select>
          </div>

          <div>
            <label htmlFor="currency" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Default Currency <span className="text-teal-400">*</span>
            </label>
            <select
              id="currency"
              disabled={!canEdit || saving}
              value={currency}
              onChange={(e) => setCurrency(e.target.value as 'INR' | 'NPR')}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              <option value="INR">INR (₹ - Indian Rupee)</option>
              <option value="NPR">NPR (रू - Nepalese Rupee)</option>
            </select>
          </div>
        </div>

        {/* Contact Phone */}
        <div>
          <label htmlFor="phone" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Contact Phone Number
          </label>
          <input
            id="phone"
            type="text"
            disabled={!canEdit || saving}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white disabled:opacity-60 disabled:cursor-not-allowed transition"
            placeholder={country === 'NP' ? '+977 9800000000' : '+91 9800000000'}
          />
          {fieldErrors.phone && (
            <p className="text-xs text-red-400 mt-1.5">{fieldErrors.phone[0]}</p>
          )}
        </div>

        {/* Address */}
        <div>
          <label htmlFor="address" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Clinic Street Address / City
          </label>
          <textarea
            id="address"
            rows={3}
            disabled={!canEdit || saving}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white disabled:opacity-60 disabled:cursor-not-allowed transition"
            placeholder="e.g. Ward 4, New Road, Kathmandu"
          />
          {fieldErrors.address && (
            <p className="text-xs text-red-400 mt-1.5">{fieldErrors.address[0]}</p>
          )}
        </div>

        {/* Submit Actions */}
        {canEdit && (
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <Link
              href="/dashboard"
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md shadow-teal-500/20 disabled:opacity-50 transition"
            >
              {saving ? 'Saving Changes...' : 'Save Profile Changes'}
            </button>
          </div>
        )}
      </form>

      {/* Patient Communications & Alerts Card */}
      <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-teal-400" />
            <h3 className="text-sm font-semibold text-white">Patient Communications & Alert Settings</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Configure automated SMS and WhatsApp delivery channels, appointment reminders, prescription links, and billing receipts.
          </p>
        </div>
        <Link
          href="/dashboard/settings/notifications"
          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-teal-300 border border-slate-700 flex items-center gap-1.5 transition whitespace-nowrap"
        >
          Manage Alerts
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
