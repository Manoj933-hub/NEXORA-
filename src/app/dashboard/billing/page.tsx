'use client';

import React, { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import type { InvoiceStatus } from '@/lib/validations/billing';
import { InvoiceStatusBadge } from '@/components/billing/invoice-status-badge';

export interface InvoiceListItem {
  id: string;
  clinicId: string;
  patientId: string;
  appointmentId?: string | null;
  consultationId?: string | null;
  createdById?: string | null;
  invoiceNumber: string;
  year: number;
  currency: string;
  status: InvoiceStatus;
  subtotal: string | number;
  discount: string | number;
  taxRate?: string | number | null;
  taxAmount: string | number;
  totalAmount: string | number;
  paidAmount: string | number;
  issueDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  patient: {
    id: string;
    mrn: string;
    name: string;
    phone?: string | null;
  };
  createdBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  items?: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: string | number;
    lineTotal: string | number;
    itemType: string;
  }>;
  payments?: Array<{
    id: string;
    amount: string | number;
    method: string;
    receivedAt: string;
  }>;
}

export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type StatusFilterOption = 'ALL' | InvoiceStatus;

/**
 * Parses a decimal string or number into an exact BigInt representing minor units (cents/paise).
 * Avoids IEEE-754 floating-point inaccuracies.
 */
export function parseCents(val: string | number | null | undefined): bigint {
  if (val === null || val === undefined) return BigInt(0);
  const str = typeof val === 'number' ? val.toFixed(2) : String(val).trim();
  if (!str) return BigInt(0);

  const isNeg = str.startsWith('-');
  const cleanStr = str.replace('-', '');
  const [intPart = '0', decPart = '00'] = cleanStr.split('.');
  const cleanInt = intPart.replace(/[^0-9]/g, '') || '0';
  const cleanDec = (decPart.replace(/[^0-9]/g, '') + '00').slice(0, 2);

  const total = BigInt(cleanInt) * BigInt(100) + BigInt(cleanDec);
  return isNeg ? -total : total;
}

/**
 * Formats minor units (cents/paise) into an exact two-decimal string with currency symbol/code.
 */
export function formatCents(cents: bigint, currency = 'INR'): string {
  const zero = BigInt(0);
  const hundred = BigInt(100);
  const isNeg = cents < zero;
  const abs = isNeg ? -cents : cents;
  const intPart = (abs / hundred).toString();
  const decPart = (abs % hundred).toString().padStart(2, '0');

  const formattedInt = Number(intPart).toLocaleString('en-US');
  const sign = isNeg ? '-' : '';
  return `${currency} ${sign}${formattedInt}.${decPart}`;
}

/**
 * Formats a monetary value from API values without floating-point conversion errors.
 */
export function formatMoney(amount: string | number | null | undefined, currency = 'INR'): string {
  return formatCents(parseCents(amount), currency);
}

/**
 * Calculates exact balance due minor units (cents/paise).
 * balanceDue = max(0, total - paid).
 */
export function calculateBalanceDueCents(
  total: string | number | null | undefined,
  paid: string | number | null | undefined
): bigint {
  const totalCents = parseCents(total);
  const paidCents = parseCents(paid);
  const diff = totalCents - paidCents;
  const zero = BigInt(0);
  return diff > zero ? diff : zero;
}

/**
 * Formats an ISO date string into a user-friendly format (e.g., "Oct 22, 2026").
 * Returns "—" for null or undefined dates (e.g. unissued drafts).
 */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

/**
 * Pure client-side filtering helper for current page invoices by search query.
 * Matches invoice number, patient name, or patient MRN.
 */
export function filterInvoices(invoices: InvoiceListItem[], query: string): InvoiceListItem[] {
  const trimmed = query.toLowerCase().trim();
  if (!trimmed) return invoices;

  return invoices.filter((inv) => {
    const invNum = inv.invoiceNumber?.toLowerCase() || '';
    const patientName = inv.patient?.name?.toLowerCase() || '';
    const mrn = inv.patient?.mrn?.toLowerCase() || '';
    return invNum.includes(trimmed) || patientName.includes(trimmed) || mrn.includes(trimmed);
  });
}

