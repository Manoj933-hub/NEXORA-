'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();

  // User details
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');

  // Initial Clinic details
  const [clinicName, setClinicName] = useState('');
  const [country, setCountry] = useState<'IN' | 'NP'>('IN');
  const [currency, setCurrency] = useState<'INR' | 'NPR'>('INR');

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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          phone: phone.trim() ? phone.trim() : null,
          clinicName,
          country,
          currency,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.details) {
          setFieldErrors(data.details);
        } else {
          setError(data.error || 'Registration failed. Please check your details.');
        }
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      console.error('Registration error:', err);
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
            Create Practice Account
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-slate-400">
            Start managing appointments, medical records, and clinic workflows.
          </p>
        </div>

        {/* Card Form */}
        <div className="p-6 sm:p-8 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-2xl">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="name"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2"
                >
                  Doctor / Practitioner Name <span className="text-teal-400">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  disabled={loading}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm text-white placeholder-slate-500 transition"
                  placeholder="Dr. Ananya Sharma"
                />
                {fieldErrors.name && (
                  <p className="text-xs text-red-400 mt-1">{fieldErrors.name[0]}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2"
                >
                  Personal Phone
                </label>
                <input
                  id="phone"
                  type="text"
                  disabled={loading}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm text-white placeholder-slate-500 transition"
                  placeholder="+91 9800000000"
                />
                {fieldErrors.phone && (
                  <p className="text-xs text-red-400 mt-1">{fieldErrors.phone[0]}</p>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2"
              >
                Work Email Address <span className="text-teal-400">*</span>
              </label>
              <input
                id="email"
                type="email"
                required
                disabled={loading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm text-white placeholder-slate-500 transition"
                placeholder="doctor@clinic.com"
                autoComplete="email"
              />
              {fieldErrors.email && (
                <p className="text-xs text-red-400 mt-1">{fieldErrors.email[0]}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2"
              >
                Password <span className="text-teal-400">*</span>
              </label>
              <input
                id="password"
                type="password"
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm text-white placeholder-slate-500 transition"
                placeholder="Min 8 characters (1 uppercase, 1 lowercase, 1 number)"
                autoComplete="new-password"
              />
              {fieldErrors.password && (
                <p className="text-xs text-red-400 mt-1">{fieldErrors.password[0]}</p>
              )}
            </div>

            <div className="pt-2 border-t border-slate-800">
              <label
                htmlFor="clinicName"
                className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2"
              >
                Initial Clinic / Hospital Name <span className="text-teal-400">*</span>
              </label>
              <input
                id="clinicName"
                type="text"
                required
                disabled={loading}
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-sm text-white placeholder-slate-500 transition"
                placeholder="e.g. Kathmandu PolyClinic"
              />
              {fieldErrors.clinicName && (
                <p className="text-xs text-red-400 mt-1">{fieldErrors.clinicName[0]}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="country"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2"
                >
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
                <label
                  htmlFor="currency"
                  className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2"
                >
                  Currency <span className="text-teal-400">*</span>
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

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 py-3 px-4 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-sm font-bold shadow-lg shadow-teal-500/20 disabled:opacity-50 transition"
            >
              {loading ? 'Creating Practice Account...' : 'Complete Registration & Open Dashboard'}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center text-xs text-slate-400">
          Already registered?{' '}
          <Link href="/login" className="text-teal-400 hover:underline font-medium">
            Sign in to existing account
          </Link>
        </div>
      </div>
    </main>
  );
}
