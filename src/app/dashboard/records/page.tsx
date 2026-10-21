import React from 'react';
import Link from 'next/link';

export default function ClinicalRecordsRoadmapPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="border-b border-slate-800 pb-5">
        <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-800 text-[11px] font-semibold mb-2">
          Clinical Module Foundation
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Electronic Medical Records &amp; Clinical Documentation
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
          Comprehensive digital charting, prescription generation, and diagnostic records engineered for outpatient workflows in India and Nepal.
        </p>
      </div>

      {/* Status Notice */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-teal-950/30 to-slate-900 border border-teal-800/40 relative overflow-hidden">
        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
            <h2 className="text-base font-bold text-white">Task 004 Active Foundation</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
            Patient demographic profiles, clinic Medical Record Numbers (MRN), and reception intake queues are live in this release. Doctor clinical documentation, chief complaint soap notes, and prescription engines connect to this foundation in Task 005.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              href="/dashboard/patients"
              className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition"
            >
              Manage Patient Profiles
            </Link>
            <Link
              href="/dashboard/queue"
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            >
              Open Reception Queue
            </Link>
          </div>
        </div>
      </div>

      {/* Features Blueprint Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
          <div className="w-9 h-9 rounded-lg bg-teal-950 text-teal-300 border border-teal-800/60 flex items-center justify-center font-bold text-sm">
            1
          </div>
          <h3 className="font-bold text-white text-sm">Doctor Consultation Notes</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Structured SOAP notes (Subjective, Objective, Assessment, Plan) with vital signs logging and ICD diagnosis mapping.
          </p>
          <span className="inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-teal-300">
            Scheduled: Task 005
          </span>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
          <div className="w-9 h-9 rounded-lg bg-teal-950 text-teal-300 border border-teal-800/60 flex items-center justify-center font-bold text-sm">
            2
          </div>
          <h3 className="font-bold text-white text-sm">Digital Prescription Engine</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Medication dosage calculators, local brand name catalogs for India &amp; Nepal, instructions in local scripts, and PDF generation.
          </p>
          <span className="inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-teal-300">
            Scheduled: Task 005
          </span>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
          <div className="w-9 h-9 rounded-lg bg-teal-950 text-teal-300 border border-teal-800/60 flex items-center justify-center font-bold text-sm">
            3
          </div>
          <h3 className="font-bold text-white text-sm">Diagnostics &amp; Lab Reports</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Secure report attachments with tenant-isolated storage, pathology findings, and radiology review logs.
          </p>
          <span className="inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-teal-300">
            Scheduled: Task 005
          </span>
        </div>
      </div>
    </div>
  );
}