export interface BillingDirectoryViewProps {
  invoices: InvoiceListItem[];
  loading: boolean;
  error: string | null;
  statusFilter: StatusFilterOption;
  searchQuery: string;
  patientId?: string | null;
  pagination: PaginationMetadata;
  onStatusFilterChange: (status: StatusFilterOption) => void;
  onSearchQueryChange: (query: string) => void;
  onPageChange: (newPage: number) => void;
  onClearFilters: () => void;
  onRefresh: () => void;
}

export function BillingDirectoryView({
  invoices,
  loading,
  error,
  statusFilter,
  searchQuery,
  patientId,
  pagination,
  onStatusFilterChange,
  onSearchQueryChange,
  onPageChange,
  onClearFilters,
  onRefresh,
}: BillingDirectoryViewProps) {
  const filtered = useMemo(
    () => filterInvoices(invoices, searchQuery),
    [invoices, searchQuery]
  );

  const activePatientName = useMemo(() => {
    if (!patientId || invoices.length === 0) return null;
    const match = invoices.find((inv) => inv.patientId === patientId || inv.patient?.id === patientId);
    return match ? `${match.patient.name} (${match.patient.mrn})` : null;
  }, [patientId, invoices]);

  const statusTabs: Array<{ label: string; value: StatusFilterOption }> = [
    { label: 'All Invoices', value: 'ALL' },
    { label: 'Drafts', value: 'DRAFT' },
    { label: 'Issued', value: 'ISSUED' },
    { label: 'Partially Paid', value: 'PARTIALLY_PAID' },
    { label: 'Paid', value: 'PAID' },
    { label: 'Void', value: 'VOID' },
    { label: 'Refunded', value: 'REFUNDED' },
  ];

  const startRecord = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const endRecord = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Billing &amp; Invoices
            </h1>
            {!loading && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20">
                {pagination.total} {pagination.total === 1 ? 'record' : 'records'}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Manage clinic invoices, receivables, payment ledger, and collections.
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2.5">
          <Link
            href="/dashboard/billing/new"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-teal-500 hover:bg-teal-400 text-slate-950 transition shadow-sm shadow-teal-500/20"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Invoice
          </Link>
          <button
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh invoices"
            className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition disabled:opacity-50"
            title="Refresh invoices"
          >
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin text-teal-400' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Patient Filter Active Banner */}
      {patientId && (
        <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-cyan-200">
            <svg className="w-4 h-4 shrink-0 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span>
              Filtered for patient:{' '}
              <strong className="text-white font-semibold">
                {activePatientName || patientId}
              </strong>
            </span>
          </div>
          <Link
            href="/dashboard/billing"
            className="px-3 py-1 rounded-md bg-cyan-900/50 hover:bg-cyan-900 text-cyan-300 font-medium text-[11px] border border-cyan-700/50 transition w-fit"
          >
            Clear Patient Filter
          </Link>
        </div>
      )}

      {/* Controls: Search and Status Filters */}
      <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        {/* Search Input for Current Page */}
        <div className="relative flex-1 max-w-md">
          <label htmlFor="invoice-search" className="sr-only">
            Search current invoices
          </label>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            id="invoice-search"
            type="text"
            placeholder="Filter page by invoice #, patient, or MRN..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full pl-9 pr-9 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchQueryChange('')}
              aria-label="Clear search query"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div
          role="tablist"
          aria-label="Filter by invoice status"
          className="flex flex-wrap items-center gap-1.5"
        >
          {statusTabs.map((tab) => {
            const isActive = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                role="tab"
                aria-selected={isActive}
                onClick={() => onStatusFilterChange(tab.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  isActive
                    ? 'bg-teal-500 text-slate-950 shadow-sm shadow-teal-500/20'
                    : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-850 border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-start justify-between gap-3 text-xs text-rose-200">
          <div className="flex items-start gap-2.5">
            <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <p className="font-semibold text-rose-100">Unable to load invoices</p>
              <p className="text-rose-300/90 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            onClick={onRefresh}
            className="px-3 py-1 rounded bg-rose-900/60 hover:bg-rose-900 text-white font-medium transition text-xs shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Content Area */}
      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden divide-y divide-slate-800">
          {[1, 2, 3, 4, 5].map((idx) => (
            <div key={idx} className="p-4 flex items-center justify-between gap-4 animate-pulse">
              <div className="space-y-2 flex-1">
                <div className="h-4 w-32 bg-slate-800 rounded" />
                <div className="h-3 w-44 bg-slate-850 rounded" />
              </div>
              <div className="space-y-2 flex-1 hidden md:block">
                <div className="h-4 w-28 bg-slate-800 rounded" />
                <div className="h-3 w-20 bg-slate-850 rounded" />
              </div>
              <div className="h-6 w-20 bg-slate-800 rounded-full" />
              <div className="h-8 w-16 bg-slate-800 rounded-lg" />
            </div>
          ))}
        </div>
      ) : invoices.length === 0 && !error ? (
        /* Empty Clinic Directory */
        <div className="p-12 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/20">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/60 flex items-center justify-center text-slate-400 mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z"
              />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-white">No Invoices Found</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {patientId
              ? 'There are no billing records for this patient in the active clinic.'
              : statusFilter !== 'ALL'
              ? `No invoices found with status "${statusFilter}".`
              : 'Invoices created by authorized clinic staff will appear here.'}
          </p>
          {(patientId || statusFilter !== 'ALL') && (
            <button
              onClick={onClearFilters}
              className="mt-4 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-teal-300 border border-slate-700 transition"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : filtered.length === 0 && !error ? (
        /* No Search Matches on Current Page */
        <div className="p-10 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/20">
          <p className="text-sm font-semibold text-white">No Matching Invoices</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            No invoices on this page match &quot;{searchQuery}&quot;
            {statusFilter !== 'ALL' ? ` with status ${statusFilter}` : ''}.
          </p>
          <button
            onClick={() => onSearchQueryChange('')}
            className="mt-4 px-3.5 py-1.5 rounded-lg bg-slate-850 hover:bg-slate-800 text-xs font-semibold text-slate-300 border border-slate-700 transition"
          >
            Clear Search
          </button>
        </div>
      ) : (
        /* Invoices Table */
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" aria-label="Invoices directory table">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th scope="col" className="px-4 py-3">Invoice #</th>
                  <th scope="col" className="px-4 py-3">Patient</th>
                  <th scope="col" className="px-4 py-3 hidden md:table-cell">Issue Date</th>
                  <th scope="col" className="px-4 py-3 hidden lg:table-cell">Due Date</th>
                  <th scope="col" className="px-4 py-3 text-right">Total</th>
                  <th scope="col" className="px-4 py-3 text-right hidden sm:table-cell">Paid</th>
                  <th scope="col" className="px-4 py-3 text-right">Balance Due</th>
                  <th scope="col" className="px-4 py-3 text-center">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((inv) => {
                  const balanceDueCents = calculateBalanceDueCents(inv.totalAmount, inv.paidAmount);
                  const isSettled = balanceDueCents === BigInt(0) && inv.status === 'PAID';

                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-850/40 transition-colors group"
                    >
                      {/* Invoice Number */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <Link
                          href={`/dashboard/billing/${inv.id}`}
                          className="font-mono font-bold text-teal-300 hover:text-teal-200 hover:underline transition"
                        >
                          {inv.invoiceNumber}
                        </Link>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {inv.currency}
                        </div>
                      </td>

                      {/* Patient */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-white">
                          {inv.patient.name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          MRN: {inv.patient.mrn}
                        </div>
                      </td>

                      {/* Issue Date */}
                      <td className="px-4 py-3.5 whitespace-nowrap hidden md:table-cell text-slate-300">
                        {formatDate(inv.issueDate)}
                      </td>

                      {/* Due Date */}
                      <td className="px-4 py-3.5 whitespace-nowrap hidden lg:table-cell text-slate-400">
                        {formatDate(inv.dueDate)}
                      </td>

                      {/* Total Amount */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono font-semibold text-slate-100">
                        {formatMoney(inv.totalAmount, inv.currency)}
                      </td>

                      {/* Paid Amount */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono text-emerald-400/90 hidden sm:table-cell">
                        {formatMoney(inv.paidAmount, inv.currency)}
                      </td>

                      {/* Balance Due */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono font-semibold">
                        <span className={isSettled ? 'text-slate-500' : 'text-amber-300'}>
                          {formatCents(balanceDueCents, inv.currency)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-center">
                        <InvoiceStatusBadge status={inv.status} />
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-right">
                        <Link
                          href={`/dashboard/billing/${inv.id}`}
                          aria-label={`View invoice ${inv.invoiceNumber}`}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-slate-600 transition"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
              <div>
                Showing <span className="font-semibold text-slate-200">{startRecord}</span> to{' '}
                <span className="font-semibold text-slate-200">{endRecord}</span> of{' '}
                <span className="font-semibold text-slate-200">{pagination.total}</span> invoices
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onPageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1 || loading}
                  aria-label="Previous page"
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-2 font-mono text-[11px] text-slate-400">
                  {`Page ${pagination.page} of ${pagination.totalPages}`}
                </span>
                <button
                  onClick={() => onPageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages || loading}
                  aria-label="Next page"
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BillingDirectoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = searchParams.get('patientId');

  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMetadata>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [refreshCounter, setRefreshCounter] = useState(0);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setRefreshCounter((prev) => prev + 1);
  }, []);

  const handleStatusFilterChange = useCallback((status: StatusFilterOption) => {
    setStatusFilter(status);
    setCurrentPage(1);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setCurrentPage(1);
    if (patientId) {
      router.push('/dashboard/billing');
    }
  }, [patientId, router]);

  useEffect(() => {
    let ignore = false;

    async function fetchInvoices() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (patientId) {
          params.set('patientId', patientId);
        }
        if (statusFilter !== 'ALL') {
          params.set('status', statusFilter);
        }
        params.set('page', String(currentPage));
        params.set('limit', '20');

        const url = `/api/billing/invoices?${params.toString()}`;
        const res = await fetch(url);

        if (!res.ok) {
          if (res.status === 401) {
            throw new Error('Authentication required. Please log in.');
          }
          if (res.status === 403) {
            throw new Error(
              'Access forbidden: Billing records require Receptionist, Doctor, Admin, or Owner permissions.'
            );
          }
          if (res.status === 404) {
            throw new Error('Patient not found in active clinic.');
          }
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error || 'Failed to load invoices from clinic.');
        }

        const data = await res.json();
        if (!ignore) {
          setInvoices(data.invoices || []);
          if (data.pagination) {
            setPagination(data.pagination);
          } else {
            setPagination({
              page: currentPage,
              limit: 20,
              total: data.invoices?.length || 0,
              totalPages: 1,
            });
          }
          setError(null);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    fetchInvoices();

    return () => {
      ignore = true;
    };
  }, [patientId, statusFilter, currentPage, refreshCounter]);

  return (
    <BillingDirectoryView
      invoices={invoices}
      loading={loading}
      error={error}
      statusFilter={statusFilter}
      searchQuery={searchQuery}
      patientId={patientId}
      pagination={pagination}
      onStatusFilterChange={handleStatusFilterChange}
      onSearchQueryChange={setSearchQuery}
      onPageChange={setCurrentPage}
      onClearFilters={handleClearFilters}
      onRefresh={handleRefresh}
    />
  );
}

function BillingDirectorySkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 w-64 bg-slate-800 rounded" />
      <div className="h-12 bg-slate-900 rounded-xl" />
      <div className="h-64 bg-slate-900/40 rounded-xl" />
    </div>
  );
}

export default function BillingDirectoryPage() {
  return (
    <Suspense fallback={<BillingDirectorySkeleton />}>
      <BillingDirectoryContent />
    </Suspense>
  );
}
