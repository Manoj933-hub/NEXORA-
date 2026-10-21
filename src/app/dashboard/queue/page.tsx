'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface QueueItem {
  id: string;
  startTime: string;
  endTime: string;
  status: 'SCHEDULED' | 'CHECKED_IN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  reason?: string | null;
  notes?: string | null;
  checkedInAt?: string | null;
  inProgressAt?: string | null;
  completedAt?: string | null;
  cancelledReason?: string | null;
  patient: {
    id: string;
    mrn: string;
    name: string;
    phone?: string | null;
    gender?: string | null;
    bloodGroup?: string | null;
  };
  doctor?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface QueueMetrics {
  total: number;
  scheduled: number;
  checkedIn: number;
  inProgress: number;
  completed: number;
  cancelled: number;
}

export default function ReceptionQueuePage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [metrics, setMetrics] = useState<QueueMetrics>({
    total: 0,
    scheduled: 0,
    checkedIn: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
  });
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const reloadQueue = useCallback(() => {
    setLoading(true);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const res = await fetch(`/api/queue?date=${selectedDate}`);
        if (!res.ok) throw new Error('Failed to load reception queue');
        const data = await res.json();
        if (!ignore) {
          setQueue(data.queue || []);
          setMetrics(data.metrics || {
            total: 0,
            scheduled: 0,
            checkedIn: 0,
            inProgress: 0,
            completed: 0,
            cancelled: 0,
          });
        }
      } catch (err) {
        console.error('Error fetching queue:', err);
        if (!ignore) {
          setError('Failed to load queue. Please try again.');
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
  }, [selectedDate, refreshTrigger]);

  async function handleStatusTransition(appointmentId: string, targetStatus: string) {
    setUpdatingId(appointmentId);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to update status');
        return;
      }
      reloadQueue();
    } catch {
      alert('Network error updating appointment status');
    } finally {
      setUpdatingId(null);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'SCHEDULED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-950 text-sky-300 border border-sky-800">Waiting Arrival</span>;
      case 'CHECKED_IN':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800 animate-pulse">In Waiting Lobby</span>;
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

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h1 className="text-2xl font-bold text-white tracking-tight">Patient Intake &amp; Reception Queue</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            Real-time lobby arrivals, check-in flow, and doctor consultation queue.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 focus:border-teal-500 text-xs text-white"
          />
          {!isToday && (
            <button
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-xs text-teal-300 transition"
            >
              Today
            </button>
          )}
          <Link
            href="/dashboard/appointments/new"
            className="px-3.5 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 transition"
          >
            + Add to Queue
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 text-center">
          <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">Total Booked</div>
          <div className="text-xl font-bold text-white mt-1">{metrics.total}</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 text-center">
          <div className="text-[10px] uppercase font-semibold text-sky-400 tracking-wider">Scheduled</div>
          <div className="text-xl font-bold text-sky-300 mt-1">{metrics.scheduled}</div>
        </div>
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 text-center">
          <div className="text-[10px] uppercase font-semibold text-amber-400 tracking-wider">In Lobby</div>
          <div className="text-xl font-bold text-amber-300 mt-1">{metrics.checkedIn}</div>
        </div>
        <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-800/60 text-center">
          <div className="text-[10px] uppercase font-semibold text-indigo-400 tracking-wider">In Doctor Room</div>
          <div className="text-xl font-bold text-indigo-300 mt-1">{metrics.inProgress}</div>
        </div>
        <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/60 text-center">
          <div className="text-[10px] uppercase font-semibold text-emerald-400 tracking-wider">Completed</div>
          <div className="text-xl font-bold text-emerald-300 mt-1">{metrics.completed}</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 text-center">
          <div className="text-[10px] uppercase font-semibold text-rose-400 tracking-wider">Cancelled</div>
          <div className="text-xl font-bold text-rose-300 mt-1">{metrics.cancelled}</div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs">
          {error}
        </div>
      )}

      {/* Live Queue Cards / List */}
      <div className="rounded-xl bg-slate-900/40 border border-slate-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-3 border-teal-500/30 border-t-teal-400 rounded-full animate-spin mb-3" />
            <span className="text-xs text-slate-400">Loading today&apos;s queue...</span>
          </div>
        ) : queue.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-white">No patients in queue for {selectedDate}</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              There are no scheduled arrivals on this date. Schedule an appointment to add patients to the intake queue.
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
          <div className="divide-y divide-slate-800/60">
            {queue.map((item, index) => {
              const start = new Date(item.startTime);
              const isUpdating = updatingId === item.id;

              return (
                <div
                  key={item.id}
                  className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${
                    item.status === 'CHECKED_IN'
                      ? 'bg-amber-950/10 border-l-4 border-l-amber-500'
                      : item.status === 'IN_PROGRESS'
                      ? 'bg-indigo-950/10 border-l-4 border-l-indigo-500'
                      : 'hover:bg-slate-800/30'
                  }`}
                >
                  {/* Left: Queue Position & Patient Info */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-200 font-mono font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                      #{index + 1}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/dashboard/patients/${item.patient.id}`}
                          className="font-bold text-white text-sm hover:text-teal-400 transition"
                        >
                          {item.patient.name}
                        </Link>
                        <span className="font-mono text-teal-300 text-xs font-medium">
                          ({item.patient.mrn})
                        </span>
                        {getStatusBadge(item.status)}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span>
                          Slot: <strong className="text-slate-200">{start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                        </span>
                        {item.doctor && (
                          <span>
                            • Doctor: <strong className="text-teal-300">Dr. {item.doctor.name}</strong>
                          </span>
                        )}
                        {item.patient.phone && (
                          <span>• Phone: {item.patient.phone}</span>
                        )}
                      </div>
                      {item.reason && (
                        <div className="text-xs text-slate-400 italic">
                          Chief complaint: &ldquo;{item.reason}&rdquo;
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Intake Action Buttons */}
                  <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                    {item.status === 'SCHEDULED' && (
                      <button
                        disabled={isUpdating}
                        onClick={() => handleStatusTransition(item.id, 'CHECKED_IN')}
                        className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 transition disabled:opacity-50"
                      >
                        {isUpdating ? 'Checking In...' : 'Patient Arrived (Check In)'}
                      </button>
                    )}

                    {item.status === 'CHECKED_IN' && (
                      <button
                        disabled={isUpdating}
                        onClick={() => handleStatusTransition(item.id, 'IN_PROGRESS')}
                        className="px-3.5 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition disabled:opacity-50"
                      >
                        {isUpdating ? 'Calling...' : 'Call to Doctor Room'}
                      </button>
                    )}

                    {item.status === 'IN_PROGRESS' && (
                      <button
                        disabled={isUpdating}
                        onClick={() => handleStatusTransition(item.id, 'COMPLETED')}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md shadow-emerald-500/20 transition disabled:opacity-50"
                      >
                        {isUpdating ? 'Updating...' : 'Finish Visit (Complete)'}
                      </button>
                    )}

                    {item.status === 'COMPLETED' && (
                      <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Visit Concluded
                      </span>
                    )}

                    {item.status === 'CANCELLED' && (
                      <span className="text-xs font-medium text-rose-400">
                        Cancelled
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
