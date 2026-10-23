import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  CommunicationsView,
  type CommunicationsViewProps,
  type NotificationLogItem,
} from './page';

describe('Communications History UI & Front-Desk Manual Actions Component Tests', () => {
  const mockLogs: NotificationLogItem[] = [
    {
      id: 'log-001',
      channel: 'WHATSAPP',
      eventType: 'APPOINTMENT_BOOKED',
      recipientPhone: '+977-98****3456',
      messageBody: 'Hello Aarav, your appointment with Dr. Suresh at Apollo Health is confirmed for 24 Oct 2026, 10:00.',
      status: 'DELIVERED',
      providerMessageId: 'msg-wa-1001',
      providerName: 'MOCK_WHATSAPP',
      errorMessage: null,
      sentAt: '2026-10-23T04:00:00Z',
      deliveredAt: '2026-10-23T04:00:05Z',
      createdAt: '2026-10-23T04:00:00Z',
      patient: {
        id: 'pat-1',
        mrn: 'NXR-PAT-0001',
        name: 'Aarav Sharma',
        phone: '+977-9841233456',
      },
      createdBy: {
        id: 'usr-1',
        name: 'Kopila Staff',
        email: 'kopila@nexora.test',
      },
      appointmentId: 'apt-001',
      prescriptionId: null,
      invoiceId: null,
      paymentId: null,
    },
    {
      id: 'log-002',
      channel: 'SMS',
      eventType: 'PRESCRIPTION_READY',
      recipientPhone: '+977-98****7890',
      messageBody: 'Your prescription from Apollo Health is ready. View securely: https://nexora.health/view/[SECURE LINK]',
      status: 'SENT',
      providerMessageId: 'msg-sms-1002',
      providerName: 'MOCK_SMS',
      errorMessage: null,
      sentAt: '2026-10-23T05:00:00Z',
      deliveredAt: null,
      createdAt: '2026-10-23T05:00:00Z',
      patient: {
        id: 'pat-2',
        mrn: 'NXR-PAT-0002',
        name: 'Sunita Rai',
        phone: '+977-9841237890',
      },
      createdBy: {
        id: 'usr-2',
        name: 'Dr. Suresh Acharya',
        email: 'suresh@nexora.test',
      },
      appointmentId: null,
      prescriptionId: 'rx-001',
      invoiceId: null,
      paymentId: null,
    },
    {
      id: 'log-003',
      channel: 'WHATSAPP',
      eventType: 'PAYMENT_RECEIPT',
      recipientPhone: '+977-98****9999',
      messageBody: 'Thank you for your payment of NPR 1,500.00 to Apollo Health. View receipt: https://nexora.health/view/[SECURE LINK]',
      status: 'FAILED',
      providerMessageId: null,
      providerName: 'MOCK_WHATSAPP',
      errorMessage: 'Carrier unreachable or destination subscriber offline',
      sentAt: null,
      deliveredAt: null,
      createdAt: '2026-10-23T06:00:00Z',
      patient: {
        id: 'pat-3',
        mrn: 'NXR-PAT-0003',
        name: 'Bikram Thapa',
        phone: '+977-9841239999',
      },
      createdBy: null,
      appointmentId: null,
      prescriptionId: null,
      invoiceId: 'inv-001',
      paymentId: 'pay-001',
    },
  ];

  const defaultProps: CommunicationsViewProps = {
    logs: mockLogs,
    loading: false,
    error: null,
    page: 1,
    setPage: vi.fn(),
    limit: 20,
    setLimit: vi.fn(),
    totalPages: 3,
    totalCount: 45,
    selectedChannel: 'ALL',
    setSelectedChannel: vi.fn(),
    selectedStatus: 'ALL',
    setSelectedStatus: vi.fn(),
    selectedEventType: 'ALL',
    setSelectedEventType: vi.fn(),
    startDate: '',
    setStartDate: vi.fn(),
    endDate: '',
    setEndDate: vi.fn(),
    onResetFilters: vi.fn(),
    selectedLog: null,
    setSelectedLog: vi.fn(),
    showDispatchModal: false,
    setShowDispatchModal: vi.fn(),
    dispatchPatientId: '',
    setDispatchPatientId: vi.fn(),
    dispatchChannel: 'WHATSAPP',
    setDispatchChannel: vi.fn(),
    dispatchEventType: 'APPOINTMENT_REMINDER',
    setDispatchEventType: vi.fn(),
    dispatchAppointmentId: '',
    setDispatchAppointmentId: vi.fn(),
    dispatchMessage: '',
    setDispatchMessage: vi.fn(),
    dispatchSending: false,
    dispatchOutcome: null,
    setDispatchOutcome: vi.fn(),
    handleSendManualNotification: vi.fn(),
  };

  describe('1. Communications History Table & Privacy Safeguards', () => {
    it('renders notification table with masked phone numbers and friendly event titles', () => {
      const html = renderToString(React.createElement(CommunicationsView, defaultProps));

      expect(html).toContain('Patient Communications');
      expect(html).toContain('Aarav Sharma');
      expect(html).toContain('Sunita Rai');
      expect(html).toContain('Bikram Thapa');

      // Masked recipient phones
      expect(html).toContain('+977-98****3456');
      expect(html).toContain('+977-98****7890');
      expect(html).toContain('+977-98****9999');

      // Event titles
      expect(html).toContain('Booking Confirmation');
      expect(html).toContain('Prescription Ready');
      expect(html).toContain('Payment Receipt');

      // Channels
      expect(html).toContain('WhatsApp');
      expect(html).toContain('SMS');

      // Status Badges
      expect(html).toContain('DELIVERED');
      expect(html).toContain('SENT');
      expect(html).toContain('FAILED');
    });

    it('PHI & Token Privacy: never displays unredacted tokens, passwords, or diagnoses in logs table', () => {
      const html = renderToString(React.createElement(CommunicationsView, defaultProps));

      // Token redaction format
      expect(html).toContain('[SECURE LINK]');

      // Never contains 64-character raw hex or secure tokens
      expect(html).not.toMatch(/[a-f0-9]{64}/);
      expect(html).not.toContain('sec_tok_');

      // Never reveals unmasked full phone numbers in general log list
      expect(html).not.toContain('+977-9841233456');
      expect(html).not.toContain('+977-9841237890');
      expect(html).not.toContain('+977-9841239999');
    });

    it('renders empty state when no notification logs exist', () => {
      const html = renderToString(
        React.createElement(CommunicationsView, {
          ...defaultProps,
          logs: [],
          totalCount: 0,
        })
      );

      expect(html).toContain('No communications found matching the selected criteria.');
      expect(html).toContain('Total records found:');
    });

    it('renders loading spinner when loading is true', () => {
      const html = renderToString(
        React.createElement(CommunicationsView, {
          ...defaultProps,
          loading: true,
          logs: [],
        })
      );

      expect(html).toContain('Loading delivery audit logs...');
    });
  });

  describe('2. Detail Modal & Safe Error Details', () => {
    it('renders safe audit log detail modal for failed notification without exposing backend stack traces', () => {
      const html = renderToString(
        React.createElement(CommunicationsView, {
          ...defaultProps,
          selectedLog: mockLogs[2], // FAILED log
        })
      );

      expect(html).toContain('Notification Audit Record');
      expect(html).toContain('log-003');
      expect(html).toContain('Bikram Thapa');
      expect(html).toContain('+977-98****9999');
      expect(html).toContain('Carrier unreachable or destination subscriber offline');
      expect(html).not.toContain('stack');
      expect(html).not.toContain('database');
    });
  });

  describe('3. Front-Desk Manual Notification Modal & Truthful Outcomes', () => {
    it('renders manual notification modal when showDispatchModal is true', () => {
      const html = renderToString(
        React.createElement(CommunicationsView, {
          ...defaultProps,
          showDispatchModal: true,
        })
      );

      expect(html).toContain('Manual Patient Notification');
      expect(html).toContain('Patient ID');
      expect(html).toContain('Channel');
      expect(html).toContain('Notification Type');
      expect(html).toContain('Enforces patient consent and rate limits');
      expect(html).toContain('Dispatch Notification');
    });

    it('displays truthful feedback banner on successful manual dispatch', () => {
      const html = renderToString(
        React.createElement(CommunicationsView, {
          ...defaultProps,
          showDispatchModal: true,
          dispatchOutcome: {
            success: true,
            type: 'success',
            message: 'Appointment reminder dispatched successfully via WhatsApp.',
          },
        })
      );

      expect(html).toContain('Appointment reminder dispatched successfully via WhatsApp.');
    });

    it('displays truthful feedback banner on provider failure warning', () => {
      const html = renderToString(
        React.createElement(CommunicationsView, {
          ...defaultProps,
          showDispatchModal: true,
          dispatchOutcome: {
            success: false,
            type: 'warning',
            message: 'Notification logged, but delivery failed at provider: Carrier unreachable',
          },
        })
      );

      expect(html).toContain('Notification logged, but delivery failed at provider: Carrier unreachable');
    });

    it('displays truthful feedback banner when patient consent is missing', () => {
      const html = renderToString(
        React.createElement(CommunicationsView, {
          ...defaultProps,
          showDispatchModal: true,
          dispatchOutcome: {
            success: false,
            type: 'error',
            message: 'Consent denied: This patient has not provided opt-in consent for WHATSAPP messages.',
          },
        })
      );

      expect(html).toContain('Consent denied: This patient has not provided opt-in consent for WHATSAPP messages.');
    });

    it('displays truthful feedback banner when rate limit is exceeded', () => {
      const html = renderToString(
        React.createElement(CommunicationsView, {
          ...defaultProps,
          showDispatchModal: true,
          dispatchOutcome: {
            success: false,
            type: 'warning',
            message: 'Patient rate limit reached: Maximum 3 notifications permitted per patient per hour.',
          },
        })
      );

      expect(html).toContain('Patient rate limit reached: Maximum 3 notifications permitted per patient per hour.');
    });

    it('displays truthful feedback banner when duplicate notification is suppressed within 5 minutes', () => {
      const html = renderToString(
        React.createElement(CommunicationsView, {
          ...defaultProps,
          showDispatchModal: true,
          dispatchOutcome: {
            success: false,
            type: 'info',
            message: 'Duplicate suppressed: An identical notification was already sent to this patient within the last 5 minutes.',
          },
        })
      );

      expect(html).toContain('Duplicate suppressed: An identical notification was already sent to this patient within the last 5 minutes.');
    });
  });
});
