'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { RoleBadge } from '@/components/dashboard/role-badge';
import type { ClinicRole } from '@/lib/auth/permissions';

interface ClinicNotificationSettings {
  clinicId: string;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  appointmentAlerts: boolean;
  prescriptionAlerts: boolean;
  billingAlerts: boolean;
  senderName: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export default function ClinicNotificationSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [clinicName, setClinicName] = useState<string>('');
  const [role, setRole] = useState<ClinicRole | null>(null);

  // Form State
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [appointmentAlerts, setAppointmentAlerts] = useState(true);
  const [prescriptionAlerts, setPrescriptionAlerts] = useState(true);
  const [billingAlerts, setBillingAlerts] = useState(true);
  const [senderName, setSenderName] = useState('');

  // Status & Notifications
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) throw new Error('Unauthenticated');
        const meData = await meRes.json();

        if (!meData.activeClinic?.id) {
          setError('No active clinic found in your session.');
          setLoading(false);
          return;
        }

        const id = meData.activeClinic.id;
        setClinicId(id);
        setClinicName(meData.activeClinic.name || 'Clinic');
        setRole(meData.activeClinic.role || null);

        const settingsRes = await fetch(`/api/clinics/${id}/notification-settings`);
        if (!settingsRes.ok) {
          throw new Error('Failed to load clinic notification settings');
        }

        const data: { settings: ClinicNotificationSettings } = await settingsRes.json();
        const s = data.settings;
        setSmsEnabled(s.smsEnabled);
        setWhatsappEnabled(s.whatsappEnabled);
        setAppointmentAlerts(s.appointmentAlerts);
        setPrescriptionAlerts(s.prescriptionAlerts);
        setBillingAlerts(s.billingAlerts);
        setSenderName(s.senderName || '');
      } catch (err) {
        console.error('Error loading notification settings:', err);
        setError('Failed to load clinic notification settings.');
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  const canEdit = role === 'OWNER' || role === 'ADMIN';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !clinicId) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/clinics/${clinicId}/notification-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smsEnabled,
          whatsappEnabled,
          appointmentAlerts,
          prescriptionAlerts,
          billingAlerts,
          senderName: senderName.trim() ? senderName.trim() : null,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || 'Failed to update notification settings.');
        return;
      }

      setSuccessMessage('Clinic notification settings updated successfully.');
      const s: ClinicNotificationSettings = result.settings;
      setSmsEnabled(s.smsEnabled);
      setWhatsappEnabled(s.whatsappEnabled);
      setAppointmentAlerts(s.appointmentAlerts);
      setPrescriptionAlerts(s.prescriptionAlerts);
      setBillingAlerts(s.billingAlerts);
      setSenderName(s.senderName || '');
    } catch (err) {
      console.error('Update notification settings error:', err);
      setError('An unexpected network error occurred while saving.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ClinicNotificationSettingsView
      loading={loading}
      saving={saving}
      clinicId={clinicId}
      clinicName={clinicName}
      role={role}
      smsEnabled={smsEnabled}
      setSmsEnabled={setSmsEnabled}
      whatsappEnabled={whatsappEnabled}
      setWhatsappEnabled={setWhatsappEnabled}
      appointmentAlerts={appointmentAlerts}
      setAppointmentAlerts={setAppointmentAlerts}
      prescriptionAlerts={prescriptionAlerts}
      setPrescriptionAlerts={setPrescriptionAlerts}
      billingAlerts={billingAlerts}
      setBillingAlerts={setBillingAlerts}
      senderName={senderName}
      setSenderName={setSenderName}
      error={error}
      successMessage={successMessage}
      onSubmit={handleSubmit}
    />
  );
}

export interface ClinicNotificationSettingsViewProps {
  loading: boolean;
  saving: boolean;
  clinicId: string | null;
  clinicName: string;
  role: ClinicRole | null;
  smsEnabled: boolean;
  setSmsEnabled: (v: boolean) => void;
  whatsappEnabled: boolean;
  setWhatsappEnabled: (v: boolean) => void;
  appointmentAlerts: boolean;
  setAppointmentAlerts: (v: boolean) => void;
  prescriptionAlerts: boolean;
  setPrescriptionAlerts: (v: boolean) => void;
  billingAlerts: boolean;
  setBillingAlerts: (v: boolean) => void;
  senderName: string;
  setSenderName: (v: string) => void;
  error: string | null;
  successMessage: string | null;
  onSubmit: (e: React.FormEvent) => void;
}

