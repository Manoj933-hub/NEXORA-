import type { NotificationProvider } from './types';
import { defaultMockProvider } from './mock-provider';

let activeProvider: NotificationProvider = defaultMockProvider;

/**
 * Returns the active notification provider instance.
 * Defaults to `defaultMockProvider` to guarantee zero-cost, secret-free local dev and testing.
 */
export function getNotificationProvider(): NotificationProvider {
  return activeProvider;
}

/**
 * Overrides the active notification provider (useful in automated test suites).
 */
export function setNotificationProvider(provider: NotificationProvider): void {
  activeProvider = provider;
}

/**
 * Resets the active notification provider back to the default mock provider.
 */
export function resetNotificationProvider(): void {
  activeProvider = defaultMockProvider;
}
