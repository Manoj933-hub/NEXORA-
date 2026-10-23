'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

export interface PatientSummary {
  id: string;
  mrn: string;
  name: string;
  phone?: string | null;
}

export interface NotificationLogItem {
  id: string;
  channel: 'SMS' | 'WHATSAPP';
  eventType: string;
  recipientPhone: string;
  messageBody: string;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED';
  providerMessageId?: string | null;
  providerName: string;
  errorMessage?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  patient?: PatientSummary | null;
  createdBy?: { id: string; name: string; email: string } | null;
  appointmentId?: string | null;
  prescriptionId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  APPOINTMENT_BOOKED: 'Booking Confirmation',
  APPOINTMENT_RESCHEDULED: 'Appointment Rescheduled',
  APPOINTMENT_CANCELLED: 'Appointment Cancelled',
  APPOINTMENT_REMINDER: 'Appointment Reminder',
  PRESCRIPTION_READY: 'Prescription Ready',
  PAYMENT_RECEIPT: 'Payment Receipt',
  INVOICE_ISSUED: 'Invoice Issued',
  GENERAL_ANNOUNCEMENT: 'General Announcement',
};

export default function CommunicationsPage() {
  const [logs, setLogs] = useState<NotificationLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination & Filtering
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [selectedChannel, setSelectedChannel] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedEventType, setSelectedEventType] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Selected Log for Details Modal
  const [selectedLog, setSelectedLog] = useState<NotificationLogItem | null>(null);

  // Manual Dispatch Modal
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchPatientId, setDispatchPatientId] = useState('');
  const [dispatchChannel, setDispatchChannel] = useState<'WHATSAPP' | 'SMS'>('WHATSAPP');
  const [dispatchEventType, setDispatchEventType] = useState<'APPOINTMENT_REMINDER' | 'GENERAL_ANNOUNCEMENT'>('APPOINTMENT_REMINDER');
  const [dispatchAppointmentId, setDispatchAppointmentId] = useState('');
  const [dispatchMessage, setDispatchMessage] = useState('');
  const [dispatchSending, setDispatchSending] = useState(false);
  const [dispatchOutcome, setDispatchOutcome] = useState<{
    success: boolean;
    message: string;
    type: 'success' | 'warning' | 'error' | 'info';
  } | null>(null);

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function loadLogs() {
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: limit.toString(),
        });

        if (selectedChannel !== 'ALL') params.set('channel', selectedChannel);
        if (selectedStatus !== 'ALL') params.set('status', selectedStatus);
        if (selectedEventType !== 'ALL') params.set('eventType', selectedEventType);
        if (startDate) params.set('startDate', new Date(startDate).toISOString());
        if (endDate) params.set('endDate', new Date(endDate + 'T23:59:59.999Z').toISOString());

        const res = await fetch(`/api/notifications?${params.toString()}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to load notification logs');
        }

        const data = await res.json();
        if (!ignore) {
          setLogs(data.logs || []);
          setTotalPages(data.pagination?.totalPages || 1);
          setTotalCount(data.pagination?.total || 0);
          setError(null);
        }
      } catch (err) {
        console.error('Error fetching notification logs:', err);
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to fetch logs');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadLogs();

    return () => {
      ignore = true;
    };
  }, [page, limit, selectedChannel, selectedStatus, selectedEventType, startDate, endDate, refreshTrigger]);

  function handleResetFilters() {
    setSelectedChannel('ALL');
    setSelectedStatus('ALL');
    setSelectedEventType('ALL');
    setStartDate('');
    setEndDate('');
    setPage(1);
  }

  async function handleSendManualNotification(e: React.FormEvent) {
    e.preventDefault();
    if (!dispatchPatientId.trim() || dispatchSending) return;

    setDispatchSending(true);
    setDispatchOutcome(null);

    try {
      const payload: {
        patientId: string;
        channel: 'WHATSAPP' | 'SMS';
        eventType: 'APPOINTMENT_REMINDER' | 'GENERAL_ANNOUNCEMENT';
        appointmentId?: string;
        customMessage?: string;
      } = {
        patientId: dispatchPatientId.trim(),
        channel: dispatchChannel,
        eventType: dispatchEventType,
      };

      if (dispatchEventType === 'APPOINTMENT_REMINDER' && dispatchAppointmentId.trim()) {
        payload.appointmentId = dispatchAppointmentId.trim();
      }

      if (dispatchEventType === 'GENERAL_ANNOUNCEMENT') {
        payload.customMessage = dispatchMessage.trim();
      }

      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'CONSENT_DENIED') {
          setDispatchOutcome({
            success: false,
            type: 'error',
            message: `Consent denied: This patient has not provided opt-in consent for ${dispatchChannel} messages.`,
          });
        } else if (data.code === 'DUPLICATE_SUPPRESSED') {
          setDispatchOutcome({
            success: false,
            type: 'info',
            message: 'Duplicate suppressed: An identical notification was already sent to this patient within the last 5 minutes.',
          });
        } else if (data.code === 'PATIENT_RATE_LIMIT_EXCEEDED') {
          setDispatchOutcome({
            success: false,
            type: 'warning',
            message: 'Patient rate limit reached: Maximum 3 notifications permitted per patient per hour.',
          });
        } else if (data.code === 'ALERT_TYPE_DISABLED') {
          setDispatchOutcome({
            success: false,
            type: 'warning',
            message: 'This notification category is currently disabled in clinic settings.',
          });
        } else {
          setDispatchOutcome({
            success: false,
            type: 'error',
            message: data.error || 'Failed to dispatch notification.',
          });
        }
        return;
      }

      // 201 Response from dispatch API
      if (data.notification?.success) {
        setDispatchOutcome({
          success: true,
          type: 'success',
          message: `Notification sent successfully via ${data.notification.channel} to ${data.notification.recipientPhone || 'patient'}.`,
        });
        // Reset inputs
        setDispatchMessage('');
        setDispatchAppointmentId('');
        setRefreshTrigger((prev) => prev + 1);
      } else {
        setDispatchOutcome({
          success: false,
          type: 'warning',
          message: `Notification logged, but delivery failed at provider: ${data.notification?.error || 'Unknown carrier error'}`,
        });
        setRefreshTrigger((prev) => prev + 1);
      }
    } catch (err) {
      console.error('Manual dispatch error:', err);
      setDispatchOutcome({
        success: false,
        type: 'error',
        message: 'A network error occurred while sending the notification.',
      });
    } finally {
      setDispatchSending(false);
    }
  }

  return (
    <CommunicationsView
      logs={logs}
      loading={loading}
      error={error}
      page={page}
      setPage={setPage}
      limit={limit}
      setLimit={setLimit}
      totalPages={totalPages}
      totalCount={totalCount}
      selectedChannel={selectedChannel}
      setSelectedChannel={setSelectedChannel}
      selectedStatus={selectedStatus}
      setSelectedStatus={setSelectedStatus}
      selectedEventType={selectedEventType}
      setSelectedEventType={setSelectedEventType}
      startDate={startDate}
      setStartDate={setStartDate}
      endDate={endDate}
      setEndDate={setEndDate}
      onResetFilters={handleResetFilters}
      selectedLog={selectedLog}
      setSelectedLog={setSelectedLog}
      showDispatchModal={showDispatchModal}
      setShowDispatchModal={setShowDispatchModal}
      dispatchPatientId={dispatchPatientId}
      setDispatchPatientId={setDispatchPatientId}
      dispatchChannel={dispatchChannel}
      setDispatchChannel={setDispatchChannel}
      dispatchEventType={dispatchEventType}
      setDispatchEventType={setDispatchEventType}
      dispatchAppointmentId={dispatchAppointmentId}
      setDispatchAppointmentId={setDispatchAppointmentId}
      dispatchMessage={dispatchMessage}
      setDispatchMessage={setDispatchMessage}
      dispatchSending={dispatchSending}
      dispatchOutcome={dispatchOutcome}
      setDispatchOutcome={setDispatchOutcome}
      handleSendManualNotification={handleSendManualNotification}
    />
  );
}

export interface CommunicationsViewProps {
  logs: NotificationLogItem[];
  loading: boolean;
  error: string | null;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  limit: number;
  setLimit: (v: number) => void;
  totalPages: number;
  totalCount: number;
  selectedChannel: string;
  setSelectedChannel: (v: string) => void;
  selectedStatus: string;
  setSelectedStatus: (v: string) => void;
  selectedEventType: string;
  setSelectedEventType: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  onResetFilters: () => void;
  selectedLog: NotificationLogItem | null;
  setSelectedLog: (log: NotificationLogItem | null) => void;
  showDispatchModal: boolean;
  setShowDispatchModal: (show: boolean) => void;
  dispatchPatientId: string;
  setDispatchPatientId: (v: string) => void;
  dispatchChannel: 'SMS' | 'WHATSAPP';
  setDispatchChannel: (v: 'SMS' | 'WHATSAPP') => void;
  dispatchEventType: 'APPOINTMENT_REMINDER' | 'GENERAL_ANNOUNCEMENT';
  setDispatchEventType: (v: 'APPOINTMENT_REMINDER' | 'GENERAL_ANNOUNCEMENT') => void;
  dispatchAppointmentId: string;
  setDispatchAppointmentId: (v: string) => void;
  dispatchMessage: string;
  setDispatchMessage: (v: string) => void;
  dispatchSending: boolean;
  dispatchOutcome: { success: boolean; type: 'success' | 'warning' | 'error' | 'info'; message: string } | null;
  setDispatchOutcome: (outcome: { success: boolean; type: 'success' | 'warning' | 'error' | 'info'; message: string } | null) => void;
  handleSendManualNotification: (e: React.FormEvent) => void;
}

export function CommunicationsView({
  logs,
  loading,
  error,
  page,
  setPage,
  limit,
  setLimit,
  totalPages,
  totalCount,
  selectedChannel,
  setSelectedChannel,
  selectedStatus,
  setSelectedStatus,
  selectedEventType,
  setSelectedEventType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  onResetFilters,
  selectedLog,
  setSelectedLog,
  showDispatchModal,
  setShowDispatchModal,
  dispatchPatientId,
  setDispatchPatientId,
  dispatchChannel,
  setDispatchChannel,
  dispatchEventType,
  setDispatchEventType,
  dispatchAppointmentId,
  setDispatchAppointmentId,
  dispatchMessage,
  setDispatchMessage,
  dispatchSending,
  dispatchOutcome,
  setDispatchOutcome,
  handleSendManualNotification,
}: CommunicationsViewProps) {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-teal-400">
              Front Desk & Operations
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Patient Communications</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Audit logs for all outbound SMS and WhatsApp messages, delivery receipts, and manual front-desk notifications.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/settings/notifications"
            className="px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-600 text-xs font-medium text-slate-300 hover:text-white transition flex items-center gap-1.5"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Alert Settings
          </Link>

          <button
            onClick={() => {
              setDispatchOutcome(null);
              setShowDispatchModal(true);
            }}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-xs font-semibold text-white shadow-lg shadow-teal-900/30 flex items-center gap-1.5 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Send Manual Notification
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Channel */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Channel
            </label>
            <select
              value={selectedChannel}
              onChange={(e) => {
                setSelectedChannel(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-teal-500 focus:outline-none"
            >
              <option value="ALL">All Channels</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="SMS">SMS</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Delivery Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-teal-500 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="SENT">Sent</option>
              <option value="DELIVERED">Delivered</option>
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>

          {/* Event Type */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Event Type
            </label>
            <select
              value={selectedEventType}
              onChange={(e) => {
                setSelectedEventType(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-teal-500 focus:outline-none"
            >
              <option value="ALL">All Event Types</option>
              <option value="APPOINTMENT_BOOKED">Appointment Booked</option>
              <option value="APPOINTMENT_RESCHEDULED">Appointment Rescheduled</option>
              <option value="APPOINTMENT_CANCELLED">Appointment Cancelled</option>
              <option value="APPOINTMENT_REMINDER">Appointment Reminder</option>
              <option value="PRESCRIPTION_READY">Prescription Ready</option>
              <option value="PAYMENT_RECEIPT">Payment Receipt</option>
              <option value="INVOICE_ISSUED">Invoice Issued</option>
              <option value="GENERAL_ANNOUNCEMENT">General Announcement</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-teal-500 focus:outline-none"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:border-teal-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
          <span className="text-slate-400">
            Total records found: <strong className="text-white">{totalCount}</strong>
          </span>
          <button
            onClick={onResetFilters}
            className="text-xs text-teal-400 hover:text-teal-300 underline"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-200 text-xs flex items-center gap-2">
          <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Communications Table */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Date / Time</th>
                <th className="py-3 px-4">Patient</th>
                <th className="py-3 px-4">Channel</th>
                <th className="py-3 px-4">Event Type</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Message Snippet</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-teal-500/30 border-t-teal-400 rounded-full animate-spin mx-auto mb-2" />
                    Loading delivery audit logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <svg className="w-8 h-8 text-slate-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    No communications found matching the selected criteria.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const eventLabel = EVENT_TYPE_LABELS[log.eventType] || log.eventType;
                  return (
                    <tr key={log.id} className="hover:bg-slate-850/40 transition">
                      {/* Timestamp */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-400">
                        {new Date(log.createdAt).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </td>

                      {/* Patient */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {log.patient ? (
                          <div>
                            <span className="font-medium text-white">{log.patient.name}</span>
                            <span className="text-[11px] text-slate-500 block">
                              MRN: {log.patient.mrn} · {log.recipientPhone}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">{log.recipientPhone}</span>
                        )}
                      </td>

                      {/* Channel Badge */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {log.channel === 'WHATSAPP' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            WhatsApp
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-950/60 text-sky-300 border border-sky-800/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                            SMS
                          </span>
                        )}
                      </td>

                      {/* Event Type */}
                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-200">
                        {eventLabel}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {log.status === 'SENT' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                            Sent
                          </span>
                        )}
                        {log.status === 'DELIVERED' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-950/60 text-blue-300 border border-blue-800/60">
                            Delivered
                          </span>
                        )}
                        {log.status === 'FAILED' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-950/60 text-red-300 border border-red-800/60">
                            Failed
                          </span>
                        )}
                        {log.status === 'PENDING' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/60 text-amber-300 border border-amber-800/60">
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Message Snippet */}
                      <td className="py-3 px-4 max-w-xs truncate text-slate-400" title={log.messageBody}>
                        {log.messageBody}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-400 text-xs font-medium border border-slate-700 transition"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>Show:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-white text-xs"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <span>entries per page</span>
          </div>

          <div className="flex items-center gap-2">
            <span>
              Page <strong className="text-white">{page}</strong> of <strong className="text-white">{totalPages}</strong>
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal 1: Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">Notification Audit Record</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Record ID:</span>
                <span className="font-mono text-slate-300">{selectedLog.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Patient:</span>
                <span className="text-white font-medium">
                  {selectedLog.patient ? `${selectedLog.patient.name} (${selectedLog.patient.mrn})` : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Masked Phone:</span>
                <span className="font-mono text-slate-300">{selectedLog.recipientPhone}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Channel / Event:</span>
                <span>
                  {selectedLog.channel} · {EVENT_TYPE_LABELS[selectedLog.eventType] || selectedLog.eventType}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Delivery Status:</span>
                <span className="font-semibold text-white">{selectedLog.status}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Provider:</span>
                <span>{selectedLog.providerName} {selectedLog.providerMessageId ? `(${selectedLog.providerMessageId})` : ''}</span>
              </div>
              {selectedLog.errorMessage && (
                <div className="py-2 px-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-200">
                  <div className="font-semibold text-red-300 mb-0.5">Error Detail:</div>
                  {selectedLog.errorMessage}
                </div>
              )}

              {/* Message Body */}
              <div className="pt-2">
                <div className="text-slate-400 font-semibold mb-1">Message Body (Tokens Protected):</div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 font-mono text-[11px] whitespace-pre-wrap">
                  {selectedLog.messageBody}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Front-Desk Manual Dispatch Modal */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Manual Patient Notification</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Send an appointment reminder or clinic announcement. Enforces patient consent and rate limits.
                </p>
              </div>
              <button
                onClick={() => setShowDispatchModal(false)}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* Outcome Banner */}
            {dispatchOutcome && (
              <div
                className={`p-3 rounded-xl border flex items-start gap-2 ${
                  dispatchOutcome.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                    : dispatchOutcome.type === 'info'
                    ? 'bg-blue-950/40 border-blue-800 text-blue-200'
                    : dispatchOutcome.type === 'warning'
                    ? 'bg-amber-950/40 border-amber-800 text-amber-200'
                    : 'bg-red-950/40 border-red-800 text-red-200'
                }`}
              >
                <div className="flex-1">{dispatchOutcome.message}</div>
              </div>
            )}

            <form onSubmit={handleSendManualNotification} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-300 uppercase tracking-wider text-[11px] mb-1">
                  Patient ID <span className="text-teal-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={dispatchPatientId}
                  onChange={(e) => setDispatchPatientId(e.target.value)}
                  placeholder="Enter patient UUID (e.g. from patient file)"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 uppercase tracking-wider text-[11px] mb-1">
                    Channel <span className="text-teal-400">*</span>
                  </label>
                  <select
                    value={dispatchChannel}
                    onChange={(e) => setDispatchChannel(e.target.value as 'WHATSAPP' | 'SMS')}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:border-teal-500 focus:outline-none"
                  >
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="SMS">SMS</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 uppercase tracking-wider text-[11px] mb-1">
                    Notification Type <span className="text-teal-400">*</span>
                  </label>
                  <select
                    value={dispatchEventType}
                    onChange={(e) => setDispatchEventType(e.target.value as 'APPOINTMENT_REMINDER' | 'GENERAL_ANNOUNCEMENT')}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:border-teal-500 focus:outline-none"
                  >
                    <option value="APPOINTMENT_REMINDER">Appointment Reminder</option>
                    <option value="GENERAL_ANNOUNCEMENT">General Announcement</option>
                  </select>
                </div>
              </div>

              {dispatchEventType === 'APPOINTMENT_REMINDER' && (
                <div>
                  <label className="block font-semibold text-slate-300 uppercase tracking-wider text-[11px] mb-1">
                    Appointment ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={dispatchAppointmentId}
                    onChange={(e) => setDispatchAppointmentId(e.target.value)}
                    placeholder="Linked Appointment UUID (optional)"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:border-teal-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    If omitted, the clinic general reminder template is used.
                  </p>
                </div>
              )}

              {dispatchEventType === 'GENERAL_ANNOUNCEMENT' && (
                <div>
                  <label className="block font-semibold text-slate-300 uppercase tracking-wider text-[11px] mb-1">
                    Announcement Message <span className="text-teal-400">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    maxLength={300}
                    value={dispatchMessage}
                    onChange={(e) => setDispatchMessage(e.target.value)}
                    placeholder="Enter announcement text (e.g. Clinic hours changed). Never include clinical details or medication names."
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:border-teal-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    PHI Minimization enforced. Prohibited words (diagnoses, prescription details) will be rejected.
                  </p>
                </div>
              )}

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dispatchSending}
                  className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold flex items-center gap-2 shadow-lg shadow-teal-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {dispatchSending && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {dispatchSending ? 'Sending...' : 'Dispatch Notification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
