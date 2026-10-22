'use client';

import React, { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { InvoiceItemType } from '@/lib/validations/billing';

export interface PatientOption {
  id: string;
  mrn: string;
  name: string;
  phone?: string | null;
  gender?: string | null;
}

export interface LineItemFormRow {
  id: string;
  itemType: InvoiceItemType;
  description: string;
  quantity: number | string;
  unitPrice: string;
}

export interface InvoiceCalculationsPreview {
  subtotalCents: bigint;
  discountCents: bigint;
  taxableCents: bigint;
  taxRateBps: bigint;
  taxCents: bigint;
  totalCents: bigint;
  isDiscountInvalid: boolean;
}

export interface CreatedInvoiceSummary {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: string | number;
  currency: string;
  patientName: string;
}

/**
 * Validates that an input string has at most 2 decimal places.
 */
export function hasAtMostTwoDecimals(val: string): boolean {
  if (!val || !val.trim()) return true;
  return /^\d+(\.\d{1,2})?$/.test(val.trim());
}

/**
 * Parses a decimal string or number into exact minor units (cents/paise) using BigInt.
 * Eliminates IEEE-754 floating-point drift.
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

export const SUPPORTED_CURRENCIES = ['INR', 'NPR'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(val: unknown): val is SupportedCurrency {
  return typeof val === 'string' && (val === 'INR' || val === 'NPR');
}

/**
 * Formats minor units (cents/paise) into a display string with currency code and 2 decimal places.
 * If currency is unresolved/null, outputs a neutral numeric format with '--' prefix.
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
 * Calculates exact line item total in minor units.
 */
export function calculateLineTotalMinorUnits(qty: number | string, unitPrice: string): bigint {
  const q = typeof qty === 'number' ? qty : parseInt(qty || '0', 10);
  if (isNaN(q) || q < 1) return BigInt(0);
  const priceCents = parseMinorUnits(unitPrice);
  return BigInt(q) * priceCents;
}

/**
 * Computes exact decimal-safe financial preview totals for the invoice form.
 */
export function calculateTotalsPreview(
  items: LineItemFormRow[],
  discountStr: string,
  taxRateStr: string
): InvoiceCalculationsPreview {
  const zero = BigInt(0);
  let subtotalCents = zero;

  for (const item of items) {
    subtotalCents += calculateLineTotalMinorUnits(item.quantity, item.unitPrice);
  }

  const discountCents = parseMinorUnits(discountStr);
  const isDiscountInvalid = discountCents > subtotalCents;

  const taxableCents = discountCents > subtotalCents ? zero : subtotalCents - discountCents;

  let taxCents = zero;
  let taxRateBps = zero;

  if (taxRateStr && taxRateStr.trim()) {
    taxRateBps = parseMinorUnits(taxRateStr); // e.g. 18.00% -> 1800
    if (taxRateBps > zero && taxableCents > zero) {
      // Standard ROUND_HALF_UP in integer arithmetic: (taxable * rate + 5000) / 10000
      taxCents = (taxableCents * taxRateBps + BigInt(5000)) / BigInt(10000);
    }
  }

  const totalCents = taxableCents + taxCents;

  return {
    subtotalCents,
    discountCents,
    taxableCents,
    taxRateBps,
    taxCents,
    totalCents,
    isDiscountInvalid,
  };
}

export interface CreateInvoiceViewProps {
  // Form State
  patientId: string;
  appointmentId: string;
  consultationId: string;
  dueDate: string;
  notes: string;
  discount: string;
  taxRate: string;
  items: LineItemFormRow[];
  currency: string | null;
  loadingCurrency?: boolean;
  currencyError?: string | null;

  // Options & Meta
  patients: PatientOption[];
  loadingPatients: boolean;
  calculations: InvoiceCalculationsPreview;

  // Status & Feedback
  isSubmitting: boolean;
  formError: string | null;
  fieldErrors: Record<string, string>;
  createdInvoice: CreatedInvoiceSummary | null;

  // Handlers
  onPatientChange: (patientId: string) => void;
  onAppointmentIdChange: (val: string) => void;
  onConsultationIdChange: (val: string) => void;
  onDueDateChange: (val: string) => void;
  onNotesChange: (val: string) => void;
  onDiscountChange: (val: string) => void;
  onTaxRateChange: (val: string) => void;
  onItemChange: (index: number, field: keyof LineItemFormRow, value: LineItemFormRow[keyof LineItemFormRow]) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onSubmit: (e: React.FormEvent) => void;
  onReset: () => void;
  onRetryCurrency?: () => void;
}

export function CreateInvoiceView({
  patientId,
  appointmentId,
  consultationId,
  dueDate,
  notes,
  discount,
  taxRate,
  items,
  currency = null,
  loadingCurrency = false,
  currencyError = null,
  patients,
  loadingPatients,
  calculations,
  isSubmitting,
  formError,
  fieldErrors,
  createdInvoice,
  onPatientChange,
  onAppointmentIdChange,
  onConsultationIdChange,
  onDueDateChange,
  onNotesChange,
  onDiscountChange,
  onTaxRateChange,
  onItemChange,
  onAddItem,
  onRemoveItem,
  onSubmit,
  onReset,
  onRetryCurrency,
}: CreateInvoiceViewProps) {
  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === patientId),
    [patients, patientId]
  );

  const itemTypes: Array<{ label: string; value: InvoiceItemType }> = [
    { label: 'Consultation', value: 'CONSULTATION' },
    { label: 'Procedure', value: 'PROCEDURE' },
    { label: 'Medication', value: 'MEDICATION' },
    { label: 'Lab Test', value: 'LAB' },
    { label: 'Miscellaneous', value: 'MISC' },
  ];

  // Render Confirmation Screen upon successful invoice creation
  if (createdInvoice) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="rounded-2xl border border-emerald-800/80 bg-slate-900/80 p-8 text-center shadow-xl">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            Draft Created
          </span>

          <h2 className="text-2xl font-bold text-white mt-3">Invoice Created Successfully</h2>
          <p className="text-sm text-slate-400 mt-1">
            New draft invoice has been recorded in the billing ledger.
          </p>

          <div className="mt-6 p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                Invoice Number
              </div>
              <div className="text-lg font-mono font-bold text-teal-300 mt-0.5">
                {createdInvoice.invoiceNumber}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Patient: <span className="text-slate-200 font-medium">{createdInvoice.patientName}</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                Total Amount
              </div>
              <div className="text-lg font-mono font-bold text-white mt-0.5">
                {typeof createdInvoice.totalAmount === 'number'
                  ? formatMinorUnits(parseMinorUnits(createdInvoice.totalAmount), createdInvoice.currency)
                  : `${createdInvoice.currency} ${createdInvoice.totalAmount}`}
              </div>
              <div className="text-xs text-slate-400 mt-1 font-mono">
                Status: <span className="text-slate-300 font-semibold">{createdInvoice.status}</span>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/dashboard/billing"
              className="w-full sm:w-auto px-6 py-2.5 rounded-lg text-xs font-semibold bg-teal-500 hover:bg-teal-400 text-slate-950 transition shadow-sm"
            >
              Return to Billing Directory
            </Link>
            <button
              onClick={onReset}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition"
            >
              Create Another Invoice
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8 max-w-4xl mx-auto" noValidate>
      {/* Page Header & Back Navigation */}
      <div>
        <Link
          href="/dashboard/billing"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-teal-400 transition mb-3"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Billing Directory
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Create New Invoice
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Draft an itemized invoice for clinical consultations, lab tests, and medical procedures.
            </p>
          </div>
          {loadingCurrency ? (
            <span
              data-testid="currency-loading-badge"
              className="px-3 py-1 rounded-md text-xs font-mono font-medium bg-slate-800 text-slate-400 border border-slate-700 w-fit animate-pulse flex items-center gap-1.5"
            >
              <svg className="w-3 h-3 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Currency: Resolving...
            </span>
          ) : currency ? (
            <span
              data-testid="currency-badge"
              className="px-3 py-1 rounded-md text-xs font-mono font-medium bg-slate-800 text-teal-300 border border-slate-700 w-fit"
            >
              {`Currency: ${currency}`}
            </span>
          ) : (
            <span
              data-testid="currency-unavailable-badge"
              className="px-3 py-1 rounded-md text-xs font-mono font-medium bg-rose-950/70 text-rose-300 border border-rose-800 w-fit"
            >
              Currency: Unavailable
            </span>
          )}
        </div>
      </div>

      {/* Currency Error Banner */}
      {currencyError && (
        <div
          role="alert"
          aria-live="polite"
          data-testid="currency-error-banner"
          className="p-4 rounded-xl bg-rose-950/50 border border-rose-800/80 flex items-start justify-between gap-3 text-xs text-rose-200"
        >
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <span className="font-semibold text-rose-300 block mb-0.5">Clinic Currency Error</span>
              <span>{currencyError}</span>
            </div>
          </div>
          {onRetryCurrency && (
            <button
              type="button"
              onClick={onRetryCurrency}
              className="px-2.5 py-1 rounded-lg bg-rose-900/60 hover:bg-rose-900 text-[11px] text-rose-200 border border-rose-700 transition shrink-0"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Form Error Banner */}
      {formError && (
        <div
          role="alert"
          aria-live="polite"
          className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-start gap-3 text-xs text-rose-200"
        >
          <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <div className="font-semibold text-rose-100">Validation or Submission Error</div>
            <div className="mt-0.5 text-rose-300/90">{formError}</div>
          </div>
        </div>
      )}

      {/* Section 1: Patient Selection */}
      <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center text-xs font-bold">
              1
            </span>
            Patient Information
          </h2>
          {fieldErrors.patientId && (
            <span className="text-xs text-rose-400 font-medium">
              {fieldErrors.patientId}
            </span>
          )}
        </div>

        <div>
          <label htmlFor="patient-select" className="block text-xs font-medium text-slate-300 mb-1.5">
            Select Patient <span className="text-rose-400">*</span>
          </label>
          <select
            id="patient-select"
            value={patientId}
            onChange={(e) => onPatientChange(e.target.value)}
            disabled={loadingPatients || isSubmitting}
            aria-required="true"
            aria-invalid={Boolean(fieldErrors.patientId)}
            className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition disabled:opacity-50"
          >
            <option value="">-- Choose Patient --</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {`${p.name} (${p.mrn})${p.phone ? ` • ${p.phone}` : ''}`}
              </option>
            ))}
          </select>
          {loadingPatients && (
            <div className="text-[11px] text-slate-500 mt-1 animate-pulse">Loading clinic patients...</div>
          )}
        </div>

        {selectedPatient && (
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-white">{selectedPatient.name}</span>
              <span className="text-slate-400 font-mono ml-2">{`MRN: ${selectedPatient.mrn}`}</span>
            </div>
            {selectedPatient.phone && (
              <span className="text-slate-400">{`Phone: ${selectedPatient.phone}`}</span>
            )}
          </div>
        )}

        {/* Optional Linked Encounters */}
        <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="appointment-id" className="block text-[11px] font-medium text-slate-400 mb-1">
              Appointment ID (Optional)
            </label>
            <input
              id="appointment-id"
              type="text"
              placeholder="e.g. appt-uuid"
              value={appointmentId}
              onChange={(e) => onAppointmentIdChange(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 transition font-mono"
            />
          </div>
          <div>
            <label htmlFor="consultation-id" className="block text-[11px] font-medium text-slate-400 mb-1">
              Consultation ID (Optional)
            </label>
            <input
              id="consultation-id"
              type="text"
              placeholder="e.g. consult-uuid"
              value={consultationId}
              onChange={(e) => onConsultationIdChange(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 transition font-mono"
            />
          </div>
        </div>
      </div>

      {/* Section 2: Invoice Line Items */}
      <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center text-xs font-bold">
              2
            </span>
            Invoice Line Items
          </h2>
          <button
            type="button"
            onClick={onAddItem}
            disabled={isSubmitting}
            aria-label="Add line item"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-teal-300 border border-slate-700 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Item
          </button>
        </div>

        {fieldErrors.items && (
          <div className="text-xs text-rose-400 font-medium">{fieldErrors.items}</div>
        )}

        {/* Item Rows */}
        <div className="space-y-3">
          {items.map((item, idx) => {
            const lineTotalCents = calculateLineTotalMinorUnits(item.quantity, item.unitPrice);
            const itemDescError = fieldErrors[`items.${idx}.description`];
            const itemQtyError = fieldErrors[`items.${idx}.quantity`];
            const itemPriceError = fieldErrors[`items.${idx}.unitPrice`];

            return (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-300">{`Item #${idx + 1}`}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-300">
                      Line Total: <strong className="text-teal-300">{formatMinorUnits(lineTotalCents, currency)}</strong>
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoveItem(idx)}
                        disabled={isSubmitting}
                        aria-label={`Remove item ${idx + 1}`}
                        className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition"
                        title="Remove this line item"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  {/* Item Type */}
                  <div className="sm:col-span-3">
                    <label htmlFor={`item-type-${idx}`} className="block text-[11px] font-medium text-slate-400 mb-1">
                      Type
                    </label>
                    <select
                      id={`item-type-${idx}`}
                      value={item.itemType}
                      onChange={(e) => onItemChange(idx, 'itemType', e.target.value as InvoiceItemType)}
                      disabled={isSubmitting}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-teal-500 transition"
                    >
                      {itemTypes.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Description */}
                  <div className="sm:col-span-5">
                    <label htmlFor={`item-desc-${idx}`} className="block text-[11px] font-medium text-slate-400 mb-1">
                      Description <span className="text-rose-400">*</span>
                    </label>
                    <input
                      id={`item-desc-${idx}`}
                      type="text"
                      placeholder="e.g. General Physician Consultation"
                      value={item.description}
                      onChange={(e) => onItemChange(idx, 'description', e.target.value)}
                      disabled={isSubmitting}
                      className={`w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 transition ${
                        itemDescError ? 'border-rose-500' : 'border-slate-800'
                      }`}
                    />
                    {itemDescError && (
                      <span className="text-[10px] text-rose-400 mt-0.5 block">{itemDescError}</span>
                    )}
                  </div>

                  {/* Quantity */}
                  <div className="sm:col-span-2">
                    <label htmlFor={`item-qty-${idx}`} className="block text-[11px] font-medium text-slate-400 mb-1">
                      Qty <span className="text-rose-400">*</span>
                    </label>
                    <input
                      id={`item-qty-${idx}`}
                      type="number"
                      min={1}
                      max={10000}
                      step={1}
                      value={item.quantity}
                      onChange={(e) => onItemChange(idx, 'quantity', e.target.value)}
                      disabled={isSubmitting}
                      className={`w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border text-xs text-white font-mono focus:outline-none focus:border-teal-500 transition ${
                        itemQtyError ? 'border-rose-500' : 'border-slate-800'
                      }`}
                    />
                    {itemQtyError && (
                      <span className="text-[10px] text-rose-400 mt-0.5 block">{itemQtyError}</span>
                    )}
                  </div>

                  {/* Unit Price */}
                  <div className="sm:col-span-2">
                    <label htmlFor={`item-price-${idx}`} className="block text-[11px] font-medium text-slate-400 mb-1">
                      Unit Price <span className="text-rose-400">*</span>
                    </label>
                    <input
                      id={`item-price-${idx}`}
                      type="text"
                      placeholder="0.00"
                      value={item.unitPrice}
                      onChange={(e) => onItemChange(idx, 'unitPrice', e.target.value)}
                      disabled={isSubmitting}
                      className={`w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border text-xs text-white font-mono focus:outline-none focus:border-teal-500 transition ${
                        itemPriceError ? 'border-rose-500' : 'border-slate-800'
                      }`}
                    />
                    {itemPriceError && (
                      <span className="text-[10px] text-rose-400 mt-0.5 block">{itemPriceError}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 3: Financial Details & Totals Preview */}
      <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center text-xs font-bold">
            3
          </span>
          Financial Totals &amp; Terms
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Adjustments and Dates */}
          <div className="space-y-4">
            {/* Discount Input */}
            <div>
              <label htmlFor="invoice-discount" className="block text-xs font-medium text-slate-300 mb-1">
                {`Discount Amount${currency ? ` (${currency})` : ''}`}
              </label>
              <input
                id="invoice-discount"
                type="text"
                placeholder="0.00"
                value={discount}
                onChange={(e) => onDiscountChange(e.target.value)}
                disabled={isSubmitting}
                className={`w-full px-3 py-2 rounded-lg bg-slate-950 border text-xs text-white font-mono focus:outline-none focus:border-teal-500 transition ${
                  calculations.isDiscountInvalid || fieldErrors.discount ? 'border-rose-500' : 'border-slate-800'
                }`}
              />
              {calculations.isDiscountInvalid ? (
                <span className="text-[11px] text-rose-400 mt-1 block">
                  {`Discount cannot exceed subtotal (${formatMinorUnits(calculations.subtotalCents, currency)})`}
                </span>
              ) : fieldErrors.discount ? (
                <span className="text-[11px] text-rose-400 mt-1 block">{fieldErrors.discount}</span>
              ) : null}
            </div>

            {/* Tax Rate Input */}
            <div>
              <label htmlFor="invoice-tax" className="block text-xs font-medium text-slate-300 mb-1">
                Tax Rate (%)
              </label>
              <input
                id="invoice-tax"
                type="text"
                placeholder="e.g. 18.00 (or leave blank)"
                value={taxRate}
                onChange={(e) => onTaxRateChange(e.target.value)}
                disabled={isSubmitting}
                className={`w-full px-3 py-2 rounded-lg bg-slate-950 border text-xs text-white font-mono focus:outline-none focus:border-teal-500 transition ${
                  fieldErrors.taxRate ? 'border-rose-500' : 'border-slate-800'
                }`}
              />
              {fieldErrors.taxRate && (
                <span className="text-[11px] text-rose-400 mt-1 block">{fieldErrors.taxRate}</span>
              )}
            </div>

            {/* Due Date */}
            <div>
              <label htmlFor="invoice-due-date" className="block text-xs font-medium text-slate-300 mb-1">
                Due Date (Optional)
              </label>
              <input
                id="invoice-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => onDueDateChange(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-teal-500 transition"
              />
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="invoice-notes" className="block text-xs font-medium text-slate-300 mb-1">
                Invoice Notes (Optional)
              </label>
              <textarea
                id="invoice-notes"
                rows={2}
                maxLength={2000}
                placeholder="Instructions, payment terms, or remarks..."
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 transition"
              />
            </div>
          </div>

          {/* Right: Decimal-Safe Calculation Preview */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between space-y-4">
            {loadingCurrency && (
              <div
                data-testid="currency-resolving-indicator"
                className="text-[11px] text-slate-400 animate-pulse pb-1 border-b border-slate-800 flex items-center gap-1.5"
              >
                <span>Resolving active clinic currency...</span>
              </div>
            )}
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>Subtotal</span>
                <span className="font-mono text-slate-200">
                  {formatMinorUnits(calculations.subtotalCents, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Discount</span>
                <span className="font-mono text-emerald-400">
                  -{formatMinorUnits(calculations.discountCents, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Taxable Amount</span>
                <span className="font-mono text-slate-200">
                  {formatMinorUnits(calculations.taxableCents, currency)}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Tax {taxRate ? `(${taxRate}%)` : ''}</span>
                <span className="font-mono text-slate-200">
                  {formatMinorUnits(calculations.taxCents, currency)}
                </span>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-sm font-bold text-white uppercase tracking-wider">
                  Total Amount
                </span>
                <span className="text-base font-mono font-bold text-teal-300">
                  {formatMinorUnits(calculations.totalCents, currency)}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 italic border-t border-slate-800/80 pt-2">
              Note: Calculations shown are instant client previews. Final rounding and financial values are certified authoritatively by server transaction.
            </div>
          </div>
        </div>
      </div>

      {/* Submission Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
        <Link
          href="/dashboard/billing"
          className="px-4 py-2.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={
            isSubmitting ||
            calculations.isDiscountInvalid ||
            loadingCurrency ||
            Boolean(currencyError) ||
            !currency
          }
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 transition shadow-sm shadow-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Creating Draft...
            </>
          ) : loadingCurrency ? (
            'Resolving Currency...'
          ) : (
            'Create Draft Invoice'
          )}
        </button>
      </div>
    </form>
  );
}

function CreateInvoiceContent() {
  const searchParams = useSearchParams();
  const preselectedPatientId = searchParams.get('patientId') || '';
  const preselectedAppointmentId = searchParams.get('appointmentId') || '';
  const preselectedConsultationId = searchParams.get('consultationId') || '';

  // Form State
  const [patientId, setPatientId] = useState(preselectedPatientId);
  const [appointmentId, setAppointmentId] = useState(preselectedAppointmentId);
  const [consultationId, setConsultationId] = useState(preselectedConsultationId);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('0.00');
  const [taxRate, setTaxRate] = useState('');

  // Currency State - starts explicitly unresolved (null)
  const [currency, setCurrency] = useState<string | null>(null);
  const [loadingCurrency, setLoadingCurrency] = useState<boolean>(true);
  const [currencyError, setCurrencyError] = useState<string | null>(null);

  const [items, setItems] = useState<LineItemFormRow[]>([
    {
      id: 'item-initial-1',
      itemType: 'CONSULTATION',
      description: '',
      quantity: 1,
      unitPrice: '',
    },
  ]);

  // Options State
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);

  // Status & Feedback State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [createdInvoice, setCreatedInvoice] = useState<CreatedInvoiceSummary | null>(null);

  // Clear encounter IDs when patient changes
  const handlePatientChange = useCallback((newPatientId: string) => {
    setPatientId((prev) => {
      if (prev !== newPatientId) {
        setAppointmentId('');
        setConsultationId('');
      }
      return newPatientId;
    });
  }, []);

  // Retry handler for clinic configuration currency
  const handleRetryCurrency = useCallback(async () => {
    setLoadingCurrency(true);
    setCurrencyError(null);
    try {
      const authRes = await fetch('/api/auth/me');
      if (!authRes.ok) {
        setCurrency(null);
        setCurrencyError('Unable to load active clinic details. Please check your connection or log in again.');
        return;
      }
      const authData = await authRes.json();
      const rawCurrency = authData.activeClinic?.currency;
      if (isSupportedCurrency(rawCurrency)) {
        setCurrency(rawCurrency);
        setCurrencyError(null);
      } else {
        setCurrency(null);
        setCurrencyError(
          rawCurrency
            ? `Active clinic operates in unsupported currency "${rawCurrency}". Supported currencies are INR and NPR.`
            : 'Active clinic has no configured currency. Please configure clinic currency in settings.'
        );
      }
    } catch {
      setCurrency(null);
      setCurrencyError('Failed to verify active clinic currency due to a network error.');
    } finally {
      setLoadingCurrency(false);
    }
  }, []);

  // Fetch Clinic Configuration & Patients
  useEffect(() => {
    let ignore = false;

    async function loadInitialData() {
      // 1. Fetch clinic currency
      try {
        const authRes = await fetch('/api/auth/me');
        if (!authRes.ok) {
          if (!ignore) {
            setCurrency(null);
            setCurrencyError('Unable to load active clinic details. Please check your connection or log in again.');
          }
        } else {
          const authData = await authRes.json();
          const rawCurrency = authData.activeClinic?.currency;
          if (!ignore) {
            if (isSupportedCurrency(rawCurrency)) {
              setCurrency(rawCurrency);
              setCurrencyError(null);
            } else {
              setCurrency(null);
              setCurrencyError(
                rawCurrency
                  ? `Active clinic operates in unsupported currency "${rawCurrency}". Supported currencies are INR and NPR.`
                  : 'Active clinic has no configured currency. Please configure clinic currency in settings.'
              );
            }
          }
        }
      } catch {
        if (!ignore) {
          setCurrency(null);
          setCurrencyError('Failed to verify active clinic currency due to a network error.');
        }
      } finally {
        if (!ignore) {
          setLoadingCurrency(false);
        }
      }

      // 2. Fetch patients
      setLoadingPatients(true);
      try {
        const patientsRes = await fetch('/api/patients?limit=100');
        if (patientsRes.ok) {
          const patientsData = await patientsRes.json();
          if (!ignore && patientsData.patients) {
            setPatients(patientsData.patients);
          }
        }
      } catch (err) {
        console.error('Error fetching patients for invoice creation:', err);
      } finally {
        if (!ignore) {
          setLoadingPatients(false);
        }
      }
    }

    loadInitialData();

    return () => {
      ignore = true;
    };
  }, []);

  // Update item field handler
  const handleItemChange = useCallback((index: number, field: keyof LineItemFormRow, value: LineItemFormRow[keyof LineItemFormRow]) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  // Add item handler
  const handleAddItem = useCallback(() => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        itemType: 'MISC',
        description: '',
        quantity: 1,
        unitPrice: '',
      },
    ]);
  }, []);

  // Remove item handler
  const handleRemoveItem = useCallback((index: number) => {
    setItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Reset form handler
  const handleReset = useCallback(() => {
    setCreatedInvoice(null);
    setPatientId('');
    setAppointmentId('');
    setConsultationId('');
    setDueDate('');
    setNotes('');
    setDiscount('0.00');
    setTaxRate('');
    setFormError(null);
    setFieldErrors({});
    setItems([
      {
        id: `item-${Date.now()}`,
        itemType: 'CONSULTATION',
        description: '',
        quantity: 1,
        unitPrice: '',
      },
    ]);
  }, []);

  // Decimal-safe live calculations
  const calculations = useMemo(
    () => calculateTotalsPreview(items, discount, taxRate),
    [items, discount, taxRate]
  );

  // Form submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Reset previous errors
    setFormError(null);

    // 0. Currency Guard
    if (loadingCurrency) {
      setFormError('Please wait for active clinic currency to resolve.');
      return;
    }
    if (currencyError || !currency) {
      setFormError(currencyError || 'Active clinic currency is unavailable. Invoice creation is blocked.');
      return;
    }

    const errors: Record<string, string> = {};

    // 1. Patient Validation
    if (!patientId || !patientId.trim()) {
      errors.patientId = 'Please select a patient';
    }

    // 2. Line Items Validation
    if (!items || items.length === 0) {
      errors.items = 'At least one line item is required';
    } else {
      items.forEach((item, idx) => {
        if (!item.description || !item.description.trim()) {
          errors[`items.${idx}.description`] = 'Description is required';
        } else if (item.description.trim().length > 255) {
          errors[`items.${idx}.description`] = 'Max 255 characters';
        }

        const q = typeof item.quantity === 'number' ? item.quantity : parseInt(String(item.quantity), 10);
        if (isNaN(q) || q < 1) {
          errors[`items.${idx}.quantity`] = 'Quantity must be at least 1';
        } else if (q > 10000) {
          errors[`items.${idx}.quantity`] = 'Quantity cannot exceed 10,000';
        }

        if (!item.unitPrice || !item.unitPrice.trim()) {
          errors[`items.${idx}.unitPrice`] = 'Unit price is required';
        } else if (!hasAtMostTwoDecimals(item.unitPrice)) {
          errors[`items.${idx}.unitPrice`] = 'Max 2 decimal places';
        } else {
          const num = parseFloat(item.unitPrice);
          if (isNaN(num) || num < 0) {
            errors[`items.${idx}.unitPrice`] = 'Must be non-negative';
          }
        }
      });
    }

    // 3. Discount Validation
    if (discount && discount.trim()) {
      if (!hasAtMostTwoDecimals(discount)) {
        errors.discount = 'Max 2 decimal places';
      } else {
        const dNum = parseFloat(discount);
        if (isNaN(dNum) || dNum < 0) {
          errors.discount = 'Discount cannot be negative';
        } else if (calculations.isDiscountInvalid) {
          errors.discount = 'Discount cannot exceed subtotal';
        }
      }
    }

    // 4. Tax Rate Validation
    if (taxRate && taxRate.trim()) {
      if (!hasAtMostTwoDecimals(taxRate)) {
        errors.taxRate = 'Max 2 decimal places';
      } else {
        const tNum = parseFloat(taxRate);
        if (isNaN(tNum) || tNum < 0) {
          errors.taxRate = 'Tax rate cannot be negative';
        } else if (tNum > 100) {
          errors.taxRate = 'Tax rate cannot exceed 100%';
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Please resolve the errors highlighted below.');
      return;
    }

    setFieldErrors({});

    // Build payload according to CreateInvoiceInputSchema
    const payload = {
      patientId: patientId.trim(),
      appointmentId: appointmentId.trim() || null,
      consultationId: consultationId.trim() || null,
      dueDate: dueDate.trim() ? dueDate : null,
      notes: notes.trim() ? notes.trim() : null,
      discount: discount.trim() ? discount.trim() : '0.00',
      taxRate: taxRate.trim() ? taxRate.trim() : null,
      items: items.map((it) => ({
        description: it.description.trim(),
        quantity: typeof it.quantity === 'number' ? it.quantity : parseInt(String(it.quantity), 10),
        unitPrice: it.unitPrice.trim(),
        itemType: it.itemType,
      })),
    };

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/billing/invoices', {
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
          throw new Error('Access forbidden: Invoice creation requires write permissions in this clinic.');
        }
        if (res.status === 404) {
          throw new Error('Patient or related encounter record not found in active clinic.');
        }

        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to create invoice.');
      }

      const data = await res.json();
      const created = data.invoice;
      const patientMatch = patients.find((p) => p.id === patientId);

      setCreatedInvoice({
        id: created.id,
        invoiceNumber: created.invoiceNumber,
        status: created.status,
        totalAmount: created.totalAmount,
        currency: created.currency || currency,
        patientName: patientMatch ? patientMatch.name : 'Selected Patient',
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'An unexpected error occurred during submission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CreateInvoiceView
      patientId={patientId}
      appointmentId={appointmentId}
      consultationId={consultationId}
      dueDate={dueDate}
      notes={notes}
      discount={discount}
      taxRate={taxRate}
      items={items}
      currency={currency}
      loadingCurrency={loadingCurrency}
      currencyError={currencyError}
      patients={patients}
      loadingPatients={loadingPatients}
      calculations={calculations}
      isSubmitting={isSubmitting}
      formError={formError}
      fieldErrors={fieldErrors}
      createdInvoice={createdInvoice}
      onPatientChange={handlePatientChange}
      onAppointmentIdChange={setAppointmentId}
      onConsultationIdChange={setConsultationId}
      onDueDateChange={setDueDate}
      onNotesChange={setNotes}
      onDiscountChange={setDiscount}
      onTaxRateChange={setTaxRate}
      onItemChange={handleItemChange}
      onAddItem={handleAddItem}
      onRemoveItem={handleRemoveItem}
      onSubmit={handleSubmit}
      onReset={handleReset}
      onRetryCurrency={handleRetryCurrency}
    />
  );
}

function CreateInvoiceSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
      <div className="h-6 w-36 bg-slate-800 rounded" />
      <div className="h-10 w-64 bg-slate-800 rounded" />
      <div className="h-44 bg-slate-900/60 rounded-xl" />
      <div className="h-60 bg-slate-900/60 rounded-xl" />
    </div>
  );
}

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<CreateInvoiceSkeleton />}>
      <CreateInvoiceContent />
    </Suspense>
  );
}
