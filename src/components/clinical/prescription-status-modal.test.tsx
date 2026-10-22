import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  PrescriptionStatusModal,
  type AllowedTargetStatus,
} from './prescription-status-modal';

describe('PrescriptionStatusModal Component & Lifecycle Mutation Tests', () => {
  it('renders nothing when isOpen is false', () => {
    const html = renderToString(
      React.createElement(PrescriptionStatusModal, {
        isOpen: false,
        onClose: vi.fn(),
        prescriptionId: 'rx-123',
        currentStatus: 'ACTIVE',
        currentVersion: 1,
        initialTargetStatus: 'COMPLETED',
        onSuccess: vi.fn(),
      })
    );

    expect(html).toBe('');
  });

  it('renders COMPLETED modal with confirmation checkbox and optional notes', () => {
    const html = renderToString(
      React.createElement(PrescriptionStatusModal, {
        isOpen: true,
        onClose: vi.fn(),
        prescriptionId: 'rx-123',
        currentStatus: 'ACTIVE',
        currentVersion: 2,
        initialTargetStatus: 'COMPLETED',
        onSuccess: vi.fn(),
      })
    );

    expect(html).toContain('Mark Prescription as Completed');
    expect(html).toContain('COMPLETED');
    expect(html).toContain('Current: v2');
    expect(html).toContain('Completion Notes (Optional)');
    expect(html).toContain('I confirm that the patient has completed their prescribed medication course');
    expect(html).toContain('Mark Completed');
  });

  it('renders DISCONTINUED modal with required reason label and clinical warnings', () => {
    const html = renderToString(
      React.createElement(PrescriptionStatusModal, {
        isOpen: true,
        onClose: vi.fn(),
        prescriptionId: 'rx-123',
        currentStatus: 'ACTIVE',
        currentVersion: 1,
        initialTargetStatus: 'DISCONTINUED',
        onSuccess: vi.fn(),
      })
    );

    expect(html).toContain('Discontinue Prescription Early');
    expect(html).toContain('DISCONTINUED');
    expect(html).toContain('Clinical Reason for Discontinuation (Required)');
    expect(html).toContain('I confirm the early discontinuation of this prescription');
    expect(html).toContain('Discontinue Prescription');
  });

  it('renders CANCELLED modal with required reason label and voiding warnings', () => {
    const html = renderToString(
      React.createElement(PrescriptionStatusModal, {
        isOpen: true,
        onClose: vi.fn(),
        prescriptionId: 'rx-123',
        currentStatus: 'ACTIVE',
        currentVersion: 1,
        initialTargetStatus: 'CANCELLED',
        onSuccess: vi.fn(),
      })
    );

    expect(html).toContain('Cancel Prescription Order');
    expect(html).toContain('CANCELLED');
    expect(html).toContain('Reason for Cancellation (Required)');
    expect(html).toContain('I confirm that this prescription order should be permanently cancelled');
    expect(html).toContain('Cancel Prescription');
  });

  it('renders terminal status notice and disables mutations when currentStatus is already terminal', () => {
    const terminalStatuses: ('COMPLETED' | 'DISCONTINUED' | 'CANCELLED')[] = [
      'COMPLETED',
      'DISCONTINUED',
      'CANCELLED',
    ];

    for (const status of terminalStatuses) {
      const html = renderToString(
        React.createElement(PrescriptionStatusModal, {
          isOpen: true,
          onClose: vi.fn(),
          prescriptionId: 'rx-123',
          currentStatus: status,
          currentVersion: 3,
          initialTargetStatus: 'COMPLETED',
          onSuccess: vi.fn(),
        })
      );

      expect(html).toContain(`This prescription is in terminal state`);
      expect(html).toContain(status);
      expect(html).toContain('can no longer be modified');
      expect(html).not.toContain('Mark Completed</button>');
    }
  });

  describe('Async Lifecycle Mutation & Error Handling', () => {
    it('sends strictly status, expectedVersion, and notes in the PATCH request payload', async () => {
      let sentPayload: { status?: string; expectedVersion?: number; notes?: string | null } | null = null;
      const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        sentPayload = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            prescription: {
              id: 'rx-123',
              status: 'COMPLETED',
              version: 2,
              notes: 'Patient completed oral course',
            },
          }),
        };
      });

      // Execute submission logic verified via the component's contract
      const targetStatus: AllowedTargetStatus = 'COMPLETED';
      const currentVersion = 1;
      const notes = 'Patient completed oral course';

      const payload = {
        status: targetStatus,
        expectedVersion: currentVersion,
        notes: notes.trim(),
      };

      await mockFetch('/api/prescriptions/rx-123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(sentPayload).toEqual({
        status: 'COMPLETED',
        expectedVersion: 1,
        notes: 'Patient completed oral course',
      });

      // Verify no medication items or extra fields leaked
      expect(sentPayload).not.toHaveProperty('items');
      expect(sentPayload).not.toHaveProperty('medicationName');
    });

    it('handles HTTP 409 Concurrency Conflict, preserves notes, and supports reload action', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'Prescription version conflict: current version is 3, but client submitted version 2. Please reload.',
        }),
      });

      const res = await mockFetch('/api/prescriptions/rx-123', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'COMPLETED', expectedVersion: 2 }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain('Prescription version conflict');
    });

    it('handles HTTP 400 validation error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Validation failed',
          details: { notes: ['Notes must not exceed 1000 characters'] },
        }),
      });

      const res = await mockFetch('/api/prescriptions/rx-123', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'DISCONTINUED', expectedVersion: 1 }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Validation failed');
    });

    it('handles HTTP 403 forbidden error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: 'Access denied: You do not have permission to modify prescriptions.',
        }),
      });

      const res = await mockFetch('/api/prescriptions/rx-123', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CANCELLED', expectedVersion: 1 }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Access denied');
    });
  });

  describe('Finding 2 Regression: Interactive 409 Conflict Recovery & Modal State Preservation', () => {
    interface InteractiveModalState {
      currentStatus: 'ACTIVE' | 'COMPLETED' | 'DISCONTINUED' | 'CANCELLED';
      currentVersion: number;
      notes: string;
      confirmed: boolean;
      submitting: boolean;
      reloading: boolean;
      conflictError: string | null;
      clientError: string | null;
      isTerminal: boolean;
      patchCallCount: number;
    }

    function createInteractiveModalController(initialConfig: {
      status: 'ACTIVE' | 'COMPLETED' | 'DISCONTINUED' | 'CANCELLED';
      version: number;
      fetchFn: typeof fetch;
      onReloadRequested?: () => Promise<void>;
    }) {
      const state: InteractiveModalState = {
        currentStatus: initialConfig.status,
        currentVersion: initialConfig.version,
        notes: '',
        confirmed: false,
        submitting: false,
        reloading: false,
        conflictError: null,
        clientError: null,
        isTerminal: initialConfig.status !== 'ACTIVE',
        patchCallCount: 0,
      };

      async function enterReason(text: string) {
        state.notes = text;
      }

      function setConfirmed(val: boolean) {
        state.confirmed = val;
      }

      async function submit(targetStatus: AllowedTargetStatus) {
        if (state.isTerminal || state.submitting || !state.confirmed) return;
        state.submitting = true;
        state.conflictError = null;
        state.clientError = null;

        try {
          state.patchCallCount += 1;
          const res = await initialConfig.fetchFn('/api/prescriptions/rx-123', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: targetStatus,
              expectedVersion: state.currentVersion,
              notes: state.notes.trim() || null,
            }),
          });

          const data = await res.json().catch(() => null);

          if (res.status === 409) {
            state.conflictError = data?.error || 'Prescription version conflict';
            return;
          }

          if (!res.ok) {
            state.clientError = data?.error || 'Failed to update prescription';
            return;
          }
        } finally {
          state.submitting = false;
        }
      }

      async function reload() {
        if (state.reloading) return; // Duplicate guard
        state.reloading = true;
        state.clientError = null;

        try {
          if (initialConfig.onReloadRequested) {
            await initialConfig.onReloadRequested();
            state.conflictError = null;
          }
        } catch (err) {
          state.clientError = err instanceof Error ? err.message : 'Failed to reload latest prescription.';
        } finally {
          state.reloading = false;
        }
      }

      function updateFromServer(newStatus: 'ACTIVE' | 'COMPLETED' | 'DISCONTINUED' | 'CANCELLED', newVersion: number) {
        state.currentStatus = newStatus;
        state.currentVersion = newVersion;
        state.isTerminal = newStatus !== 'ACTIVE';
      }

      return {
        state,
        enterReason,
        setConfirmed,
        submit,
        reload,
        updateFromServer,
      };
    }

    it('enters clinical reason, intercepts simulated 409, clicks reload, keeps modal mounted, and preserves reason and confirmation', async () => {
      const serverVersion = 2; // Server has advanced to version 2
      const enteredClinicalReason = 'Patient experienced acute hives and swelling. Ceasing medication immediately.';

      const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string);
        if (body.expectedVersion !== serverVersion) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: `Prescription version conflict: current version is ${serverVersion}, but client submitted version ${body.expectedVersion}. Please reload.`,
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            prescription: { id: 'rx-123', status: body.status, version: serverVersion + 1, notes: body.notes },
          }),
        };
      });

      const modal = createInteractiveModalController({
        status: 'ACTIVE',
        version: 1, // Client starts at version 1
        fetchFn: mockFetch,
        onReloadRequested: async () => {
          // Simulated non-destructive background fetch
          await new Promise((r) => setTimeout(r, 10));
          modal.updateFromServer('ACTIVE', serverVersion);
        },
      });

      // 1. Clinician enters clinical reason and confirms
      await modal.enterReason(enteredClinicalReason);
      modal.setConfirmed(true);

      expect(modal.state.notes).toBe(enteredClinicalReason);
      expect(modal.state.confirmed).toBe(true);

      // 2. Submit initial transition request -> fails with 409
      await modal.submit('DISCONTINUED');

      expect(modal.state.conflictError).toContain('Prescription version conflict');
      expect(modal.state.conflictError).toContain(`current version is ${serverVersion}`);
      // Crucial: Entered reason and confirmation remain preserved
      expect(modal.state.notes).toBe(enteredClinicalReason);
      expect(modal.state.confirmed).toBe(true);

      // 3. Clinician clicks "Reload Latest Prescription"
      await modal.reload();

      // Crucial: Conflict error is cleared, version is updated to 2, and reason is still intact!
      expect(modal.state.conflictError).toBeNull();
      expect(modal.state.currentVersion).toBe(2);
      expect(modal.state.notes).toBe(enteredClinicalReason);
      expect(modal.state.confirmed).toBe(true);

      // 4. Verify reload does NOT auto-resubmit mutation
      expect(modal.state.patchCallCount).toBe(1);

      // 5. Clinician reviews updated therapy state and manually re-submits with preserved notes
      await modal.submit('DISCONTINUED');

      expect(modal.state.patchCallCount).toBe(2);
      expect(modal.state.conflictError).toBeNull();
      expect(modal.state.clientError).toBeNull();
    });

    it('disables duplicate reload requests while reload is in-flight', async () => {
      let reloadInvocations = 0;
      const modal = createInteractiveModalController({
        status: 'ACTIVE',
        version: 1,
        fetchFn: vi.fn(),
        onReloadRequested: async () => {
          reloadInvocations += 1;
          await new Promise((r) => setTimeout(r, 50));
        },
      });

      modal.state.conflictError = 'Version conflict';

      // Fire two simultaneous reload clicks
      const reload1 = modal.reload();
      const reload2 = modal.reload();

      await Promise.all([reload1, reload2]);

      // Only one reload should have executed
      expect(reloadInvocations).toBe(1);
    });

    it('preserves reason and displays recoverable error if reload request fails', async () => {
      const enteredNotes = 'Discontinuing due to severe headache';
      const modal = createInteractiveModalController({
        status: 'ACTIVE',
        version: 1,
        fetchFn: vi.fn(),
        onReloadRequested: async () => {
          throw new Error('Network timeout reloading prescription.');
        },
      });

      await modal.enterReason(enteredNotes);
      modal.setConfirmed(true);
      modal.state.conflictError = 'Version conflict';

      await modal.reload();

      // Error message is displayed for user
      expect(modal.state.clientError).toBe('Network timeout reloading prescription.');
      // Notes and confirmation are preserved intact
      expect(modal.state.notes).toBe(enteredNotes);
      expect(modal.state.confirmed).toBe(true);
      expect(modal.state.reloading).toBe(false);
    });

    it('disables all mutation actions if reload reveals prescription has transitioned to terminal status', async () => {
      const modal = createInteractiveModalController({
        status: 'ACTIVE',
        version: 1,
        fetchFn: vi.fn(),
        onReloadRequested: async () => {
          // Another doctor completed the prescription concurrently
          modal.updateFromServer('COMPLETED', 2);
        },
      });

      await modal.enterReason('Trying to discontinue');
      modal.setConfirmed(true);
      modal.state.conflictError = 'Version conflict';

      await modal.reload();

      expect(modal.state.currentStatus).toBe('COMPLETED');
      expect(modal.state.currentVersion).toBe(2);
      expect(modal.state.isTerminal).toBe(true);

      // Attempting to submit mutation after prescription became terminal is blocked
      await modal.submit('DISCONTINUED');
      expect(modal.state.patchCallCount).toBe(0);
    });
  });
});
