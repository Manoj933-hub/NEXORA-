import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  acquireNotificationRateLimit,
  setRateLimitAdapter,
  resetRateLimitAdapter,
  MemoryRateLimitAdapter,
  MAX_PATIENT_DISPATCHES_PER_HOUR,
  MAX_CLINIC_DISPATCHES_PER_HOUR,
} from './rate-limiter';

describe('Notification Rate Limiter Suite', () => {
  let memoryAdapter: MemoryRateLimitAdapter;

  beforeEach(() => {
    memoryAdapter = new MemoryRateLimitAdapter();
    setRateLimitAdapter(memoryAdapter);
  });

  afterEach(() => {
    resetRateLimitAdapter();
  });

  it('allows dispatches within the patient and clinic limits', async () => {
    const params = {
      clinicId: 'clinic-1',
      recipientPhone: '+919876543210',
      eventType: 'APPOINTMENT_BOOKED',
      resourceId: 'apt-1',
    };

    const res1 = await acquireNotificationRateLimit(params);
    expect(res1.allowed).toBe(true);
    expect(res1.patientRemaining).toBe(2);
    expect(res1.clinicRemaining).toBe(99);
  });

  it('enforces maximum 3 dispatches per patient phone per hour', async () => {
    const baseParams = {
      clinicId: 'clinic-1',
      recipientPhone: '+919876543210',
      eventType: 'APPOINTMENT_BOOKED',
    };

    // 1st dispatch
    const r1 = await acquireNotificationRateLimit({ ...baseParams, resourceId: 'apt-1' });
    expect(r1.allowed).toBe(true);

    // 2nd dispatch
    const r2 = await acquireNotificationRateLimit({ ...baseParams, resourceId: 'apt-2' });
    expect(r2.allowed).toBe(true);

    // 3rd dispatch
    const r3 = await acquireNotificationRateLimit({ ...baseParams, resourceId: 'apt-3' });
    expect(r3.allowed).toBe(true);
    expect(r3.patientRemaining).toBe(0);

    // 4th dispatch should be rejected
    const r4 = await acquireNotificationRateLimit({ ...baseParams, resourceId: 'apt-4' });
    expect(r4.allowed).toBe(false);
    expect(r4.reason).toBe('PATIENT_LIMIT_EXCEEDED');
  });

  it('suppresses duplicate notifications within 5 minutes for identical events', async () => {
    const params = {
      clinicId: 'clinic-1',
      recipientPhone: '+919876543210',
      eventType: 'APPOINTMENT_BOOKED',
      resourceId: 'apt-1',
    };

    const first = await acquireNotificationRateLimit(params);
    expect(first.allowed).toBe(true);

    // Attempting same event and resourceId immediately
    const duplicate = await acquireNotificationRateLimit(params);
    expect(duplicate.allowed).toBe(false);
    expect(duplicate.reason).toBe('DUPLICATE_SUPPRESSED');
  });

  it('allows different event types or resources for the same patient', async () => {
    const base = {
      clinicId: 'clinic-1',
      recipientPhone: '+919876543210',
    };

    const apt = await acquireNotificationRateLimit({
      ...base,
      eventType: 'APPOINTMENT_BOOKED',
      resourceId: 'apt-1',
    });
    expect(apt.allowed).toBe(true);

    const rx = await acquireNotificationRateLimit({
      ...base,
      eventType: 'PRESCRIPTION_READY',
      resourceId: 'rx-1',
    });
    expect(rx.allowed).toBe(true);
  });

  it('enforces maximum 100 dispatches per clinic per hour', async () => {
    const clinicId = 'busy-clinic';

    // Simulate 100 different patients
    for (let i = 1; i <= MAX_CLINIC_DISPATCHES_PER_HOUR; i++) {
      const res = await acquireNotificationRateLimit({
        clinicId,
        recipientPhone: `+919876543${String(i).padStart(3, '0')}`,
        eventType: 'APPOINTMENT_REMINDER',
        resourceId: `apt-${i}`,
      });
      expect(res.allowed).toBe(true);
    }

    // 101st patient dispatch from the same clinic must be rejected
    const overflow = await acquireNotificationRateLimit({
      clinicId,
      recipientPhone: '+919876543999',
      eventType: 'APPOINTMENT_REMINDER',
      resourceId: 'apt-101',
    });

    expect(overflow.allowed).toBe(false);
    expect(overflow.reason).toBe('CLINIC_LIMIT_EXCEEDED');
  });

  it('handles simulated concurrent requests atomically', async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      acquireNotificationRateLimit({
        clinicId: 'clinic-concurrent',
        recipientPhone: '+919888877777',
        eventType: 'APPOINTMENT_BOOKED',
        resourceId: `concurrent-${i}`,
      })
    );

    const results = await Promise.all(promises);
    const allowedCount = results.filter((r) => r.allowed).length;
    const rejectedCount = results.filter((r) => !r.allowed).length;

    // Exactly 3 allowed and 2 rejected
    expect(allowedCount).toBe(MAX_PATIENT_DISPATCHES_PER_HOUR);
    expect(rejectedCount).toBe(2);
  });

  it('rolls back preceding counters when clinic limit is exceeded so patient quota is preserved', async () => {
    const clinicId = 'full-clinic';
    const patientPhone = '+919999988888';

    // Max out clinic dispatches
    for (let i = 1; i <= MAX_CLINIC_DISPATCHES_PER_HOUR; i++) {
      await acquireNotificationRateLimit({
        clinicId,
        recipientPhone: `+919870000${String(i).padStart(3, '0')}`,
        eventType: 'APPOINTMENT_REMINDER',
        resourceId: `seed-${i}`,
      });
    }

    // Attempt dispatch for our test patient - fails due to clinic limit
    const rejected = await acquireNotificationRateLimit({
      clinicId,
      recipientPhone: patientPhone,
      eventType: 'APPOINTMENT_BOOKED',
      resourceId: 'apt-fail',
    });
    expect(rejected.allowed).toBe(false);
    expect(rejected.reason).toBe('CLINIC_LIMIT_EXCEEDED');

    // Patient sends via another clinic that is not full - patient quota was NOT burned
    const otherClinicRes = await acquireNotificationRateLimit({
      clinicId: 'open-clinic',
      recipientPhone: patientPhone,
      eventType: 'APPOINTMENT_BOOKED',
      resourceId: 'apt-success',
    });
    expect(otherClinicRes.allowed).toBe(true);
    expect(otherClinicRes.patientRemaining).toBe(2); // Still has 2 remaining, because the failed clinic attempt rolled back!
  });
});