export function ClinicNotificationSettingsView({
  loading,
  saving,
  clinicId,
  clinicName,
  role,
  smsEnabled,
  setSmsEnabled,
  whatsappEnabled,
  setWhatsappEnabled,
  appointmentAlerts,
  setAppointmentAlerts,
  prescriptionAlerts,
  setPrescriptionAlerts,
  billingAlerts,
  setBillingAlerts,
  senderName,
  setSenderName,
  error,
  successMessage,
  onSubmit,
}: ClinicNotificationSettingsViewProps) {
  const canEdit = role === 'OWNER' || role === 'ADMIN';

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-3 border-teal-500/30 border-t-teal-400 rounded-full animate-spin mb-3" />
        <span className="text-xs text-slate-400">Loading notification configuration...</span>
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
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/dashboard/settings"
                className="text-xs text-slate-400 hover:text-teal-400 transition"
              >
                Settings
              </Link>
              <span className="text-xs text-slate-600">/</span>
              <span className="text-xs text-teal-400 font-medium">Patient Communications</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Patient Notification Settings
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Configure automated SMS and WhatsApp delivery channels, workflow alerts, and display name for {clinicName}.
            </p>
          </div>
          {role && <RoleBadge role={role} size="md" />}
        </div>
      </div>

      {/* Role Notice for Restricted Members */}
      {!canEdit && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 text-amber-200 text-xs flex items-start gap-3">
          <svg
            className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <span className="font-semibold text-amber-100">View-only mode:</span> Your current role ({role}) does not hold clinic administrative permissions. Only Clinic Owners and Administrators can modify alert toggles and delivery channels.
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

      {/* Settings Form */}
      <form onSubmit={onSubmit} className="space-y-6">
        {/* Section 1: Outbound Channels */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Outbound Delivery Channels
          </h2>
          <p className="text-xs text-slate-400">
            Control which messaging channels are permitted for outbound messages. Patient consent is still required per channel before any message is sent.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* WhatsApp */}
            <label className={`p-4 rounded-xl border flex items-start justify-between cursor-pointer transition ${whatsappEnabled ? 'bg-slate-950/80 border-teal-500/50' : 'bg-slate-950/40 border-slate-800'}`}>
              <div className="pr-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="text-sm font-semibold text-white">WhatsApp Delivery</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Preferred delivery channel. Fast, encrypted, and highly accessible on modern smartphones.
                </p>
              </div>
              <input
                type="checkbox"
                checked={whatsappEnabled}
                disabled={!canEdit || saving}
                onChange={(e) => setWhatsappEnabled(e.target.checked)}
                className="mt-1 h-5 w-5 rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-teal-500 disabled:opacity-50"
              />
            </label>

            {/* SMS */}
            <label className={`p-4 rounded-xl border flex items-start justify-between cursor-pointer transition ${smsEnabled ? 'bg-slate-950/80 border-teal-500/50' : 'bg-slate-950/40 border-slate-800'}`}>
              <div className="pr-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                  <span className="text-sm font-semibold text-white">SMS Delivery</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Universal fallback channel. Reaches standard feature phones and mobile devices across all networks.
                </p>
              </div>
              <input
                type="checkbox"
                checked={smsEnabled}
                disabled={!canEdit || saving}
                onChange={(e) => setSmsEnabled(e.target.checked)}
                className="mt-1 h-5 w-5 rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-teal-500 disabled:opacity-50"
              />
            </label>
          </div>
        </div>

        {/* Section 2: Workflow Alert Categories */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            Automated Workflow Alert Categories
          </h2>
          <p className="text-xs text-slate-400">
            Selectively enable or suppress automatic notifications triggered by reception, doctor, and billing actions.
          </p>

          <div className="space-y-3 pt-2">
            {/* Appointment Alerts */}
            <label className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-slate-700 transition">
              <div>
                <div className="text-sm font-semibold text-white">Appointment Lifecycle Alerts</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Sends confirmation on appointment booking, rescheduling updates, and cancellations.
                </div>
              </div>
              <input
                type="checkbox"
                checked={appointmentAlerts}
                disabled={!canEdit || saving}
                onChange={(e) => setAppointmentAlerts(e.target.checked)}
                className="h-5 w-5 rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-teal-500 disabled:opacity-50"
              />
            </label>

            {/* Prescription Alerts */}
            <label className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-slate-700 transition">
              <div>
                <div className="text-sm font-semibold text-white">Prescription Ready Alerts</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Sends secure expiring public links to patients when a doctor finalizes a prescription.
                </div>
              </div>
              <input
                type="checkbox"
                checked={prescriptionAlerts}
                disabled={!canEdit || saving}
                onChange={(e) => setPrescriptionAlerts(e.target.checked)}
                className="h-5 w-5 rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-teal-500 disabled:opacity-50"
              />
            </label>

            {/* Billing Alerts */}
            <label className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-slate-700 transition">
              <div>
                <div className="text-sm font-semibold text-white">Billing & Payment Alerts</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Sends receipt notifications with balance updates when payments are recorded.
                </div>
              </div>
              <input
                type="checkbox"
                checked={billingAlerts}
                disabled={!canEdit || saving}
                onChange={(e) => setBillingAlerts(e.target.checked)}
                className="h-5 w-5 rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-teal-500 disabled:opacity-50"
              />
            </label>
          </div>
        </div>

        {/* Section 3: Sender Name Configuration */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Sender Display Identity
          </h2>
          <div>
            <label htmlFor="senderName" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Custom Sender Header (Optional)
            </label>
            <input
              id="senderName"
              type="text"
              maxLength={50}
              disabled={!canEdit || saving}
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm text-white disabled:opacity-60 disabled:cursor-not-allowed transition"
              placeholder={`Defaults to "${clinicName}" if empty`}
            />
            <p className="text-xs text-slate-500 mt-1.5">
              Identifies your practice in message headers. Maximum 50 characters.
            </p>
          </div>
        </div>

        {/* Security & Isolation Notice */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 space-y-1">
          <div className="font-semibold text-slate-300 flex items-center gap-1.5">
            <svg className="w-4 h-4 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Security & Provider Privacy Architecture
          </div>
          <div>
            Provider API keys, secret credentials, and carrier webhook tokens are strictly managed in secure server environments and are never exposed to browser runtimes.
          </div>
        </div>

        {/* Action Buttons */}
        {canEdit && (
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/dashboard/settings"
              className="px-4 py-2.5 rounded-lg border border-slate-700 text-sm font-medium text-slate-300 hover:bg-slate-800 transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-sm font-semibold text-white shadow-lg shadow-teal-900/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 transition"
            >
              {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {saving ? 'Saving Changes...' : 'Save Notification Settings'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
