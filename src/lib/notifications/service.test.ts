import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  dispatchPatientNotification,
  NotificationServiceError,
} from './service';
import { setRateLimitAdapter, MemoryRateLimitAdapter, resetRateLimitAdapter } from './rate-limiter';
import { setNotificationProvider, resetNotificationProvider } from './provider';
import { MockNotificationProvider } from './mock-provider';

describe('Notification Dispatch Service Suite', () => {
  let mockProvider: MockNotificationProvider;
  let memoryRateLimit: MemoryRateLimitAdapter;

  beforeEach(() => {
    mockProvider = new MockNotificationProvider();
    mockProvider.clear();
    setNotificationProvider(mockProvider);

    memoryRateLimit = new MemoryRateLimitAdapter();
    setRateLimitAdapter(memoryRateLimit);
  });

  afterEach(() => {
    resetNotificationProvider();
    resetRateLimitAdapter();
    vi.restoreAllMocks();
  });

  const clinicId = 'clinic-alpha';
  const patientId = 'patient-001';

  const mockDbPatient = {
    id: patientId,
    clinicId,
    name: 'Rahul Sharma',
    phone: '+919876543210',
    mrn: 'NX-0042',
    smsConsent: true,
    whatsappConsent: true,
    isActive: true,
    clinic: {
      id: clinicId,
      name: 'Apollo Health',
      phone: '+911122334455',
      country: 'IN',
      currency: 'INR',
    },
  };

  const mockDbSettings = {
    id: 'setting-1',
    clinicId,
    smsEnabled: true,
    whatsappEnabled: true,
    appointmentAlerts: true,
    prescriptionAlerts: true,
    billingAlerts: true,
    senderName: 'Apollo Health',
  };

  const createMockPrisma = (overrides: Record<string, unknown> = {}) => {
    return {
      clinicNotificationSetting: {
        findUnique: vi.fn().mockResolvedValue(mockDbSettings),
      },
      patient: {
        findFirst: vi.fn().mockResolvedValue(mockDbPatient),
      },
      appointment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'apt-001',
          clinicId,
          patientId,
          startTime: new Date('2026-10-24T10:30:00Z'),
          doctor: { name: 'Dr. Aditi Sharma' },
        }),
      },
      prescription: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'rx-001',
          clinicId,
          patientId,
          doctor: { name: 'Dr. Verma' },
        }),
      },
      invoice: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'inv-001',
          clinicId,
          patientId,
          invoiceNumber: 'INV-2026-0042',
          totalAmount: { toString: () => '1500.00' },
          currency: 'INR',
          dueDate: new Date('2026-10-31T00:00:00Z'),
        }),
      },
      payment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'pay-001',
          clinicId,
          amount: { toString: () => '1500.00' },
          invoice: { invoiceNumber: 'INV-2026-0042', currency: 'INR', patientId: 'patient-001' },
        }),
      },
      secureDocumentLink: {
        create: vi.fn().mockResolvedValue({ id: 'link-001' }),
      },
      notificationLog: {
        create: vi.fn().mockImplementation((args) =>
          Promise.resolve({
            id: 'log-001',
            ...args.data,
            createdAt: new Date(),
          })
        ),
      },
      ...overrides,
    } as unknown as PrismaClient;
  };

  it('dispatches appointment booked SMS successfully when consent and channel enabled', async () => {
    const mockDb = createMockPrisma();

    const response = await dispatchPatientNotification(
      {
        clinicId,
        patientId,
        channel: 'SMS',
        eventType: 'APPOINTMENT_BOOKED',
        appointmentId: 'apt-001',
      },
      mockDb
    );

    expect(response.success).toBe(true);
    expect(response.status).toBe('SENT');
    expect(response.recipientPhone).toBe('+919876543210');
    expect(response.notificationId).toBe('log-001');

    const sent = mockProvider.getSentMessages();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('+919876543210');
    expect(sent[0].message).toContain('Apollo Health');
    expect(sent[0].message).toContain('NX-0042');
  });

  it('strictly rejects SMS dispatch when patient has not consented (Safeguard 1)', async () => {
    const mockDb = createMockPrisma({
      patient: {
        findFirst: vi.fn().mockResolvedValue({
          ...mockDbPatient,
          smsConsent: false, // Consent Denied!
        }),
      },
    });

    await expect(
      dispatchPatientNotification(
        {
          clinicId,
          patientId,
          channel: 'SMS',
          eventType: 'APPOINTMENT_BOOKED',
          appointmentId: 'apt-001',
        },
        mockDb
      )
    ).rejects.toThrowError(NotificationServiceError);

    expect(mockProvider.getSentMessages()).toHaveLength(0);
  });

  it('strictly rejects WhatsApp dispatch when patient has not consented (Safeguard 1)', async () => {
    const mockDb = createMockPrisma({
      patient: {
        findFirst: vi.fn().mockResolvedValue({
          ...mockDbPatient,
          whatsappConsent: false, // Consent Denied!
        }),
      },
    });

    await expect(
      dispatchPatientNotification(
        {
          clinicId,
          patientId,
          channel: 'WHATSAPP',
          eventType: 'PRESCRIPTION_READY',
          prescriptionId: 'rx-001',
        },
        mockDb
      )
    ).rejects.toThrowError(NotificationServiceError);

    expect(mockProvider.getSentMessages()).toHaveLength(0);
  });

  it('rejects dispatch when clinic channel is disabled in settings', async () => {
    const mockDb = createMockPrisma({
      clinicNotificationSetting: {
        findUnique: vi.fn().mockResolvedValue({
          ...mockDbSettings,
          smsEnabled: false, // SMS disabled by clinic owner
        }),
      },
    });

    await expect(
      dispatchPatientNotification(
        {
          clinicId,
          patientId,
          channel: 'SMS',
          eventType: 'APPOINTMENT_BOOKED',
          appointmentId: 'apt-001',
        },
        mockDb
      )
    ).rejects.toThrowError('SMS channel is currently disabled in clinic settings');
  });

  it('rejects dispatch when specific alert type is disabled in clinic settings', async () => {
    const mockDb = createMockPrisma({
      clinicNotificationSetting: {
        findUnique: vi.fn().mockResolvedValue({
          ...mockDbSettings,
          appointmentAlerts: false, // Appointments disabled
        }),
      },
    });

    await expect(
      dispatchPatientNotification(
        {
          clinicId,
          patientId,
          channel: 'SMS',
          eventType: 'APPOINTMENT_BOOKED',
          appointmentId: 'apt-001',
        },
        mockDb
      )
    ).rejects.toThrowError('Appointment notifications are disabled in clinic settings');
  });

  it('enforces tenant boundary: rejects patient belonging to another clinic', async () => {
    const mockDb = createMockPrisma({
      patient: {
        findFirst: vi.fn().mockResolvedValue(null), // Patient not found in this clinic
      },
    });

    await expect(
      dispatchPatientNotification(
        {
          clinicId: 'foreign-clinic',
          patientId,
          channel: 'SMS',
          eventType: 'APPOINTMENT_BOOKED',
          appointmentId: 'apt-001',
        },
        mockDb
      )
    ).rejects.toThrowError('Patient not found in the active clinic organization');
  });

  it('enforces cross-resource tenant boundary: rejects appointment not belonging to patient', async () => {
    const mockDb = createMockPrisma({
      appointment: {
        findFirst: vi.fn().mockResolvedValue(null), // Appointment mismatch
      },
    });

    await expect(
      dispatchPatientNotification(
        {
          clinicId,
          patientId,
          channel: 'SMS',
          eventType: 'APPOINTMENT_BOOKED',
          appointmentId: 'foreign-apt',
        },
        mockDb
      )
    ).rejects.toThrowError('Linked appointment not found or does not belong to this patient');
  });

  it('enforces rate limits and duplicate suppression', async () => {
    const mockDb = createMockPrisma();

    const params = {
      clinicId,
      patientId,
      channel: 'SMS' as const,
      eventType: 'APPOINTMENT_BOOKED' as const,
      appointmentId: 'apt-001',
    };

    // First attempt succeeds
    const res1 = await dispatchPatientNotification(params, mockDb);
    expect(res1.success).toBe(true);

    // Immediate second attempt triggers duplicate suppression (5-minute window)
    await expect(dispatchPatientNotification(params, mockDb)).rejects.toThrowError(
      'Notification suppressed: identical notification already dispatched'
    );
  });

  it('handles provider failures gracefully and logs FAILED status', async () => {
    mockProvider.setSimulateFailure(true, 'Telecom network timeout');
    const mockDb = createMockPrisma();

    const response = await dispatchPatientNotification(
      {
        clinicId,
        patientId,
        channel: 'SMS',
        eventType: 'APPOINTMENT_BOOKED',
        appointmentId: 'apt-001',
      },
      mockDb
    );

    expect(response.success).toBe(false);
    expect(response.status).toBe('FAILED');
    expect(response.error).toBe('Telecom network timeout');

    // Verify database log recorded failure
    expect(mockDb.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'Telecom network timeout',
        }),
      })
    );
  });

  it('never stores raw secure-link tokens in NotificationLog.messageBody while provider receives complete URL', async () => {
    const mockDb = createMockPrisma();

    const response = await dispatchPatientNotification(
      {
        clinicId,
        patientId,
        channel: 'SMS',
        eventType: 'PRESCRIPTION_READY',
        prescriptionId: 'rx-001',
      },
      mockDb
    );

    expect(response.success).toBe(true);

    // Provider receives the actual full URL with high-entropy token
    const sent = mockProvider.getSentMessages();
    expect(sent).toHaveLength(1);
    expect(sent[0].message).toMatch(/https:\/\/nexora\.health\/view\/[a-f0-9]{64}/);

    // Database audit log receives strictly REDACTED token URL
    expect(mockDb.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          messageBody: expect.stringContaining('/view/[PROTECTED_DOCUMENT_TOKEN]'),
        }),
      })
    );

    // Verify raw token is absent from saved log body
    const createCallData = (mockDb.notificationLog.create as unknown as { mock: { calls: Array<[{ data: { messageBody: string } }]> } }).mock.calls[0][0].data;
    expect(createCallData.messageBody).not.toMatch(/[a-f0-9]{64}/);
  });

  it('strictly rejects payment notification when payment belongs to another patient in same clinic', async () => {
    const mockDb = createMockPrisma({
      payment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'pay-002',
          clinicId,
          amount: { toString: () => '2000.00' },
          invoice: {
            invoiceNumber: 'INV-2026-9999',
            currency: 'INR',
            patientId: 'different-patient-999', // Different patient!
          },
        }),
      },
    });

    await expect(
      dispatchPatientNotification(
        {
          clinicId,
          patientId: 'patient-001',
          channel: 'SMS',
          eventType: 'PAYMENT_RECEIPT',
          paymentId: 'pay-002',
        },
        mockDb
      )
    ).rejects.toThrowError('Linked payment not found or does not belong to this patient');

    expect(mockProvider.getSentMessages()).toHaveLength(0);
  });

  it('strictly rejects payment notification when payment belongs to another clinic', async () => {
    const mockDb = createMockPrisma({
      payment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });

    await expect(
      dispatchPatientNotification(
        {
          clinicId,
          patientId: 'patient-001',
          channel: 'SMS',
          eventType: 'PAYMENT_RECEIPT',
          paymentId: 'foreign-pay-999',
        },
        mockDb
      )
    ).rejects.toThrowError('Linked payment not found or does not belong to this patient');

    expect(mockProvider.getSentMessages()).toHaveLength(0);
  });

  it('catches unexpected provider exceptions (transport crash) and safely persists FAILED log', async () => {
    vi.spyOn(mockProvider, 'send').mockRejectedValue(new Error('Gateway socket connection reset by peer'));
    const mockDb = createMockPrisma();

    const response = await dispatchPatientNotification(
      {
        clinicId,
        patientId,
        channel: 'SMS',
        eventType: 'APPOINTMENT_BOOKED',
        appointmentId: 'apt-001',
      },
      mockDb
    );

    expect(response.success).toBe(false);
    expect(response.status).toBe('FAILED');
    expect(response.error).toContain('Gateway socket connection reset');

    expect(mockDb.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: expect.stringContaining('Gateway socket connection reset'),
        }),
      })
    );
  });

  it('throws AUDIT_LOG_FAILED when database notification log persistence fails', async () => {
    const mockDb = createMockPrisma({
      notificationLog: {
        create: vi.fn().mockRejectedValue(new Error('PostgreSQL disk write error')),
      },
    });

    await expect(
      dispatchPatientNotification(
        {
          clinicId,
          patientId,
          channel: 'SMS',
          eventType: 'APPOINTMENT_BOOKED',
          appointmentId: 'apt-001',
        },
        mockDb
      )
    ).rejects.toThrowError('Notification was processed but audit log persistence failed');
  });
});

