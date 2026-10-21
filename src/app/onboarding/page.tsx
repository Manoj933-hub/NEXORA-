'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ClinicOnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [country, setCountry] = useState<'IN' | 'NP'>('IN');
  const [currency, setCurrency] = useState<'INR' | 'NPR'>('INR');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function handleCountryChange(selected: 'IN' | 'NP') {
    setCountry(selected);
    if (selected === 'NP') setCurrency('NPR');
    if (selected === 'IN') setCurrency('INR');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch('/api/clinics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          country,
          currency,
          phone: phone.trim() ? phone.trim() : null,
          address: address.trim() ? address.trim() : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        if (data.details) {
          setFieldErrors(data.details);
        } else {
          setError(data.error || 'Failed to create clinic organization.');
        }
        return;
      }

      // Success -> Redirect to dashboard
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      console.error('Onboarding error:', err);
      setError('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 sm:px-6 py-12">
      <div className="w-full max-w-xl">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center font-black text-slate-950 text-xl shadow-lg shadow-teal-500/20">
              N
            </div>
            <span className="font-bold text-2xl text-white tracking-tight">NEXORA</span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Register Your Clinic Organization
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
            Set up your practice workspace. You will be assigned full Owner permissions for this clinic.
          </p>
        </div>

        {/* Card Form */}
        <div className="p-6 sm:p-8 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-2xl">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="clinicName" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Clinic / Hospital Name <span className="text-teal-400">*</span>
              </label>
              <input
                id="clinicName"
                type="text"
                required
                disabled={loading}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm text-white placeholder-slate-500 transition"
                placeholder="e.g. Aarogya Care Center"
              />
              {fieldErrors.name && (
                <p className="text-xs text-red-400 mt-1.5">{fieldErrors.name[0]}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="country" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Country <span className="text-teal-400">*</span>
                </label>
                <select
                  id="country"
                  disabled={loading}
                  value={country}
                  onChange={(e) => handleCountryChange(e.target.value as 'IN' | 'NP')}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white transition"
                >
                  <option value="IN">India (IN)</option>
                  <option value="NP">Nepal (NP)</option>
                </select>
              </div>

              <div>
                <label htmlFor="currency" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Operating Currency <span className="text-teal-400">*</span>
                </label>
                <select
                  id="currency"
                  disabled={loading}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'INR' | 'NPR')}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white transition"
                >
                  <option value="INR">INR (₹ Indian Rupee)</option>
                  <option value="NPR">NPR (रू Nepalese Rupee)</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Clinic Phone Number
              </label>
              <input
                id="phone"
                type="text"
                disabled={loading}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white placeholder-slate-500 transition"
                placeholder={country === 'NP' ? '+977 9800000000' : '+91 9800000000'}
              />
              {fieldErrors.phone && (
                <p className="text-xs text-red-400 mt-1.5">{fieldErrors.phone[0]}</p>
              )}
            </div>

            <div>
              <label htmlFor="address" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Street Address / Location
              </label>
              <textarea
                id="address"
                rows={3}
                disabled={loading}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-sm text-white placeholder-slate-500 transition"
                placeholder="e.g. Civil Lines, South Delhi or Pokhara Lakeside"
              />
              {fieldErrors.address && (
                <p className="text-xs text-red-400 mt-1.5">{fieldErrors.address[0]}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-sm font-bold shadow-lg shadow-teal-500/20 disabled:opacity-50 transition"
            >
              {loading ? 'Creating Clinic Workspace...' : 'Complete Onboarding & Enter Dashboard'}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center text-xs text-slate-500">
          Already belong to an established clinic?{' '}
          <Link href="/select-clinic" className="text-teal-400 hover:underline font-medium">
            Select Existing Clinic
          </Link>
        </div>
      </div>
    </main>
  );
}
