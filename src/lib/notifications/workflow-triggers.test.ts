import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  triggerWorkflowNotification,
  notifyAppointmentBooked,
  notifyAppointmentRescheduled,
  notifyAppointmentCancelled,
  notifyPrescriptionReady,
  notifyPaymentReceipt,
} from './workflow-triggers';
import * as serviceModule from './service';
import type { PrismaClient } from '@prisma/client';

describe('Workflow Notification Triggers Unit Tests (workflow-triggers.ts)', () => {
  let mockDb: {
    patient: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    clinicNotificationSetting: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    mockDb = {
      patient: {
        findFirst: vi.fn(),
      },
      clinicNotificationSetting: {
        findUnique: vi.fn(),
      },
    };
  });

  describe('1. Patient Verification & Consent Resolution', () => {
    it('returns dispatched: false when patient is not found or has no phone', async () => {
      mockDb.patient.findFirst.mockResolvedValue(null);

      const result = await triggerWorkflowNotification({
        clinicId: 'clinic-1',
        patientId: 'patient-unknown',
        eventType: 'APPOINTMENT_BOOKED',
        appointmentId: 'apt-1',
        db: mockDb as unknown as PrismaClient,
      });

      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('PATIENT_OR_PHONE_NOT_FOUND');
    });

    it('returns dispatched: false when patient has neither SMS nor WhatsApp consent', async () => {
      mockDb.patient.findFirst.mockResolvedValue({
        id: 'patient-1',
        phone: '+919876543210',
        smsConsent: false,
        whatsappConsent: false,
      });
      mockDb.clinicNotificationSetting.findUnique.mockResolvedValue(null);

      const result = await triggerWorkflowNotification({
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        eventType: 'APPOINTMENT_BOOKED',
        appointmentId: 'apt-1',
        db: mockDb as unknown as PrismaClient,
      });

      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('NO_CONSENT_OR_CHANNEL_DISABLED');
    });

    it('selects WHATSAPP when whatsappConsent is true', async () => {
      mockDb.patient.findFirst.mockResolvedValue({
        id: 'patient-1',
        phone: '+919876543210',
        smsConsent: false,
        whatsappConsent: true,
      });
      mockDb.clinicNotificationSetting.findUnique.mockResolvedValue({
        whatsappEnabled: true,
        smsEnabled: true,
        appointmentAlerts: true,
      });

      const spy = vi
        .spyOn(serviceModule, 'dispatchPatientNotification')
        .mockResolvedValue({
          success: true,
          notificationId: 'notif-1',
          status: 'SENT',
          channel: 'WHATSAPP',
          recipientPhone: '+919876543210',
        });

      const result = await triggerWorkflowNotification({
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        eventType: 'APPOINTMENT_BOOKED',
        appointmentId: 'apt-1',
        db: mockDb as unknown as PrismaClient,
      });

      expect(result.dispatched).toBe(true);
      expect(result.channel).toBe('WHATSAPP');
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'WHATSAPP',
          eventType: 'APPOINTMENT_BOOKED',
        }),
        expect.anything()
      );
    });

    it('selects SMS when only smsConsent is true', async () => {
      mockDb.patient.findFirst.mockResolvedValue({
        id: 'patient-1',
        phone: '+919876543210',
        smsConsent: true,
        whatsappConsent: false,
      });
      mockDb.clinicNotificationSetting.findUnique.mockResolvedValue({
        whatsappEnabled: true,
        smsEnabled: true,
        appointmentAlerts: true,
      });

      const spy = vi
        .spyOn(serviceModule, 'dispatchPatientNotification')
        .mockResolvedValue({
          success: true,
          notificationId: 'notif-2',
          status: 'SENT',
          channel: 'SMS',
          recipientPhone: '+919876543210',
        });

      const result = await triggerWorkflowNotification({
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        eventType: 'APPOINTMENT_BOOKED',
        appointmentId: 'apt-1',
        db: mockDb as unknown as PrismaClient,
      });

      expect(result.dispatched).toBe(true);
      expect(result.channel).toBe('SMS');
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'SMS',
        }),
        expect.anything()
      );
    });

    it('falls back to SMS if WHATSAPP is disabled in clinic settings even if patient consented', async () => {
      mockDb.patient.findFirst.mockResolvedValue({
        id: 'patient-1',
        phone: '+919876543210',
        smsConsent: true,
        whatsappConsent: true,
      });
      mockDb.clinicNotificationSetting.findUnique.mockResolvedValue({
        whatsappEnabled: false, // clinic disabled WhatsApp
        smsEnabled: true,
        appointmentAlerts: true,
      });

      const spy = vi
        .spyOn(serviceModule, 'dispatchPatientNotification')
        .mockResolvedValue({
          success: true,
          notificationId: 'notif-3',
          status: 'SENT',
          channel: 'SMS',
          recipientPhone: '+919876543210',
        });

      const result = await triggerWorkflowNotification({
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        eventType: 'APPOINTMENT_BOOKED',
        appointmentId: 'apt-1',
        db: mockDb as unknown as PrismaClient,
      });

      expect(result.dispatched).toBe(true);
      expect(result.channel).toBe('SMS');
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'SMS',
        }),
        expect.anything()
      );
    });
  });

  describe('2. Clinic Alert Category Settings Enforcement', () => {
    it('suppresses appointment alerts when clinic appointmentAlerts is false', async () => {
      mockDb.patient.findFirst.mockResolvedValue({
        id: 'patient-1',
        phone: '+919876543210',
        smsConsent: true,
        whatsappConsent: true,
      });
      mockDb.clinicNotificationSetting.findUnique.mockResolvedValue({
        appointmentAlerts: false, // Toggled off!
        prescriptionAlerts: true,
        billingAlerts: true,
        smsEnabled: true,
        whatsappEnabled: true,
      });

      const spy = vi.spyOn(serviceModule, 'dispatchPatientNotification');

      const result = await notifyAppointmentBooked({
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        appointmentId: 'apt-1',
        db: mockDb as unknown as PrismaClient,
      });

      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('APPOINTMENT_ALERTS_DISABLED');
      expect(spy).not.toHaveBeenCalled();
    });

    it('suppresses prescription alerts when clinic prescriptionAlerts is false', async () => {
      mockDb.patient.findFirst.mockResolvedValue({
        id: 'patient-1',
        phone: '+919876543210',
        smsConsent: true,
        whatsappConsent: true,
      });
      mockDb.clinicNotificationSetting.findUnique.mockResolvedValue({
        appointmentAlerts: true,
        prescriptionAlerts: false, // Toggled off!
        billingAlerts: true,
        smsEnabled: true,
        whatsappEnabled: true,
      });

      const spy = vi.spyOn(serviceModule, 'dispatchPatientNotification');

      const result = await notifyPrescriptionReady({
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        prescriptionId: 'rx-1',
        db: mockDb as unknown as PrismaClient,
      });

      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('PRESCRIPTION_ALERTS_DISABLED');
      expect(spy).not.toHaveBeenCalled();
    });

    it('suppresses billing alerts when clinic billingAlerts is false', async () => {
      mockDb.patient.findFirst.mockResolvedValue({
        id: 'patient-1',
        phone: '+919876543210',
        smsConsent: true,
        whatsappConsent: true,
      });
      mockDb.clinicNotificationSetting.findUnique.mockResolvedValue({
        appointmentAlerts: true,
        prescriptionAlerts: true,
        billingAlerts: false, // Toggled off!
        smsEnabled: true,
        whatsappEnabled: true,
      });

      const spy = vi.spyOn(serviceModule, 'dispatchPatientNotification');

      const result = await notifyPaymentReceipt({
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        paymentId: 'pay-1',
        invoiceId: 'inv-1',
        db: mockDb as unknown as PrismaClient,
      });

      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('BILLING_ALERTS_DISABLED');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('3. Duplicate Suppression & Rate Limiting Handling', () => {
    it('catches and safely handles DUPLICATE_SUPPRESSED without throwing', async () => {
      mockDb.patient.findFirst.mockResolvedValue({
        id: 'patient-1',
        phone: '+919876543210',
        smsConsent: true,
      });
      mockDb.clinicNotificationSetting.findUnique.mockResolvedValue({
        appointmentAlerts: true,
        smsEnabled: true,
      });

      vi.spyOn(serviceModule, 'dispatchPatientNotification').mockRejectedValue(
        new serviceModule.NotificationServiceError(
          'Notification suppressed: identical notification already dispatched within the last 5 minutes',
          429,
          'DUPLICATE_SUPPRESSED'
        )
      );

      const result = await notifyAppointmentRescheduled({
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        appointmentId: 'apt-1',
        db: mockDb as unknown as PrismaClient,
      });

      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('DUPLICATE_SUPPRESSED');
    });

    it('catches and safely handles PATIENT_RATE_LIMIT_EXCEEDED without throwing', async () => {
      mockDb.patient.findFirst.mockResolvedValue({
        id: 'patient-1',
        phone: '+919876543210',
        smsConsent: true,
      });
      mockDb.clinicNotificationSetting.findUnique.mockResolvedValue({
        appointmentAlerts: true,
        smsEnabled: true,
      });

      vi.spyOn(serviceModule, 'dispatchPatientNotification').mockRejectedValue(
        new serviceModule.NotificationServiceError(
          'Hourly rate limit exceeded: maximum 3 notifications allowed per patient per hour',
          429,
          'PATIENT_RATE_LIMIT_EXCEEDED'
        )
      );

      const result = await notifyAppointmentCancelled({
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        appointmentId: 'apt-1',
        db: mockDb as unknown as PrismaClient,
      });

      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('PATIENT_RATE_LIMIT_EXCEEDED');
    });
  });

  describe('4. Provider Failures & AUDIT_LOG_FAILED Resilience', () => {
    it('does not claim delivery when provider reports failure and returns dispatched: false', async () => {
      mockDb.patient.findFirst.mockResolvedValue({
        id: 'patient-1',
        phone: '+919876543210',
        smsConsent: true,
      });
      mockDb.clinicNotificationSetting.findUnique.mockResolvedValue({
        appointmentAlerts: true,
        smsEnabled: true,
      });

      vi.spyOn(serviceModule, 'dispatchPatientNotification').mockResolvedValue({
        success: false,
        notificationId: 'notif-failed-1',
        status: 'FAILED',
        error: 'Provider dispatch failed: upstream carrier timeout',
        recipientPhone: '+919876543210',
        channel: 'SMS',
      });

      const result = await notifyAppointmentBooked({
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        appointmentId: 'apt-1',
        db: mockDb as unknown as PrismaClient,
      });

      expect(result.dispatched).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('upstream carrier timeout');
    });

    it('catches AUDIT_LOG_FAILED and preserves caller safety without bubbling an unhandled error', async () => {
      mockDb.patient.findFirst.mockResolvedValue({
        id: 'patient-1',
        phone: '+919876543210',
        whatsappConsent: true,
      });
      mockDb.clinicNotificationSetting.findUnique.mockResolvedValue({
        billingAlerts: true,
        whatsappEnabled: true,
      });

      vi.spyOn(serviceModule, 'dispatchPatientNotification').mockRejectedValue(
        new serviceModule.NotificationServiceError(
          'Notification was processed but audit log persistence failed',
          500,
          'AUDIT_LOG_FAILED'
        )
      );

      const result = await notifyPaymentReceipt({
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        paymentId: 'pay-1',
        invoiceId: 'inv-1',
        db: mockDb as unknown as PrismaClient,
      });

      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('AUDIT_LOG_FAILED');
    });

    it('catches arbitrary uncaught exceptions in trigger workflow safely', async () => {
      mockDb.patient.findFirst.mockRejectedValue(new Error('PostgreSQL connection dropped'));

      const result = await notifyAppointmentBooked({
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        appointmentId: 'apt-1',
        db: mockDb as unknown as PrismaClient,
      });

      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('TRIGGER_ERROR');
      expect(result.error).toContain('PostgreSQL connection dropped');
    });
  });
});
