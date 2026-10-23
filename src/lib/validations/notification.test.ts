import { describe, it, expect } from 'vitest';
import {
  SendNotificationInputSchema,
  NotificationLogQuerySchema,
  UpdateClinicNotificationSettingsSchema,
  UpdatePatientConsentSchema,
} from './notification';

describe('Notification Validation Schemas Suite', () => {
  describe('SendNotificationInputSchema', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    it('validates a correct appointment notification payload', () => {
      const result = SendNotificationInputSchema.safeParse({
        patientId: validUuid,
        channel: 'SMS',
        eventType: 'APPOINTMENT_BOOKED',
        appointmentId: validUuid,
      });

      expect(result.success).toBe(true);
    });

    it('validates a correct prescription notification payload', () => {
      const result = SendNotificationInputSchema.safeParse({
        patientId: validUuid,
        channel: 'WHATSAPP',
        eventType: 'PRESCRIPTION_READY',
        prescriptionId: validUuid,
      });

      expect(result.success).toBe(true);
    });

    it('requires customMessage when eventType is GENERAL_ANNOUNCEMENT', () => {
      const missing = SendNotificationInputSchema.safeParse({
        patientId: validUuid,
        channel: 'SMS',
        eventType: 'GENERAL_ANNOUNCEMENT',
      });
      expect(missing.success).toBe(false);

      const withMsg = SendNotificationInputSchema.safeParse({
        patientId: validUuid,
        channel: 'SMS',
        eventType: 'GENERAL_ANNOUNCEMENT',
        customMessage: 'The clinic will be closed tomorrow for holiday.',
      });
      expect(withMsg.success).toBe(true);
    });

    it('rejects invalid UUIDs and channels', () => {
      const badUuid = SendNotificationInputSchema.safeParse({
        patientId: 'not-a-uuid',
        channel: 'SMS',
        eventType: 'APPOINTMENT_BOOKED',
      });
      expect(badUuid.success).toBe(false);

      const badChannel = SendNotificationInputSchema.safeParse({
        patientId: validUuid,
        channel: 'TELEGRAM',
        eventType: 'APPOINTMENT_BOOKED',
      });
      expect(badChannel.success).toBe(false);
    });
  });

  describe('NotificationLogQuerySchema', () => {
    it('applies default pagination values', () => {
      const result = NotificationLogQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it('validates custom query filters', () => {
      const result = NotificationLogQuerySchema.safeParse({
        channel: 'SMS',
        status: 'SENT',
        eventType: 'PAYMENT_RECEIPT',
        page: '2',
        limit: '50',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(50);
        expect(result.data.channel).toBe('SMS');
      }
    });

    it('rejects limits greater than 100 or less than 1', () => {
      expect(NotificationLogQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(NotificationLogQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    });
  });

  describe('UpdateClinicNotificationSettingsSchema', () => {
    it('validates updating channel and alert toggles', () => {
      const result = UpdateClinicNotificationSettingsSchema.safeParse({
        smsEnabled: true,
        whatsappEnabled: false,
        senderName: 'Apollo Care',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty payloads with no update fields', () => {
      const result = UpdateClinicNotificationSettingsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('validates senderName constraints (min 2, max 50 chars)', () => {
      expect(
        UpdateClinicNotificationSettingsSchema.safeParse({ senderName: 'A' }).success
      ).toBe(false);
      expect(
        UpdateClinicNotificationSettingsSchema.safeParse({ senderName: 'A'.repeat(51) }).success
      ).toBe(false);
    });
  });

  describe('UpdatePatientConsentSchema', () => {
    it('validates updating patient communication consent', () => {
      expect(UpdatePatientConsentSchema.safeParse({ smsConsent: true }).success).toBe(true);
      expect(UpdatePatientConsentSchema.safeParse({ whatsappConsent: true }).success).toBe(true);
      expect(
        UpdatePatientConsentSchema.safeParse({ smsConsent: true, whatsappConsent: false }).success
      ).toBe(true);
    });

    it('rejects empty consent update', () => {
      expect(UpdatePatientConsentSchema.safeParse({}).success).toBe(false);
    });
  });
});
