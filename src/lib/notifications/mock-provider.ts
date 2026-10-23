import crypto from 'crypto';
import type {
  NotificationProvider,
  SendNotificationParams,
  NotificationDispatchResult,
} from './types';

export interface RecordedMockMessage extends SendNotificationParams {
  id: string;
  dispatchedAt: Date;
}

/**
 * In-memory Mock Notification Provider for local development and deterministic testing.
 * Never requires external API credentials and never consumes real SMS/WhatsApp credits.
 */
export class MockNotificationProvider implements NotificationProvider {
  public readonly name = 'MOCK';
  private sentMessages: RecordedMockMessage[] = [];
  private shouldSimulateFailure = false;
  private failureErrorMessage = 'Simulated provider gateway error';

  /**
   * Simulates message dispatch.
   */
  async send(params: SendNotificationParams): Promise<NotificationDispatchResult> {
    if (this.shouldSimulateFailure) {
      return {
        success: false,
        error: this.failureErrorMessage,
        status: 'FAILED',
      };
    }

    const messageId = `mock_msg_${crypto.randomUUID()}`;
    const recorded: RecordedMockMessage = {
      ...params,
      id: messageId,
      dispatchedAt: new Date(),
    };

    this.sentMessages.push(recorded);

    return {
      success: true,
      providerMessageId: messageId,
      status: 'SENT',
    };
  }

  /**
   * Retrieves all recorded messages dispatched through this mock instance.
   */
  getSentMessages(): readonly RecordedMockMessage[] {
    return [...this.sentMessages];
  }

  /**
   * Finds sent messages matching a specific recipient phone.
   */
  getSentMessagesForRecipient(phone: string): readonly RecordedMockMessage[] {
    return this.sentMessages.filter((m) => m.to === phone);
  }

  /**
   * Clears all recorded mock dispatches.
   */
  clear(): void {
    this.sentMessages = [];
    this.shouldSimulateFailure = false;
  }

  /**
   * Configures failure simulation for testing error handling and retry logic.
   */
  setSimulateFailure(fail: boolean, errorMessage = 'Simulated provider gateway error'): void {
    this.shouldSimulateFailure = fail;
    this.failureErrorMessage = errorMessage;
  }
}

/**
 * Default global singleton mock provider.
 */
export const defaultMockProvider = new MockNotificationProvider();
