'use client';

import React, { use, useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { InvoiceStatusBadge } from '@/components/billing/invoice-status-badge';
import type { InvoiceStatus, PaymentMethod } from '@/lib/validations/billing';

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: string | number;
  lineTotal: string | number;
  itemType: string;
}

export interface InvoicePayment {
  id: string;
  amount: string | number;
  method: string;
  transactionRef: string | null;
  notes: string | null;
  receivedAt: string | Date;
  receivedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface InvoicePatient {
  id: string;
  mrn: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
}

export interface InvoiceClinic {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  country?: string | null;
  currency?: string | null;
  taxLabel?: string | null;
  taxNumber?: string | null;
}

export interface InvoiceDetail {
  id: string;
  clinicId: string;
  invoiceNumber: string;
  year: number;
  currency: string;
  status: InvoiceStatus;
  subtotal: string | number;
  discount: string | number;
  taxRate: string | number | null;
  taxAmount: string | number;
  totalAmount: string | number;
  paidAmount: string | number;
  balanceDue?: string | number;
  isFullyPaid?: boolean;
  isOverpaid?: boolean;
  issueDate: string | null;
  dueDate: string | null;
  notes: string | null;
  taxLabel: string | null;
  taxNumber: string | null;
  createdAt: string;
  items: InvoiceLineItem[];
  payments: InvoicePayment[];
  patient: InvoicePatient;
  clinic?: InvoiceClinic | null;
  appointment?: {
    id: string;
    startTime: string;
    endTime: string;
    status: string;
  } | null;
  consultation?: {
    id: string;
    status: string;
    version: number;
    createdAt: string;
  } | null;
  createdBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

// -----------------------------------------------------------------------------
// Constants & Supported Enums
// -----------------------------------------------------------------------------

export const SUPPORTED_PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CARD', label: 'Credit / Debit Card' },
  { value: 'NET_BANKING', label: 'Net Banking' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'OTHER', label: 'Other' },
];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  NET_BANKING: 'Net Banking',
  BANK_TRANSFER: 'Bank Transfer',
  INSURANCE: 'Insurance',
  OTHER: 'Other',
};

// -----------------------------------------------------------------------------
// Decimal-Safe Arithmetic & Formatting Helpers
// -----------------------------------------------------------------------------

/**
 * Validates that an input string has at most 2 decimal places.
 */
export function hasAtMostTwoDecimals(val: string): boolean {
  if (!val || !val.trim()) return true;
  return /^\d+(\.\d{1,2})?$/.test(val.trim());
}

/**
 * Parses a decimal string or number into exact minor units (cents/paise) using BigInt.
 * Prevents IEEE-754 floating-point precision drift.
 */
export function parseMinorUnits(val: string | number | null | undefined): bigint {
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
 * Formats minor units (cents/paise) into a display string with currency code and 2 decimal places.
 */
export function formatMinorUnits(cents: bigint, currency?: string | null): string {
  const zero = BigInt(0);
  const hundred = BigInt(100);
  const isNeg = cents < zero;
  const abs = isNeg ? -cents : cents;
  const intPart = (abs / hundred).toString();
  const decPart = (abs % hundred).toString().padStart(2, '0');

  const formattedInt = Number(intPart).toLocaleString('en-US');
  const sign = isNeg ? '-' : '';
  const prefix = currency ? `${currency} ` : '-- ';
  return `${prefix}${sign}${formattedInt}.${decPart}`;
}

/**
 * Formats a decimal amount string/number with the authoritative invoice currency.
 */
export function formatMoney(val: string | number | null | undefined, currency?: string | null): string {
  if (val === null || val === undefined) return currency ? `${currency} 0.00` : '-- 0.00';
  return formatMinorUnits(parseMinorUnits(val), currency);
}

/**
 * Calculates balance due in integer minor units (cents/paise). Never returns negative balance.
 */
export function calculateBalanceDueCents(total: string | number, paid: string | number): bigint {
  const totalCents = parseMinorUnits(total);
  const paidCents = parseMinorUnits(paid);
  const balance = totalCents - paidCents;
  return balance > BigInt(0) ? balance : BigInt(0);
}

/**
 * Determines if an invoice can accept payments based on server-side rules.
 */
export function canRecordPayment(status: string, balanceDueCents: bigint): boolean {
  if (status !== 'ISSUED' && status !== 'PARTIALLY_PAID') return false;
  return balanceDueCents > BigInt(0);
}

/**
 * Determines if an invoice can transition from DRAFT to ISSUED.
 */
export function canIssueInvoice(status: string): boolean {
  return status === 'DRAFT';
}

/**
 * Formats an ISO date string into a user-friendly format (e.g. "Oct 22, 2026").
 */
export function formatDate(val: string | Date | null | undefined): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

/**
 * Formats an ISO datetime string into date and time (e.g. "Oct 22, 2026, 04:30 PM").
 */
export function formatDateTime(val: string | Date | null | undefined): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

// -----------------------------------------------------------------------------
// Component: RecordPaymentModal
// -----------------------------------------------------------------------------

export interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  balanceDueCents: bigint;
  onSuccess: (payment: unknown) => void;
  onConflictRefresh: () => Promise<void>;
}

