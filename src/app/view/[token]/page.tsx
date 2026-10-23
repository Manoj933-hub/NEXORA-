import React from 'react';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { hashSecureToken, isSecureLinkExpired } from '@/lib/notifications/secure-links';
import { PrintButton } from '@/components/public-document/print-button';

export const metadata: Metadata = {
  title: 'Secure Document | NEXORA',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export function DocumentUnavailableView() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-4 shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        <div>
          <h1 className="text-lg font-bold text-white">Document Unavailable</h1>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            This document link is invalid, has expired, or is no longer available.
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-850 text-xs text-slate-400 text-left space-y-1">
          <div className="font-semibold text-slate-300">Privacy & Expiration Safeguards:</div>
          <div>
            To protect your medical and financial privacy, secure links expire automatically after 7 days and can only be accessed via the original authorized link.
          </div>
        </div>

        <p className="text-xs text-slate-500">
          If you need a copy of this document, please contact your healthcare provider or clinic reception directly.
        </p>
      </div>
    </div>
  );
}

function DocumentLoadingView() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-3 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
        <span className="text-xs text-slate-400">Verifying secure document authorization...</span>
      </div>
    </div>
  );
}

export async function DocumentContent({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // 1. Strict Token Format Validation
  if (!token || typeof token !== 'string' || token.trim().length < 16) {
    return <DocumentUnavailableView />;
  }

  const rawToken = token.trim();
  let tokenHash: string;
  try {
    tokenHash = hashSecureToken(rawToken);
  } catch {
    return <DocumentUnavailableView />;
  }

  // 2. Lookup Secure Document Link Record by SHA-256 Hash
  const link = await prisma.secureDocumentLink.findUnique({
    where: { tokenHash },
  });

  // 3. Expiration, Existence, and Revocation Verification
  if (!link || isSecureLinkExpired(link.expiresAt) || link.revokedAt !== null) {
    return <DocumentUnavailableView />;
  }

  // 4. Update Audit Access Counters (Ancillary tracking)
  try {
    await prisma.secureDocumentLink.update({
      where: { id: link.id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });
  } catch (err) {
    console.warn('Failed to update secure document link access counter:', err);
  }

  // 5. Render Authorized Document View According to Resource Type
  if (link.resourceType === 'PRESCRIPTION') {
    const prescription = await prisma.prescription.findFirst({
      where: {
        id: link.resourceId,
        clinicId: link.clinicId,
        patientId: link.patientId,
      },
      include: {
        clinic: {
          select: {
            name: true,
            phone: true,
            address: true,
            country: true,
          },
        },
        patient: {
          select: {
            name: true,
            mrn: true,
            gender: true,
            dateOfBirth: true,
          },
        },
        doctor: {
          select: {
            name: true,
          },
        },
        items: {
          select: {
            id: true,
            medicationName: true,
            strength: true,
            route: true,
            frequency: true,
            duration: true,
            quantity: true,
            instructions: true,
          },
        },
      },
    });

    if (!prescription) {
      return <DocumentUnavailableView />;
    }

    const formattedDob = prescription.patient.dateOfBirth
      ? new Date(prescription.patient.dateOfBirth).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : null;

    return (
      <div className="min-h-screen bg-slate-950 print:bg-white text-slate-100 print:text-black py-8 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Top Bar with Print Button */}
          <div className="flex items-center justify-between border-b border-slate-800 print:hidden pb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Verified Medical Document
              </span>
            </div>
            <PrintButton label="Print Prescription" />
          </div>

          {/* Document Sheet */}
          <div className="p-6 sm:p-8 rounded-2xl bg-slate-900 print:bg-white border border-slate-800 print:border-none shadow-2xl space-y-6">
            {/* Clinic Letterhead */}
            <div className="border-b border-slate-800 print:border-slate-300 pb-5 flex flex-col sm:flex-row justify-between items-start gap-4">
              <div>
                <h1 className="text-xl font-bold text-white print:text-black tracking-tight">
                  {prescription.clinic.name}
                </h1>
                <p className="text-xs text-slate-400 print:text-slate-600 mt-1">
                  {prescription.clinic.address || 'Medical Practice'} · {prescription.clinic.country}
                </p>
                {prescription.clinic.phone && (
                  <p className="text-xs text-slate-400 print:text-slate-600">
                    Phone: {prescription.clinic.phone}
                  </p>
                )}
              </div>
              <div className="sm:text-right">
                <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-teal-950/60 print:bg-slate-100 text-teal-300 print:text-slate-800 border border-teal-800/60 print:border-slate-300">
                  Medical Prescription
                </span>
                <p className="text-xs text-slate-400 print:text-slate-600 mt-1.5 font-mono">
                  Date: {new Date(prescription.createdAt).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>

            {/* Patient & Prescriber Details */}
            <div className="grid grid-cols-2 gap-4 text-xs p-4 rounded-xl bg-slate-950/60 print:bg-slate-50 border border-slate-850 print:border-slate-200">
              <div>
                <div className="text-slate-500 print:text-slate-600 uppercase font-semibold text-[10px] tracking-wider mb-0.5">
                  Patient Information
                </div>
                <div className="font-bold text-white print:text-black text-sm">
                  {prescription.patient.name}
                </div>
                <div className="text-slate-400 print:text-slate-700">MRN: {prescription.patient.mrn}</div>
                <div className="text-slate-400 print:text-slate-700">
                  Gender: {prescription.patient.gender || 'Not recorded'}
                  {formattedDob ? ` · DOB: ${formattedDob}` : ''}
                </div>
              </div>

              <div>
                <div className="text-slate-500 print:text-slate-600 uppercase font-semibold text-[10px] tracking-wider mb-0.5">
                  Prescribing Physician
                </div>
                <div className="font-bold text-white print:text-black text-sm">
                  Dr. {prescription.doctor.name}
                </div>
                <div className="text-slate-400 print:text-slate-700">Status: Active & Signed</div>
                <div className="text-slate-400 print:text-slate-700 font-mono text-[11px]">
                  Rx ID: {prescription.id.slice(0, 8)}...
                </div>
              </div>
            </div>

            {/* Medications Table */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-400 print:text-teal-800">
                <span className="text-base font-serif italic">℞</span> Prescribed Medications
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 print:border-slate-300">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 print:bg-slate-100 border-b border-slate-800 print:border-slate-300 text-slate-400 print:text-slate-700 uppercase font-semibold text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Medication</th>
                      <th className="py-2.5 px-3">Strength / Route</th>
                      <th className="py-2.5 px-3">Frequency</th>
                      <th className="py-2.5 px-3">Duration</th>
                      <th className="py-2.5 px-3">Instructions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 print:divide-slate-200 text-slate-200 print:text-black">
                    {prescription.items.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 px-3 font-semibold text-white print:text-black">
                          {item.medicationName}
                        </td>
                        <td className="py-3 px-3 text-slate-300 print:text-slate-800">
                          {item.strength || 'Standard'} {item.route ? `· ${item.route}` : ''}
                        </td>
                        <td className="py-3 px-3 text-slate-300 print:text-slate-800">
                          {item.frequency}
                        </td>
                        <td className="py-3 px-3 text-slate-300 print:text-slate-800">
                          {item.duration || 'As directed'}
                        </td>
                        <td className="py-3 px-3 text-slate-400 print:text-slate-700 italic">
                          {item.instructions || 'Take as prescribed'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Doctor Signature Block */}
            <div className="pt-6 border-t border-slate-800 print:border-slate-300 flex justify-between items-end">
              <div className="text-[11px] text-slate-500 print:text-slate-600 space-y-0.5">
                <div>This document was electronically generated and signed by the licensed physician.</div>
                <div>Authorized via NEXORA Clinical EHR System.</div>
              </div>
              <div className="text-right">
                <div className="w-40 border-b border-slate-700 print:border-black mb-1" />
                <div className="text-xs font-semibold text-white print:text-black">
                  Dr. {prescription.doctor.name}
                </div>
                <div className="text-[10px] text-slate-400 print:text-slate-600">Authorized Physician</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (link.resourceType === 'RECEIPT') {
    const payment = await prisma.payment.findFirst({
      where: {
        id: link.resourceId,
        clinicId: link.clinicId,
      },
      include: {
        clinic: {
          select: {
            name: true,
            phone: true,
            address: true,
            currency: true,
          },
        },
        invoice: {
          include: {
            patient: {
              select: {
                id: true,
                name: true,
                mrn: true,
              },
            },
          },
        },
      },
    });

    if (!payment || payment.invoice.patientId !== link.patientId) {
      return <DocumentUnavailableView />;
    }

    const outstandingBalance = Number(payment.invoice.totalAmount) - Number(payment.invoice.paidAmount);

    return (
      <div className="min-h-screen bg-slate-950 print:bg-white text-slate-100 print:text-black py-8 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Top Bar with Print Button */}
          <div className="flex items-center justify-between border-b border-slate-800 print:hidden pb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Official Payment Receipt
              </span>
            </div>
            <PrintButton label="Print Receipt" />
          </div>

          {/* Receipt Card */}
          <div className="p-6 sm:p-8 rounded-2xl bg-slate-900 print:bg-white border border-slate-800 print:border-none shadow-2xl space-y-6">
            {/* Header */}
            <div className="border-b border-slate-800 print:border-slate-300 pb-5 flex flex-col sm:flex-row justify-between items-start gap-4">
              <div>
                <h1 className="text-xl font-bold text-white print:text-black tracking-tight">
                  {payment.clinic.name}
                </h1>
                <p className="text-xs text-slate-400 print:text-slate-600 mt-1">
                  {payment.clinic.address || 'Clinic Billing Office'}
                </p>
                {payment.clinic.phone && (
                  <p className="text-xs text-slate-400 print:text-slate-600">
                    Phone: {payment.clinic.phone}
                  </p>
                )}
              </div>
              <div className="sm:text-right">
                <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-emerald-950/60 print:bg-slate-100 text-emerald-300 print:text-slate-800 border border-emerald-800/60 print:border-slate-300">
                  Payment Receipt
                </span>
                <p className="text-xs text-slate-400 print:text-slate-600 mt-1.5 font-mono">
                  Date: {new Date(payment.receivedAt).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>

            {/* Amount Paid Spotlight */}
            <div className="p-5 rounded-xl bg-slate-950/80 print:bg-slate-50 border border-slate-850 print:border-slate-200 text-center space-y-1">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 print:text-slate-600">
                Amount Paid & Confirmed
              </div>
              <div className="text-3xl font-extrabold text-teal-300 print:text-teal-800 font-mono">
                {payment.invoice.currency} {Number(payment.amount).toFixed(2)}
              </div>
              <div className="text-xs text-emerald-400 print:text-emerald-700 font-semibold flex items-center justify-center gap-1.5 pt-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Payment Successfully Settled
              </div>
            </div>

            {/* Transaction Details */}
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-800/60 print:border-slate-200">
                <span className="text-slate-400 print:text-slate-600">Patient:</span>
                <span className="font-semibold text-white print:text-black">
                  {payment.invoice.patient.name} (MRN: {payment.invoice.patient.mrn})
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800/60 print:border-slate-200">
                <span className="text-slate-400 print:text-slate-600">Invoice Number:</span>
                <span className="font-mono text-white print:text-black">{payment.invoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800/60 print:border-slate-200">
                <span className="text-slate-400 print:text-slate-600">Payment Method:</span>
                <span className="font-semibold text-white print:text-black">{payment.method}</span>
              </div>
              {payment.transactionRef && (
                <div className="flex justify-between py-2 border-b border-slate-800/60 print:border-slate-200">
                  <span className="text-slate-400 print:text-slate-600">Transaction Reference:</span>
                  <span className="font-mono text-slate-300 print:text-slate-700">{payment.transactionRef}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b border-slate-800/60 print:border-slate-200">
                <span className="text-slate-400 print:text-slate-600">Remaining Balance Due:</span>
                <span className={`font-mono font-bold ${outstandingBalance <= 0 ? 'text-emerald-400 print:text-emerald-700' : 'text-amber-400 print:text-amber-700'}`}>
                  {payment.invoice.currency} {Math.max(0, outstandingBalance).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-6 border-t border-slate-800 print:border-slate-300 text-[11px] text-slate-500 print:text-slate-600 text-center">
              Thank you for choosing {payment.clinic.name}. Please keep this receipt for your personal tax or insurance records.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (link.resourceType === 'INVOICE') {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: link.resourceId,
        clinicId: link.clinicId,
        patientId: link.patientId,
      },
      include: {
        clinic: {
          select: {
            name: true,
            phone: true,
            address: true,
            currency: true,
          },
        },
        patient: {
          select: {
            name: true,
            mrn: true,
          },
        },
        items: {
          select: {
            id: true,
            description: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
        },
      },
    });

    if (!invoice) {
      return <DocumentUnavailableView />;
    }

    const balanceDue = Number(invoice.totalAmount) - Number(invoice.paidAmount);

    return (
      <div className="min-h-screen bg-slate-950 print:bg-white text-slate-100 print:text-black py-8 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 print:hidden pb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400" />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Official Patient Invoice
              </span>
            </div>
            <PrintButton label="Print Invoice" />
          </div>

          <div className="p-6 sm:p-8 rounded-2xl bg-slate-900 print:bg-white border border-slate-800 print:border-none shadow-2xl space-y-6">
            <div className="border-b border-slate-800 print:border-slate-300 pb-5 flex flex-col sm:flex-row justify-between items-start gap-4">
              <div>
                <h1 className="text-xl font-bold text-white print:text-black tracking-tight">
                  {invoice.clinic.name}
                </h1>
                <p className="text-xs text-slate-400 print:text-slate-600 mt-1">
                  {invoice.clinic.address || 'Clinic Billing Department'}
                </p>
                {invoice.clinic.phone && (
                  <p className="text-xs text-slate-400 print:text-slate-600">
                    Phone: {invoice.clinic.phone}
                  </p>
                )}
              </div>
              <div className="sm:text-right">
                <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-teal-950/60 print:bg-slate-100 text-teal-300 print:text-slate-800 border border-teal-800/60 print:border-slate-300">
                  Invoice {invoice.invoiceNumber}
                </span>
                <p className="text-xs text-slate-400 print:text-slate-600 mt-1.5">
                  Status: <strong className="text-white print:text-black uppercase">{invoice.status}</strong>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs p-4 rounded-xl bg-slate-950/60 print:bg-slate-50 border border-slate-850 print:border-slate-200">
              <div>
                <div className="text-slate-500 uppercase font-semibold text-[10px] tracking-wider mb-0.5">
                  Billed To
                </div>
                <div className="font-bold text-white print:text-black text-sm">
                  {invoice.patient.name}
                </div>
                <div className="text-slate-400 print:text-slate-600">MRN: {invoice.patient.mrn}</div>
              </div>
              <div className="text-right">
                <div className="text-slate-500 uppercase font-semibold text-[10px] tracking-wider mb-0.5">
                  Dates
                </div>
                <div className="text-slate-300 print:text-slate-800">
                  Issued: {invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString('en-GB') : 'N/A'}
                </div>
                {invoice.dueDate && (
                  <div className="text-slate-400 print:text-slate-600">
                    Due: {new Date(invoice.dueDate).toLocaleDateString('en-GB')}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="overflow-x-auto rounded-xl border border-slate-800 print:border-slate-300">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 print:bg-slate-100 border-b border-slate-800 print:border-slate-300 text-slate-400 print:text-slate-700 uppercase font-semibold text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Unit Price</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 print:divide-slate-200 text-slate-200 print:text-black">
                    {invoice.items.map((item) => (
                      <tr key={item.id}>
                        <td className="py-3 px-3 font-medium text-white print:text-black">{item.description}</td>
                        <td className="py-3 px-3 text-center text-slate-300 print:text-slate-800">{item.quantity}</td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300 print:text-slate-800">
                          {Number(item.unitPrice).toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-white print:text-black">
                          {Number(item.lineTotal).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-1.5 pt-4 border-t border-slate-800 print:border-slate-300 text-xs text-right">
              <div className="flex justify-end gap-6 text-slate-400 print:text-slate-600">
                <span>Total Amount:</span>
                <span className="font-mono text-white print:text-black font-semibold w-24">
                  {invoice.currency} {Number(invoice.totalAmount).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-end gap-6 text-slate-400 print:text-slate-600">
                <span>Amount Paid:</span>
                <span className="font-mono text-emerald-400 print:text-emerald-700 font-semibold w-24">
                  {invoice.currency} {Number(invoice.paidAmount).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-end gap-6 text-sm font-bold text-teal-300 print:text-teal-800 pt-1 border-t border-slate-800/60 print:border-slate-200">
                <span>Balance Due:</span>
                <span className="font-mono w-24">
                  {invoice.currency} {Math.max(0, balanceDue).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <DocumentUnavailableView />;
}

export default function PublicDocumentViewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <React.Suspense fallback={<DocumentLoadingView />}>
      <DocumentContent params={params} />
    </React.Suspense>
  );
}
