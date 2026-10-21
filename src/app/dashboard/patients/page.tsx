'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface PatientSummary {
  id: string;
  mrn: string;
  name: string;
  dateOfBirth?: string | null;
  ageDisplay: string;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  bloodGroup?: string | null;
  createdAt: string;
}

interface RawPatient {
  id: string;
  mrn: string;
  name: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  bloodGroup?: string | null;
  createdAt: string;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function PatientsDirectoryPage() {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let ignore = false;

    async function loadPatients() {
      try {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: '15',
        });
        if (debouncedQuery.trim()) {
          params.set('query', debouncedQuery.trim());
        }

        const res = await fetch(`/api/patients?${params.toString()}`);
        if (!res.ok) {
          throw new Error('Failed to load patient records');
        }

        const data = await res.json();
        if (!ignore) {
          const now = Date.now();
          const mapped: PatientSummary[] = (data.patients || []).map((p: RawPatient) => {
            let ageDisplay = '—';
            if (p.dateOfBirth) {
              const dob = new Date(p.dateOfBirth);
              if (!isNaN(dob.getTime())) {
                const diffMs = now - dob.getTime();
                const ageDt = new Date(diffMs);
                const age = Math.abs(ageDt.getUTCFullYear() - 1970);
                ageDisplay = `${age} yrs`;
              }
            }
            return {
              ...p,
              ageDisplay,
            };
          });

          setPatients(mapped);
          setPagination(data.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 });
          setLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          console.error('Error fetching patients:', err);
          setError('Failed to load patient records. Please refresh or try again.');
          setLoading(false);
        }
      }
    }

    loadPatients();

    return () => {
      ignore = true;
    };
  }, [currentPage, debouncedQuery]);

  function handlePageChange(newPage: number) {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setLoading(true);
      setCurrentPage(newPage);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Patient Directory</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Search, register, and manage demographic profiles within your active clinic.
          </p>
        </div>
        <Link
          href="/dashboard/patients/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Register New Patient
        </Link>
      </div>

      {/* Search & Quick Filter Bar */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:max-w-md">
          <svg
            className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by patient name, phone, or MRN..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-xs text-white placeholder-slate-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
            >
              Clear
            </button>
          )}
        </div>

        <div className="text-xs text-slate-400 self-end sm:self-center font-medium">
          Total Registered: <span className="text-white font-bold">{pagination.total}</span>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs">
          {error}
        </div>
      )}

      {/* Table Container */}
      <div className="rounded-xl bg-slate-900/40 border border-slate-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-3 border-teal-500/30 border-t-teal-400 rounded-full animate-spin mb-3" />
            <span className="text-xs text-slate-400">Loading patient records...</span>
          </div>
        ) : patients.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-white">
              {debouncedQuery ? 'No matching patient records found' : 'No patients registered yet'}
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {debouncedQuery
                ? `No patient matched "${debouncedQuery}". Try another search term or register a new profile.`
                : 'Get started by registering your clinic’s first patient profile to manage intake and appointments.'}
            </p>
            <div className="pt-2">
              <Link
                href="/dashboard/patients/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition"
              >
                Register Patient
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3 font-semibold">MRN</th>
                  <th className="px-4 py-3 font-semibold">Patient Name</th>
                  <th className="px-4 py-3 font-semibold">Age / Gender</th>
                  <th className="px-4 py-3 font-semibold">Contact Phone</th>
                  <th className="px-4 py-3 font-semibold">Blood Group</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {patients.map((patient) => (
                  <tr key={patient.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3.5 font-mono text-teal-300 font-semibold">
                      {patient.mrn}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-white">
                      {patient.name}
                    </td>
                    <td className="px-4 py-3.5 text-slate-300">
                      {patient.ageDisplay}
                      {patient.gender ? ` • ${patient.gender}` : ''}
                    </td>
                    <td className="px-4 py-3.5 text-slate-400 font-mono">
                      {patient.phone || '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      {patient.bloodGroup ? (
                        <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/50 text-[10px] font-mono font-bold">
                          {patient.bloodGroup}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right space-x-2">
                      <Link
                        href={`/dashboard/patients/${patient.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-200 text-[11px] font-medium border border-slate-700 transition"
                      >
                        View Profile
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className="p-3 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs text-slate-400">
            <div>
              Showing page <span className="text-white font-semibold">{pagination.page}</span> of{' '}
              <span className="text-white font-semibold">{pagination.totalPages}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-750 text-white disabled:opacity-40 disabled:cursor-not-allowed transition text-xs"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-750 text-white disabled:opacity-40 disabled:cursor-not-allowed transition text-xs"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
