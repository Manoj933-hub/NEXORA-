'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface AppointmentItem {
  id: string;
  startTime: string;
  endTime: string;
  status: 'SCHEDULED' | 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  reason?: string | null;
  notes?: string | null;
  cancelledReason?: string | null;
  patient: {
    id: string;
    mrn: string;
    name: string;
    phone?: string | null;
  };
  doctor?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export default function AppointmentsListPage() {
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Modal / Action states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [cancelModalId, setCancelModalId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleModalAppointment, setRescheduleModalAppointment] = useState<AppointmentItem | null>(null);
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Reminder Modal State (Phase 9.4 Front-Desk Action)
  const [reminderModalAppointment, setReminderModalAppointment] = useState<AppointmentItem | null>(null);
  const [reminderChannel, setReminderChannel] = useState<'WHATSAPP' | 'SMS'>('WHATSAPP');
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderOutcome, setReminderOutcome] = useState<{
    type: 'success' | 'warning' | 'error' | 'info';
    message: string;
  } | null>(null);

  const reloadAppointments = useCallback(() => {
    setLoading(true);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  async function handleSendReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!reminderModalAppointment || reminderSending) return;

    setReminderSending(true);
    setReminderOutcome(null);

    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: reminderModalAppointment.patient.id,
          channel: reminderChannel,
          eventType: 'APPOINTMENT_REMINDER',
          appointmentId: reminderModalAppointment.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'CONSENT_DENIED') {
          setReminderOutcome({
            type: 'error',
            message: `Consent denied: Patient has not consented to ${reminderChannel} messages.`,
          });
        } else if (data.code === 'DUPLICATE_SUPPRESSED') {
          setReminderOutcome({
            type: 'info',
            message: 'Reminder suppressed: An identical reminder was already sent to this patient within the last 5 minutes.',
          });
        } else if (data.code === 'PATIENT_RATE_LIMIT_EXCEEDED') {
          setReminderOutcome({
            type: 'warning',
            message: 'Patient rate limit reached: Maximum 3 notifications permitted per patient per hour.',
          });
        } else if (data.code === 'ALERT_TYPE_DISABLED') {
          setReminderOutcome({
            type: 'warning',
            message: 'Appointment alerts are currently disabled in clinic settings.',
          });
        } else {
          setReminderOutcome({
            type: 'error',
            message: data.error || 'Failed to dispatch appointment reminder.',
          });
        }
        return;
      }

      if (data.notification?.success) {
        setReminderOutcome({
          type: 'success',
          message: `Reminder sent successfully via ${data.notification.channel} to ${data.notification.recipientPhone || 'patient'}.`,
        });
      } else {
        setReminderOutcome({
          type: 'warning',
          message: `Reminder logged, but delivery failed at provider: ${data.notification?.error || 'Carrier error'}`,
        });
      }
    } catch (err) {
      console.error('Error sending appointment reminder:', err);
      setReminderOutcome({
        type: 'error',
        message: 'A network error occurred while dispatching the reminder.',
      });
    } finally {
      setReminderSending(false);
    }
  }

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const params = new URLSearchParams({
          limit: '50',
        });
        if (selectedDate) params.set('date', selectedDate);
        if (selectedStatus && selectedStatus !== 'ALL') params.set('status', selectedStatus);

        const res = await fetch(`/api/appointments?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to load appointments');
        const data = await res.json();
        if (!ignore) {
          setAppointments(data.appointments || []);
        }
      } catch (err) {
        console.error('Error fetching appointments:', err);
        if (!ignore) {
          setError('Failed to load appointments.');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      ignore = true;
    };
  }, [selectedDate, selectedStatus, refreshTrigger]);

  async function handleStatusUpdate(appointmentId: string, targetStatus: string, reason?: string) {
    setActionLoadingId(appointmentId);
    setError(null);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: targetStatus,
          cancelledReason: reason || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to update status');
        return;
      }

      setCancelModalId(null);
      setCancelReason('');
      reloadAppointments();
    } catch {
      alert('Network error updating appointment status');
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleReschedule(e: React.FormEvent) {
    e.preventDefault();
    if (!rescheduleModalAppointment) return;

    setActionLoadingId(rescheduleModalAppointment.id);
    try {
      const res = await fetch(`/api/appointments/${rescheduleModalAppointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: new Date(newStartTime).toISOString(),
          endTime: new Date(newEndTime).toISOString(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to reschedule');
        return;
      }

      setRescheduleModalAppointment(null);
      reloadAppointments();
    } catch {
      alert('Network error rescheduling appointment');
    } finally {
      setActionLoadingId(null);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'SCHEDULED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-950 text-sky-300 border border-sky-800">Scheduled</span>;
      case 'CHECKED_IN':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800">Checked In</span>;
      case 'IN_PROGRESS':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800">In Consultation</span>;
      case 'COMPLETED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">Completed</span>;
      case 'CANCELLED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-300 border border-rose-800">Cancelled</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300">{status}</span>;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Appointments Management</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Schedule visits, track patient flow, and manage doctor consultation bookings.
          </p>
        </div>
        <Link
          href="/dashboard/appointments/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Schedule Appointment
        </Link>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="filterDate" className="sr-only">Filter Date</label>
            <input
              id="filterDate"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-xs text-white"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {['ALL', 'SCHEDULED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  selectedStatus === st
                    ? 'bg-teal-500 text-slate-950 font-bold'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-750'
                }`}
              >
                {st === 'ALL' ? 'All Status' : st.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {selectedDate && (
          <button
            onClick={() => setSelectedDate('')}
            className="text-xs text-slate-400 hover:text-slate-200 underline"
          >
            Clear Date Filter
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs">
          {error}
        </div>
      )}

      {/* Appointment List / Table */}
      <div className="rounded-xl bg-slate-900/40 border border-slate-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-3 border-teal-500/30 border-t-teal-400 rounded-full animate-spin mb-3" />
            <span className="text-xs text-slate-400">Loading appointments...</span>
          </div>
        ) : appointments.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-white">No appointments found</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No bookings match the selected date and status filters. Book a new appointment to populate the schedule.
            </p>
            <div className="pt-2">
              <Link
                href="/dashboard/appointments/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition"
              >
                Schedule Appointment
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date &amp; Time</th>
                  <th className="px-4 py-3 font-semibold">Patient</th>
                  <th className="px-4 py-3 font-semibold">Doctor / Practitioner</th>
                  <th className="px-4 py-3 font-semibold">Reason</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {appointments.map((apt) => {
                  const isActionLoading = actionLoadingId === apt.id;
                  const start = new Date(apt.startTime);
                  const end = new Date(apt.endTime);

                  return (
                    <tr key={apt.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="font-semibold text-white">
                          {start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <div className="text-slate-400 font-mono text-[11px] mt-0.5">
                          {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/dashboard/patients/${apt.patient.id}`}
                          className="font-semibold text-white hover:text-teal-400 transition"
                        >
                          {apt.patient.name}
                        </Link>
                        <div className="text-slate-500 font-mono text-[11px]">
                          MRN: {apt.patient.mrn} {apt.patient.phone ? `• ${apt.patient.phone}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-300">
                        {apt.doctor ? (
                          <span className="font-medium text-teal-300">Dr. {apt.doctor.name}</span>
                        ) : (
                          <span className="text-slate-500 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-300 max-w-xs truncate">
                        {apt.reason || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {getStatusBadge(apt.status)}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap space-x-1.5">
                        {/* Status transition fast actions */}
                        {apt.status === 'SCHEDULED' && (
                          <>
                            <button
                              disabled={isActionLoading}
                              onClick={() => handleStatusUpdate(apt.id, 'CHECKED_IN')}
                              className="px-2.5 py-1 rounded bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-[11px] font-semibold transition"
                            >
                              Check In
                            </button>
                            <button
                              disabled={isActionLoading}
                              onClick={() => {
                                setRescheduleModalAppointment(apt);
                                setNewStartTime(new Date(apt.startTime).toISOString().slice(0, 16));
                                setNewEndTime(new Date(apt.endTime).toISOString().slice(0, 16));
                              }}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 text-[11px] transition"
                            >
                              Reschedule
                            </button>
                            <button
                              disabled={isActionLoading}
                              onClick={() => {
                                setReminderOutcome(null);
                                setReminderModalAppointment(apt);
                              }}
                              className="px-2 py-1 rounded bg-sky-950/40 hover:bg-sky-900/60 text-sky-300 text-[11px] border border-sky-800/40 transition"
                              title="Send reminder to patient"
                            >
                              Remind
                            </button>
                            <button
                              disabled={isActionLoading}
                              onClick={() => setCancelModalId(apt.id)}
                              className="px-2 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-[11px] border border-rose-800/40 transition"
                            >
                              Cancel
                            </button>
                          </>
                        )}

                        {apt.status === 'CHECKED_IN' && (
                          <>
                            <button
                              disabled={isActionLoading}
                              onClick={() => handleStatusUpdate(apt.id, 'IN_PROGRESS')}
                              className="px-2.5 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 text-[11px] font-semibold transition"
                            >
                              Start Visit
                            </button>
                            <button
                              disabled={isActionLoading}
                              onClick={() => setCancelModalId(apt.id)}
                              className="px-2 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 text-[11px] border border-rose-800/40 transition"
                            >
                              Cancel
                            </button>
                          </>
                        )}

                        {apt.status === 'IN_PROGRESS' && (
                          <button
                            disabled={isActionLoading}
                            onClick={() => handleStatusUpdate(apt.id, 'COMPLETED')}
                            className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold transition"
                          >
                            Complete Visit
                          </button>
                        )}

                        {(apt.status === 'COMPLETED' || apt.status === 'CANCELLED') && (
                          <span className="text-[11px] text-slate-500 italic">Finished</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cancel Modal */}
      {cancelModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
            <h3 className="font-bold text-white text-base">Cancel Appointment</h3>
            <p className="text-xs text-slate-400">
              Please specify the cancellation reason for administrative records.
            </p>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Patient requested cancellation / Doctor rescheduled"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 focus:border-rose-500 text-xs text-white"
            />
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  setCancelModalId(null);
                  setCancelReason('');
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Go Back
              </button>
              <button
                onClick={() => handleStatusUpdate(cancelModalId, 'CANCELLED', cancelReason)}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleModalAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <form
            onSubmit={handleReschedule}
            className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4"
          >
            <h3 className="font-bold text-white text-base">Reschedule Appointment</h3>
            <p className="text-xs text-slate-400">
              Patient: <span className="text-white font-semibold">{rescheduleModalAppointment.patient.name}</span>
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  New Start Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={newStartTime}
                  onChange={(e) => setNewStartTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  New End Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={newEndTime}
                  onChange={(e) => setNewEndTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setRescheduleModalAppointment(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 transition"
              >
                Save Reschedule
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reminder Modal (Phase 9.4 Front-Desk Manual Action) */}
      {reminderModalAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <form
            onSubmit={handleSendReminder}
            className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Send Appointment Reminder</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Send an SMS or WhatsApp reminder directly to the patient.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReminderModalAppointment(null)}
                className="text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* Outcome Notice */}
            {reminderOutcome && (
              <div
                className={`p-3 rounded-xl border text-xs ${
                  reminderOutcome.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                    : reminderOutcome.type === 'info'
                    ? 'bg-blue-950/40 border-blue-800 text-blue-200'
                    : reminderOutcome.type === 'warning'
                    ? 'bg-amber-950/40 border-amber-800 text-amber-200'
                    : 'bg-red-950/40 border-red-800 text-red-200'
                }`}
              >
                {reminderOutcome.message}
              </div>
            )}

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-850 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Patient:</span>
                  <span className="font-semibold text-white">
                    {reminderModalAppointment.patient.name} ({reminderModalAppointment.patient.mrn})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone:</span>
                  <span className="font-mono text-slate-300">
                    {reminderModalAppointment.patient.phone || 'No phone recorded'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Appointment Time:</span>
                  <span className="text-teal-300">
                    {new Date(reminderModalAppointment.startTime).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </span>
                </div>
                {reminderModalAppointment.doctor && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Doctor:</span>
                    <span>Dr. {reminderModalAppointment.doctor.name}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Preferred Channel
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`p-2.5 rounded-lg border text-center cursor-pointer transition ${
                      reminderChannel === 'WHATSAPP'
                        ? 'bg-emerald-950/50 border-emerald-500 text-emerald-200 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reminderChannel"
                      value="WHATSAPP"
                      checked={reminderChannel === 'WHATSAPP'}
                      onChange={() => setReminderChannel('WHATSAPP')}
                      className="sr-only"
                    />
                    WhatsApp
                  </label>
                  <label
                    className={`p-2.5 rounded-lg border text-center cursor-pointer transition ${
                      reminderChannel === 'SMS'
                        ? 'bg-sky-950/50 border-sky-500 text-sky-200 font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reminderChannel"
                      value="SMS"
                      checked={reminderChannel === 'SMS'}
                      onChange={() => setReminderChannel('SMS')}
                      className="sr-only"
                    />
                    SMS
                  </label>
                </div>
              </div>

              <div className="text-[11px] text-slate-500">
                Patient consent is verified prior to dispatch. Messages sent are subject to clinic rate limits (max 3/hr per patient).
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setReminderModalAppointment(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={reminderSending || !reminderModalAppointment.patient.phone}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 flex items-center gap-1.5 shadow-md shadow-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {reminderSending && <div className="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />}
                {reminderSending ? 'Sending...' : 'Send Reminder'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