export function RecordPaymentModal({
  isOpen,
  onClose,
  invoiceId,
  invoiceNumber,
  currency,
  balanceDueCents,
  onSuccess,
  onConflictRefresh,
}: RecordPaymentModalProps) {
  const defaultBalanceStr = useMemo(() => {
    const hundred = BigInt(100);
    const intPart = (balanceDueCents / hundred).toString();
    const decPart = (balanceDueCents % hundred).toString().padStart(2, '0');
    return `${intPart}.${decPart}`;
  }, [balanceDueCents]);

  const [amount, setAmount] = useState<string>(defaultBalanceStr);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [receivedAt, setReceivedAt] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const handleFillFullBalance = () => {
    setAmount(defaultBalanceStr);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.amount;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setErrorMessage(null);
    const errors: Record<string, string> = {};

    // Validate Amount
    if (!amount || !amount.trim()) {
      errors.amount = 'Payment amount is required';
    } else if (!hasAtMostTwoDecimals(amount)) {
      errors.amount = 'Amount must have at most 2 decimal places';
    } else {
      const parsedCents = parseMinorUnits(amount);
      if (parsedCents <= BigInt(0)) {
        errors.amount = 'Payment amount must be greater than zero';
      } else if (parsedCents > balanceDueCents) {
        errors.amount = `Payment amount exceeds current outstanding balance (${formatMinorUnits(balanceDueCents, currency)})`;
      }
    }

    // Validate Method
    if (!method) {
      errors.method = 'Payment method is required';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const payload = {
        amount: amount.trim(),
        method,
        transactionRef: transactionRef.trim() ? transactionRef.trim() : null,
        notes: notes.trim() ? notes.trim() : null,
        receivedAt: receivedAt.trim() ? receivedAt.trim() : null,
      };

      const res = await fetch(`/api/billing/invoices/${invoiceId}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Authentication required. Please log in.');
        }
        if (res.status === 403) {
          throw new Error('Access forbidden: Recording payments requires write permissions in this clinic.');
        }
        if (res.status === 404) {
          throw new Error('Invoice not found in active clinic.');
        }

        const data = await res.json().catch(() => null);
        const serverError = data?.error || 'Failed to record payment.';

        // Detect overpayment or concurrency conflict on the server
        if (serverError.toLowerCase().includes('exceeds outstanding balance') || res.status === 400) {
          await onConflictRefresh();
        }

        throw new Error(serverError);
      }

      const data = await res.json();
      onSuccess(data.payment);
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An error occurred while recording payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-payment-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 print:hidden"
    >
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-5">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 id="record-payment-title" className="text-lg font-bold text-white tracking-tight">
              Record Payment
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {`Recording receipt for Invoice #${invoiceNumber}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close payment modal"
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Outstanding Balance Banner */}
        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">Outstanding Balance:</span>
          <span className="font-mono font-bold text-amber-300 text-sm">
            {formatMinorUnits(balanceDueCents, currency)}
          </span>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            aria-live="polite"
            className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/80 text-xs text-rose-200 flex items-start gap-2.5"
          >
            <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Payment Amount */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="payment-amount" className="block text-xs font-medium text-slate-300">
                Payment Amount ({currency}) <span className="text-rose-400">*</span>
              </label>
              <button
                type="button"
                onClick={handleFillFullBalance}
                disabled={isSubmitting}
                className="text-[11px] text-teal-400 hover:text-teal-300 transition underline underline-offset-2 disabled:opacity-50"
              >
                Pay Full Balance
              </button>
            </div>
            <input
              id="payment-amount"
              type="text"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isSubmitting}
              aria-required="true"
              aria-invalid={Boolean(fieldErrors.amount)}
              className={`w-full px-3 py-2 rounded-lg bg-slate-950 border font-mono text-sm text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 transition ${
                fieldErrors.amount ? 'border-rose-500' : 'border-slate-800'
              }`}
            />
            {fieldErrors.amount && (
              <span className="text-[11px] text-rose-400 mt-1 block">{fieldErrors.amount}</span>
            )}
          </div>

          {/* Payment Method */}
          <div>
            <label htmlFor="payment-method" className="block text-xs font-medium text-slate-300 mb-1">
              Payment Method <span className="text-rose-400">*</span>
            </label>
            <select
              id="payment-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              disabled={isSubmitting}
              aria-required="true"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-teal-500 transition"
            >
              {SUPPORTED_PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Transaction Reference & Received Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="payment-reference" className="block text-xs font-medium text-slate-300 mb-1">
                Transaction Reference
              </label>
              <input
                id="payment-reference"
                type="text"
                placeholder="e.g. UPI-12345, UTR, Cheque #"
                maxLength={100}
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 transition"
              />
            </div>
            <div>
              <label htmlFor="payment-date" className="block text-xs font-medium text-slate-300 mb-1">
                Payment Date
              </label>
              <input
                id="payment-date"
                type="date"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-teal-500 transition"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="payment-notes" className="block text-xs font-medium text-slate-300 mb-1">
              Notes (Optional)
            </label>
            <textarea
              id="payment-notes"
              rows={2}
              maxLength={1000}
              placeholder="Payer details, receipt number, or bank branch..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 transition"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 transition shadow-sm shadow-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Recording Payment...
                </>
              ) : (
                'Record Payment'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Component: PaymentReceiptModal (Official Payment Receipt View)
// -----------------------------------------------------------------------------

export interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: InvoicePayment;
  invoice: InvoiceDetail;
  balanceDueCents: bigint;
  onPrint?: () => void;
}

export function PaymentReceiptModal({
  isOpen,
  onClose,
  payment,
  invoice,
  balanceDueCents,
  onPrint,
}: PaymentReceiptModalProps) {
  if (!isOpen) return null;

  const isSettled = balanceDueCents === BigInt(0) && invoice.status === 'PAID';
  const taxId = invoice.taxNumber || invoice.clinic?.taxNumber;
  const taxLabel = invoice.taxLabel || invoice.clinic?.taxLabel || 'Tax ID';

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-receipt-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 print:p-0 print:static print:bg-white print:block print:inset-auto"
    >
      <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8 space-y-6 print:border-2 print:border-black print:bg-white print:text-black print:shadow-none print:p-8 print:max-w-none print:rounded-none">
        {/* Receipt Header (Screen & Print) */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-800 print:border-b-2 print:border-black pb-4">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-teal-400 print:text-slate-600 block">
              Official Payment Receipt
            </span>
            <h2 id="payment-receipt-title" className="text-xl sm:text-2xl font-bold font-mono text-white print:text-black tracking-tight">
              PAYMENT RECEIPT
            </h2>
            <div className="text-xs text-slate-400 print:text-slate-700 font-mono">
              <span className="font-semibold text-slate-300 print:text-black">Payment ID:</span>{' '}
              <span data-testid="receipt-payment-id">{payment.id}</span>
            </div>
            <div className="text-xs text-slate-400 print:text-slate-700 font-mono">
              <span className="font-semibold text-slate-300 print:text-black">Applied to Invoice:</span>{' '}
              <span>{`#${invoice.invoiceNumber}`}</span>
            </div>
          </div>

          <div className="text-left sm:text-right text-xs text-slate-400 print:text-slate-800 space-y-0.5">
            <div className="text-sm font-bold text-white print:text-black">
              {invoice.clinic?.name || 'Clinic Organization'}
            </div>
            {invoice.clinic?.address && (
              <div className="print:text-slate-700">{invoice.clinic.address}</div>
            )}
            {invoice.clinic?.phone && (
              <div className="print:text-slate-700">{`Phone: ${invoice.clinic.phone}`}</div>
            )}
            {taxId && (
              <div className="font-mono text-[11px] text-slate-300 print:text-black">
                {`${taxLabel}: ${taxId}`}
              </div>
            )}
          </div>
        </div>

        {/* Settlement Status Banner */}
        <div
          data-testid="receipt-settlement-status"
          className={`p-3.5 rounded-xl border text-xs print:border-2 ${
            isSettled
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200 print:bg-slate-100 print:border-black print:text-black'
              : 'bg-amber-950/30 border-amber-800/70 text-amber-200 print:bg-slate-100 print:border-black print:text-black'
          }`}
        >
          {isSettled ? (
            <div className="flex items-center gap-2 font-semibold">
              <svg className="w-4 h-4 text-emerald-400 print:text-black shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>PAID IN FULL — This invoice is fully settled with zero remaining balance.</span>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 print:bg-black inline-block" />
                <span>PARTIAL PAYMENT ACKNOWLEDGEMENT</span>
              </div>
              <p className="text-[11px] opacity-90 print:text-slate-800">
                This receipt confirms payment received. An outstanding balance of{' '}
                <strong className="font-mono font-bold text-amber-300 print:text-black">
                  {formatMinorUnits(balanceDueCents, invoice.currency)}
                </strong>{' '}
                {`remains due on Invoice #${invoice.invoiceNumber}.`}
              </p>
            </div>
          )}
        </div>

        {/* Receipt Payer & Encounter Summary (Minimal billing info, no unnecessary medical data) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800 print:bg-white print:border print:border-slate-300 text-xs">
          <div>
            <span className="text-[10px] font-semibold uppercase text-slate-500 print:text-slate-600 block mb-0.5">
              Received From (Patient)
            </span>
            <div className="font-bold text-white print:text-black text-sm">{invoice.patient.name}</div>
            <div className="font-mono text-slate-400 print:text-slate-700">{`MRN: ${invoice.patient.mrn}`}</div>
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase text-slate-500 print:text-slate-600 block mb-0.5">
              Payment &amp; Receipt Date
            </span>
            <div className="font-medium text-slate-200 print:text-black">
              {formatDateTime(payment.receivedAt)}
            </div>
            <div className="text-slate-400 print:text-slate-700 text-[11px]">
              {`Received By: ${payment.receivedBy?.name || 'Clinic Staff'}`}
            </div>
          </div>
        </div>

        {/* Receipt Financial Breakdown */}
        <div className="rounded-xl border border-slate-800 print:border print:border-black overflow-hidden">
          <div className="p-3 bg-slate-950/80 print:bg-slate-100 border-b border-slate-800 print:border-b print:border-black font-semibold text-xs text-slate-300 print:text-black uppercase tracking-wider">
            Transaction Summary
          </div>
          <div className="p-4 space-y-3 text-xs bg-slate-900/40 print:bg-white">
            <div className="flex justify-between items-center text-slate-300 print:text-black">
              <span>Payment Method:</span>
              <span className="font-semibold font-mono px-2 py-0.5 rounded bg-slate-800 print:bg-slate-100 text-teal-300 print:text-black border border-slate-700 print:border-slate-300">
                {PAYMENT_METHOD_LABELS[payment.method] || payment.method}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-300 print:text-black">
              <span>Transaction Reference:</span>
              <span className="font-mono text-slate-200 print:text-black">
                {payment.transactionRef || '—'}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-800 print:border-t print:border-slate-300 flex justify-between items-center text-sm font-bold">
              <span className="text-white print:text-black">Amount Paid This Receipt:</span>
              <span
                data-testid="receipt-amount-paid"
                className="font-mono text-emerald-400 print:text-black text-base"
              >
                {formatMoney(payment.amount, invoice.currency)}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-800/60 print:border-t print:border-slate-200 space-y-1.5 text-[11px] text-slate-400 print:text-slate-700">
              <div className="flex justify-between">
                <span>Total Invoice Amount:</span>
                <span className="font-mono text-slate-300 print:text-black">
                  {formatMoney(invoice.totalAmount, invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total Amount Paid to Date:</span>
                <span className="font-mono text-slate-300 print:text-black">
                  {formatMoney(invoice.paidAmount, invoice.currency)}
                </span>
              </div>
              <div className="flex justify-between font-semibold pt-1 border-t border-slate-800/40 print:border-t print:border-slate-300">
                <span className="text-slate-300 print:text-black">Remaining Balance Due:</span>
                <span
                  data-testid="receipt-remaining-balance"
                  className={`font-mono ${isSettled ? 'text-slate-500' : 'text-amber-300 print:text-black'}`}
                >
                  {formatMinorUnits(balanceDueCents, invoice.currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Optional Notes */}
        {payment.notes && (
          <div className="text-xs p-3 rounded-lg bg-slate-950/60 border border-slate-800 print:bg-white print:border print:border-slate-300">
            <span className="text-[10px] font-semibold uppercase text-slate-500 print:text-slate-600 block mb-0.5">
              Payment Notes
            </span>
            <p className="text-slate-300 print:text-black whitespace-pre-wrap">{payment.notes}</p>
          </div>
        )}

        {/* Receipt Footer / Signatures in Print */}
        <div className="hidden print:grid grid-cols-2 gap-8 pt-6 mt-6 border-t border-slate-300 text-xs text-slate-700">
          <div>
            <div className="border-b border-black pb-8" />
            <span className="text-[10px] block mt-1 text-center font-medium">Authorized Clinic Signature</span>
          </div>
          <div>
            <div className="border-b border-black pb-8" />
            <span className="text-[10px] block mt-1 text-center font-medium">Payer / Patient Signature</span>
          </div>
        </div>

        {/* Modal Controls (Hidden in Print) */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            data-testid="print-receipt-confirm-btn"
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 transition shadow-sm shadow-teal-500/20"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Component: InvoiceDetailSkeleton
// -----------------------------------------------------------------------------

export function InvoiceDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse max-w-5xl mx-auto">
      <div className="h-6 w-36 bg-slate-800 rounded" />
      <div className="flex justify-between items-center">
        <div className="h-9 w-64 bg-slate-800 rounded-lg" />
        <div className="h-9 w-32 bg-slate-800 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="h-44 bg-slate-900/60 rounded-xl" />
        <div className="h-44 bg-slate-900/60 rounded-xl md:col-span-2" />
      </div>
      <div className="h-64 bg-slate-900/60 rounded-xl" />
      <div className="h-48 bg-slate-900/60 rounded-xl" />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Component: InvoiceDetailView (Presentation View)
// -----------------------------------------------------------------------------

export interface InvoiceDetailViewProps {
  invoice: InvoiceDetail | null;
  loading: boolean;
  error: string | null;
  isNotFound?: boolean;
  onRefresh: () => void;
  onIssueInvoice?: () => Promise<void>;
  isIssuing?: boolean;
  onOpenPaymentModal: () => void;
  actionMessage?: { type: 'success' | 'error'; text: string } | null;
  onDismissActionMessage?: () => void;
  onSelectPaymentForReceipt?: (payment: InvoicePayment) => void;
  isPrintingReceipt?: boolean;
}

export function InvoiceDetailView({
  invoice,
  loading,
  error,
  isNotFound = false,
  onRefresh,
  onIssueInvoice,
  isIssuing = false,
  onOpenPaymentModal,
  actionMessage,
  onDismissActionMessage,
  onSelectPaymentForReceipt,
  isPrintingReceipt = false,
}: InvoiceDetailViewProps) {
  // Loading State
  if (loading && !invoice) {
    return <InvoiceDetailSkeleton />;
  }

  // Not Found State (404)
  if (isNotFound) {
    return (
      <div className="max-w-xl mx-auto p-8 rounded-2xl border border-slate-800 bg-slate-900/40 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-white tracking-tight">Invoice Not Found</h2>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          The requested invoice was not found in this clinic or you do not have permission to access it.
        </p>
        <div className="pt-2">
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-teal-500 hover:bg-teal-400 text-slate-950 transition"
          >
            ← Back to Billing Directory
          </Link>
        </div>
      </div>
    );
  }

  // Error State
  if (error && !invoice) {
    return (
      <div className="max-w-xl mx-auto p-8 rounded-2xl border border-rose-900/60 bg-rose-950/20 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-950/80 flex items-center justify-center mx-auto text-rose-400">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-white tracking-tight">Failed to Load Invoice</h2>
        <p className="text-xs text-rose-300 max-w-sm mx-auto">{error}</p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            onClick={onRefresh}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition border border-slate-700"
          >
            Retry
          </button>
          <Link
            href="/dashboard/billing"
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-teal-500 hover:bg-teal-400 text-slate-950 transition"
          >
            Back to Invoices
          </Link>
        </div>
      </div>
    );
  }

  if (!invoice) return null;

  const balanceDueCents = calculateBalanceDueCents(invoice.totalAmount, invoice.paidAmount);
  const isSettled = balanceDueCents === BigInt(0) && invoice.status === 'PAID';
  const paymentEligible = canRecordPayment(invoice.status, balanceDueCents);
  const issueEligible = canIssueInvoice(invoice.status);
  const taxId = invoice.taxNumber || invoice.clinic?.taxNumber;
  const taxLabel = invoice.taxLabel || invoice.clinic?.taxLabel || 'Tax ID';

  return (
    <div className={`space-y-6 max-w-5xl mx-auto ${isPrintingReceipt ? 'print:hidden' : ''}`}>
      {/* Top Breadcrumb & Return Link (Interactive Only) */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/dashboard/billing"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition group"
        >
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Billing Directory
        </Link>
        <button
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh invoice details"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition disabled:opacity-50"
          title="Refresh invoice details"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-teal-400' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Action Notification Banner (Interactive Only) */}
      {actionMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 print:hidden ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
              : 'bg-rose-950/40 border-rose-800/80 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            <span>{actionMessage.text}</span>
          </div>
          {onDismissActionMessage && (
            <button
              onClick={onDismissActionMessage}
              aria-label="Dismiss message"
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Formal Printable Invoice Header (Print Only) */}
      <div className="hidden print:block border-b-2 border-black pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold font-mono tracking-tight text-black">
              TAX INVOICE
            </h1>
            <div className="text-sm font-mono mt-1 text-black">
              <span className="font-bold">Invoice #:</span> {invoice.invoiceNumber}
            </div>
            <div className="text-xs text-slate-700 font-mono mt-0.5">
              <span>Status:</span> <strong className="uppercase">{invoice.status}</strong>
            </div>
          </div>
          <div className="text-right text-xs text-slate-800 space-y-0.5">
            <div className="text-base font-bold text-black">
              {invoice.clinic?.name || 'Clinic Organization'}
            </div>
            {invoice.clinic?.address && (
              <div className="text-slate-700">{invoice.clinic.address}</div>
            )}
            {invoice.clinic?.phone && (
              <div className="text-slate-700">{`Phone: ${invoice.clinic.phone}`}</div>
            )}
            {taxId && (
              <div className="font-mono text-black font-semibold">
                {`${taxLabel}: ${taxId}`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Screen Header Bar (Hidden in Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 print:hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold font-mono text-white tracking-tight">
              {invoice.invoiceNumber}
            </h1>
            <InvoiceStatusBadge status={invoice.status} size="md" />
            <span
              data-testid="invoice-currency-badge"
              className="px-2.5 py-0.5 rounded-md text-xs font-mono font-medium bg-slate-800 text-teal-300 border border-slate-700"
            >
              {`Currency: ${invoice.currency}`}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Created on {formatDate(invoice.createdAt)}
            {invoice.createdBy ? ` by ${invoice.createdBy.name}` : ''}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Print Invoice Action */}
          <button
            type="button"
            onClick={() => window.print()}
            data-testid="print-invoice-btn"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition border border-slate-700 print:hidden"
            title="Print invoice document or save as PDF"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Invoice
          </button>

          {/* Issue Draft Action */}
          {issueEligible && onIssueInvoice && (
            <button
              type="button"
              onClick={onIssueInvoice}
              disabled={isIssuing || loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition disabled:opacity-50"
            >
              {isIssuing ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Issuing...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Issue Invoice
                </>
              )}
            </button>
          )}

          {/* Record Payment Action */}
          {paymentEligible ? (
            <button
              type="button"
              onClick={onOpenPaymentModal}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 transition shadow-sm shadow-teal-500/20 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Record Payment
            </button>
          ) : invoice.status === 'DRAFT' ? (
            <div className="text-[11px] text-slate-400 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
              Payments available once issued
            </div>
          ) : isSettled ? (
            <div className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/30 px-3 py-1.5 rounded-lg border border-emerald-800/40 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Paid in Full
            </div>
          ) : null}
        </div>
      </div>

      {/* Grid: Patient & Meta Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:grid-cols-3 print:gap-4 print:text-black">
        {/* Patient Card */}
        <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-3 print:bg-white print:border print:border-black print:p-4 print:rounded-none">
          <div className="flex items-center justify-between border-b border-slate-800 print:border-b-black pb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 print:text-slate-600">
              Billed To (Patient)
            </span>
            <Link
              href={`/dashboard/patients/${invoice.patient.id}`}
              className="text-[11px] text-teal-400 hover:text-teal-300 transition print:hidden"
            >
              View Profile →
            </Link>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="font-bold text-white print:text-black text-sm">{invoice.patient.name}</div>
            <div className="text-slate-400 print:text-slate-700 font-mono">{`MRN: ${invoice.patient.mrn}`}</div>
            {invoice.patient.phone && (
              <div className="text-slate-300 print:text-slate-700 flex items-center gap-1.5">
                <span className="text-slate-500 print:text-slate-600">Phone:</span> {invoice.patient.phone}
              </div>
            )}
            {invoice.patient.email && (
              <div className="text-slate-300 print:text-slate-700 flex items-center gap-1.5 truncate">
                <span className="text-slate-500 print:text-slate-600">Email:</span> {invoice.patient.email}
              </div>
            )}
            {invoice.patient.gender && (
              <div className="text-slate-400 print:text-slate-600 text-[11px]">
                Gender: <span className="capitalize text-slate-300 print:text-black">{invoice.patient.gender.toLowerCase()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Invoice Terms & Linked Encounters Card */}
        <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 md:col-span-2 space-y-3 print:bg-white print:border print:border-black print:p-4 print:rounded-none">
          <div className="border-b border-slate-800 print:border-b-black pb-2 flex justify-between items-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 print:text-slate-600">
              Invoice Dates &amp; Details
            </span>
            <span className="hidden print:inline-block font-mono text-xs font-bold text-black">
              Currency: {invoice.currency}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-500 print:text-slate-600 block text-[11px]">Issue Date</span>
              <span className="font-medium text-slate-200 print:text-black mt-0.5 block">
                {formatDate(invoice.issueDate)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 print:text-slate-600 block text-[11px]">Due Date</span>
              <span className="font-medium text-slate-200 print:text-black mt-0.5 block">
                {formatDate(invoice.dueDate)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 print:text-slate-600 block text-[11px]">Tax Registration</span>
              <span className="font-mono text-slate-300 print:text-black mt-0.5 block">
                {taxId ? `${taxLabel}: ${taxId}` : '—'}
              </span>
            </div>
            <div className="print:hidden">
              <span className="text-slate-500 block text-[11px]">Linked Records</span>
              <div className="mt-0.5 space-y-1">
                {invoice.appointment && (
                  <Link
                    href="/dashboard/appointments"
                    className="text-[11px] text-teal-400 hover:text-teal-300 font-mono block truncate"
                    title={`Linked Appointment ID: ${invoice.appointment.id}`}
                  >
                    Appt #{invoice.appointment.id.slice(0, 8)}
                  </Link>
                )}
                {invoice.consultation && (
                  <Link
                    href={`/dashboard/records/${invoice.consultation.id}`}
                    className="text-[11px] text-teal-400 hover:text-teal-300 font-mono block truncate"
                    title={`Linked Consultation ID: ${invoice.consultation.id}`}
                  >
                    Consult #{invoice.consultation.id.slice(0, 8)}
                  </Link>
                )}
                {!invoice.appointment && !invoice.consultation && (
                  <span className="text-slate-400 font-mono">—</span>
                )}
              </div>
            </div>
          </div>
          {invoice.notes && (
            <div className="pt-2 border-t border-slate-800 print:border-t-slate-300 text-xs">
              <span className="text-slate-500 print:text-slate-600 block text-[11px] mb-0.5">Notes / Payment Terms</span>
              <p className="text-slate-300 print:text-black whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Line Items Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-sm space-y-0 print:border print:border-black print:bg-white print:text-black print:rounded-none break-inside-avoid">
        <div className="p-4 border-b border-slate-800 print:border-b-black bg-slate-950/40 print:bg-slate-100 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 print:text-black">
            Invoice Line Items
          </h2>
          <span className="text-[11px] text-slate-400 print:text-slate-700 font-mono">
            {invoice.items.length} {invoice.items.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" aria-label="Invoice line items table">
            <thead>
              <tr className="border-b border-slate-800 print:border-b-black bg-slate-950/60 print:bg-slate-100 text-slate-400 print:text-black font-semibold uppercase tracking-wider text-[10px]">
                <th scope="col" className="px-4 py-3">#</th>
                <th scope="col" className="px-4 py-3">Type</th>
                <th scope="col" className="px-4 py-3">Description</th>
                <th scope="col" className="px-4 py-3 text-center">Qty</th>
                <th scope="col" className="px-4 py-3 text-right">Unit Price</th>
                <th scope="col" className="px-4 py-3 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 print:divide-slate-300 font-mono">
              {invoice.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-slate-850/30 transition-colors print:hover:bg-transparent">
                  <td className="px-4 py-3 text-slate-500 print:text-slate-700 text-[11px]">{idx + 1}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded text-[10px] font-sans font-medium bg-slate-800 print:bg-slate-100 text-slate-300 print:text-black border border-slate-700 print:border-slate-300">
                      {item.itemType}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-sans text-white print:text-black font-medium break-words whitespace-normal max-w-xs print:max-w-none">
                    {item.description}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-200 print:text-black">{item.quantity}</td>
                  <td className="px-4 py-3 text-right text-slate-300 print:text-black">
                    {formatMoney(item.unitPrice, invoice.currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-white print:text-black">
                    {formatMoney(item.lineTotal, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financial Totals Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4">
        <div className="p-4 rounded-xl border border-slate-800/60 bg-slate-950/40 text-xs text-slate-400 space-y-2 print:hidden">
          <span className="font-semibold text-slate-300 block">Authoritative Calculation Rules:</span>
          <p className="leading-relaxed">
            All financials are computed using exact decimal-safe arithmetic. Line items sum to subtotal; discount is applied before tax; tax is rounded using standard round-half-up policy.
          </p>
        </div>

        {/* Totals Summary Card */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2.5 text-xs print:rounded-none print:border-2 print:border-black print:bg-white print:text-black break-inside-avoid md:col-start-2">
          <div className="flex items-center justify-between text-slate-400 print:text-slate-700">
            <span>Subtotal</span>
            <span className="font-mono text-slate-200 print:text-black">
              {formatMoney(invoice.subtotal, invoice.currency)}
            </span>
          </div>
          {parseMinorUnits(invoice.discount) > BigInt(0) && (
            <div className="flex items-center justify-between text-slate-400 print:text-slate-700">
              <span>Discount</span>
              <span className="font-mono text-emerald-400 print:text-black">
                {`-${formatMoney(invoice.discount, invoice.currency)}`}
              </span>
            </div>
          )}
          {invoice.taxRate && (
            <div className="flex items-center justify-between text-slate-400 print:text-slate-700">
              <span>{`Tax (${invoice.taxRate}%)`}</span>
              <span className="font-mono text-slate-200 print:text-black">
                {formatMoney(invoice.taxAmount, invoice.currency)}
              </span>
            </div>
          )}

          <div className="pt-2.5 border-t border-slate-800 print:border-t-2 print:border-black flex items-center justify-between text-sm font-bold">
            <span className="text-white print:text-black">Total Amount</span>
            <span className="font-mono text-white print:text-black text-base">
              {formatMoney(invoice.totalAmount, invoice.currency)}
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-400 print:text-slate-700 pt-1">
            <span>Payments Received</span>
            <span className="font-mono text-emerald-400 print:text-black">
              {formatMoney(invoice.paidAmount, invoice.currency)}
            </span>
          </div>

          <div className="pt-2 border-t border-slate-800 print:border-t print:border-slate-300 flex items-center justify-between font-bold">
            <span className="text-slate-300 print:text-black">Balance Due</span>
            <span
              data-testid="invoice-balance-due"
              className={`font-mono text-base ${isSettled ? 'text-slate-500' : 'text-amber-300 print:text-black'}`}
            >
              {formatMinorUnits(balanceDueCents, invoice.currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Payment Ledger / History */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-sm space-y-0 print:border print:border-black print:bg-white print:text-black print:rounded-none break-inside-avoid">
        <div className="p-4 border-b border-slate-800 print:border-b-black bg-slate-950/40 print:bg-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 print:text-black">
              Payment History
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20 font-mono print:border-black print:text-black">
              {invoice.payments.length}
            </span>
          </div>
          {paymentEligible && (
            <button
              onClick={onOpenPaymentModal}
              className="text-xs text-teal-400 hover:text-teal-300 font-semibold transition print:hidden"
            >
              + Record Payment
            </button>
          )}
        </div>

        {invoice.payments.length === 0 ? (
          <div className="p-8 text-center text-xs space-y-2">
            <p className="text-slate-400 print:text-slate-600 font-medium">No payments recorded yet</p>
            <p className="text-slate-500 print:text-slate-600 text-[11px] max-w-sm mx-auto print:hidden">
              {paymentEligible
                ? 'Click "Record Payment" above to record a payment received from this patient.'
                : invoice.status === 'DRAFT'
                ? 'Issue this invoice first to enable payment recording.'
                : 'No payments were recorded for this invoice.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" aria-label="Invoice payment history table">
              <thead>
                <tr className="border-b border-slate-800 print:border-b-black bg-slate-950/60 print:bg-slate-100 text-slate-400 print:text-black font-semibold uppercase tracking-wider text-[10px]">
                  <th scope="col" className="px-4 py-3">Date &amp; Time</th>
                  <th scope="col" className="px-4 py-3">Method</th>
                  <th scope="col" className="px-4 py-3">Reference</th>
                  <th scope="col" className="px-4 py-3">Received By</th>
                  <th scope="col" className="px-4 py-3 text-right">Amount</th>
                  <th scope="col" className="px-4 py-3 text-right print:hidden">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 print:divide-slate-300 font-mono">
                {invoice.payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-850/30 transition-colors print:hover:bg-transparent">
                    <td className="px-4 py-3 text-slate-300 print:text-black text-xs">
                      {formatDateTime(p.receivedAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-sans font-semibold bg-slate-800 print:bg-slate-100 text-teal-300 print:text-black border border-slate-700 print:border-slate-300">
                        {PAYMENT_METHOD_LABELS[p.method] || p.method}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 print:text-black max-w-xs truncate">
                      {p.transactionRef || '—'}
                    </td>
                    <td className="px-4 py-3 font-sans text-slate-300 print:text-black text-xs">
                      {p.receivedBy ? p.receivedBy.name : 'Clinic Staff'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-400 print:text-black">
                      {formatMoney(p.amount, invoice.currency)}
                    </td>
                    <td className="px-4 py-3 text-right print:hidden">
                      {onSelectPaymentForReceipt && (
                        <button
                          type="button"
                          onClick={() => onSelectPaymentForReceipt(p)}
                          data-testid={`receipt-btn-${p.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-teal-300 hover:text-teal-200 border border-slate-700 transition"
                          title="View and print official payment receipt"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Receipt
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Printable Invoice Signatures / Footer (Print Only) */}
      <div className="hidden print:grid grid-cols-2 gap-8 pt-8 mt-6 border-t border-slate-400 text-xs text-slate-700 break-inside-avoid">
        <div>
          <div className="border-b border-black pb-10" />
          <span className="text-[10px] block mt-1 text-center font-medium">Authorized Signatory</span>
        </div>
        <div>
          <div className="border-b border-black pb-10" />
          <span className="text-[10px] block mt-1 text-center font-medium">Customer / Patient Acknowledgement</span>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Component: InvoiceDetailPage (App Router Entry)
// -----------------------------------------------------------------------------

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const resolvedParams = use(params);
  const invoiceId = resolvedParams.invoiceId;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState<boolean>(false);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [activeReceiptPayment, setActiveReceiptPayment] = useState<InvoicePayment | null>(null);
  const [isIssuing, setIsIssuing] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Fetch invoice details from server API
  const fetchInvoice = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsNotFound(false);

    try {
      const res = await fetch(`/api/billing/invoices/${invoiceId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setIsNotFound(true);
          return;
        }
        if (res.status === 401) {
          throw new Error('Authentication required. Please log in.');
        }
        if (res.status === 403) {
          throw new Error('Access forbidden: You do not have permission to view billing records in this clinic.');
        }

        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to load invoice details.');
      }

      const data = await res.json();
      setInvoice(data.invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred while fetching invoice.');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    let ignore = false;

    async function loadData() {
      try {
        await fetchInvoice();
      } catch {
        // Handled inside fetchInvoice
      }
    }

    if (!ignore) {
      loadData();
    }

    return () => {
      ignore = true;
    };
  }, [fetchInvoice]);

  // Issue Draft Invoice Handler
  const handleIssueInvoice = async () => {
    if (!invoice || isIssuing) return;
    setIsIssuing(true);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/billing/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ISSUED' }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to issue invoice.');
      }

      await fetchInvoice();
      setActionMessage({
        type: 'success',
        text: `Invoice #${invoice.invoiceNumber} has been issued successfully.`,
      });
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to issue invoice.',
      });
    } finally {
      setIsIssuing(false);
    }
  };

  const handlePaymentSuccess = async () => {
    await fetchInvoice();
    setActionMessage({
      type: 'success',
      text: 'Payment recorded successfully and invoice ledger updated.',
    });
  };

  const balanceDueCents = invoice
    ? calculateBalanceDueCents(invoice.totalAmount, invoice.paidAmount)
    : BigInt(0);

  return (
    <>
      <InvoiceDetailView
        invoice={invoice}
        loading={loading}
        error={error}
        isNotFound={isNotFound}
        onRefresh={fetchInvoice}
        onIssueInvoice={handleIssueInvoice}
        isIssuing={isIssuing}
        onOpenPaymentModal={() => setIsPaymentModalOpen(true)}
        actionMessage={actionMessage}
        onDismissActionMessage={() => setActionMessage(null)}
        onSelectPaymentForReceipt={setActiveReceiptPayment}
        isPrintingReceipt={Boolean(activeReceiptPayment)}
      />

      {invoice && isPaymentModalOpen && (
        <RecordPaymentModal
          key={`${invoice.id}-${balanceDueCents.toString()}`}
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoiceNumber}
          currency={invoice.currency}
          balanceDueCents={balanceDueCents}
          onSuccess={handlePaymentSuccess}
          onConflictRefresh={fetchInvoice}
        />
      )}

      {invoice && activeReceiptPayment && (
        <PaymentReceiptModal
          key={`receipt-${activeReceiptPayment.id}`}
          isOpen={Boolean(activeReceiptPayment)}
          onClose={() => setActiveReceiptPayment(null)}
          payment={activeReceiptPayment}
          invoice={invoice}
          balanceDueCents={balanceDueCents}
        />
      )}
    </>
  );
}
