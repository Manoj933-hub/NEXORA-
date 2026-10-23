import { describe, it, expect, beforeEach } from 'vitest';
import { MockNotificationProvider, defaultMockProvider } from './mock-provider';
import {
  getNotificationProvider,
  setNotificationProvider,
  resetNotificationProvider,
} from './provider';

describe('Notification Provider & Mock Adapter Suite', () => {
  let mockProvider: MockNotificationProvider;

  beforeEach(() => {
    mockProvider = new MockNotificationProvider();
    mockProvider.clear();
    resetNotificationProvider();
  });

  describe('MockNotificationProvider', () => {
    it('dispatches a message successfully and records it in memory', async () => {
      const result = await mockProvider.send({
        to: '+919876543210',
        message: 'Dear Rahul, appointment confirmed.',
        channel: 'SMS',
        eventType: 'APPOINTMENT_BOOKED',
        clinicId: 'clinic-123',
        metadata: { appointmentId: 'apt-456' },
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('SENT');
      expect(result.providerMessageId).toBeDefined();
      expect(result.providerMessageId).toMatch(/^mock_msg_/);

      const sent = mockProvider.getSentMessages();
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('+919876543210');
      expect(sent[0].channel).toBe('SMS');
      expect(sent[0].clinicId).toBe('clinic-123');
      expect(sent[0].metadata?.appointmentId).toBe('apt-456');
    });

    it('filters messages by recipient phone', async () => {
      await mockProvider.send({
        to: '+919876543210',
        message: 'Message for Rahul',
        channel: 'SMS',
        eventType: 'APPOINTMENT_BOOKED',
        clinicId: 'clinic-1',
      });

      await mockProvider.send({
        to: '+9779841234567',
        message: 'Message for Sita',
        channel: 'WHATSAPP',
        eventType: 'PRESCRIPTION_READY',
        clinicId: 'clinic-1',
      });

      const rahulMessages = mockProvider.getSentMessagesForRecipient('+919876543210');
      expect(rahulMessages).toHaveLength(1);
      expect(rahulMessages[0].to).toBe('+919876543210');

      const sitaMessages = mockProvider.getSentMessagesForRecipient('+9779841234567');
      expect(sitaMessages).toHaveLength(1);
      expect(sitaMessages[0].channel).toBe('WHATSAPP');
    });

    it('simulates provider failures when instructed', async () => {
      mockProvider.setSimulateFailure(true, 'Network gateway unreachable');

      const result = await mockProvider.send({
        to: '+919876543210',
        message: 'Test message',
        channel: 'SMS',
        eventType: 'GENERAL_ANNOUNCEMENT',
        clinicId: 'clinic-1',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('Network gateway unreachable');
      expect(mockProvider.getSentMessages()).toHaveLength(0);
    });

    it('clears in-memory history', async () => {
      await mockProvider.send({
        to: '+919876543210',
        message: 'Test',
        channel: 'SMS',
        eventType: 'GENERAL_ANNOUNCEMENT',
        clinicId: 'clinic-1',
      });

      expect(mockProvider.getSentMessages()).toHaveLength(1);
      mockProvider.clear();
      expect(mockProvider.getSentMessages()).toHaveLength(0);
    });
  });

  describe('Provider Factory & Registry', () => {
    it('defaults to defaultMockProvider', () => {
      expect(getNotificationProvider()).toBe(defaultMockProvider);
      expect(getNotificationProvider().name).toBe('MOCK');
    });

    it('allows overriding provider for testing', () => {
      const customMock = new MockNotificationProvider();
      setNotificationProvider(customMock);
      expect(getNotificationProvider()).toBe(customMock);

      resetNotificationProvider();
      expect(getNotificationProvider()).toBe(defaultMockProvider);
    });
  });
});
