import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  ClinicNotificationSettingsView,
  type ClinicNotificationSettingsViewProps,
} from './page';
import { ClinicRole } from '@/lib/auth/permissions';

describe('Clinic Notification Settings Component Tests', () => {
  const defaultProps: ClinicNotificationSettingsViewProps = {
    loading: false,
    saving: false,
    clinicId: 'clinic-alpha-123',
    clinicName: 'Apollo Family Health',
    role: ClinicRole.OWNER,
    smsEnabled: true,
    setSmsEnabled: vi.fn(),
    whatsappEnabled: true,
    setWhatsappEnabled: vi.fn(),
    appointmentAlerts: true,
    setAppointmentAlerts: vi.fn(),
    prescriptionAlerts: true,
    setPrescriptionAlerts: vi.fn(),
    billingAlerts: true,
    setBillingAlerts: vi.fn(),
    senderName: 'Apollo Care',
    setSenderName: vi.fn(),
    error: null,
    successMessage: null,
    onSubmit: vi.fn(),
  };

  it('renders loading state when loading is true', () => {
    const html = renderToString(
      React.createElement(ClinicNotificationSettingsView, {
        ...defaultProps,
        loading: true,
      })
    );

    expect(html).toContain('Loading notification configuration...');
    expect(html).not.toContain('Save Notification Settings');
  });

  it('renders error state when error is present without a clinicId', () => {
    const html = renderToString(
      React.createElement(ClinicNotificationSettingsView, {
        ...defaultProps,
        clinicId: null,
        error: 'No active clinic found in your session.',
      })
    );

    expect(html).toContain('No active clinic found in your session.');
    expect(html).toContain('Return to Dashboard');
  });

  it('renders settings view with clinic name and alert sections for OWNER role', () => {
    const html = renderToString(
      React.createElement(ClinicNotificationSettingsView, defaultProps)
    );

    expect(html).toContain('Patient Notification Settings');
    expect(html).toContain('Apollo Family Health');
    expect(html).toContain('Outbound Delivery Channels');
    expect(html).toContain('Automated Workflow Alert Categories');
    expect(html).toContain('Sender Display Identity');
    expect(html).toContain('SMS Delivery');
    expect(html).toContain('WhatsApp Delivery');
    expect(html).toContain('Appointment Lifecycle Alerts');
    expect(html).toContain('Prescription Ready Alerts');
    expect(html).toContain('Billing &amp; Payment Alerts');
    expect(html).toContain('Save Notification Settings');
    // Ensure view-only notice is not shown for OWNER
    expect(html).not.toContain('View-only mode:');
  });

  it('enforces RBAC: renders view-only mode and disables inputs for STAFF role', () => {
    const html = renderToString(
      React.createElement(ClinicNotificationSettingsView, {
        ...defaultProps,
        role: ClinicRole.STAFF,
      })
    );

    expect(html).toContain('View-only mode:');
    expect(html).toContain('Only Clinic Owners and Administrators can modify alert toggles');
    expect(html).toContain('disabled=""');
    // Ensure Save button is hidden for non-admin
    expect(html).not.toContain('Save Notification Settings');
  });

  it('enforces RBAC: renders view-only mode and disables inputs for RECEPTIONIST role', () => {
    const html = renderToString(
      React.createElement(ClinicNotificationSettingsView, {
        ...defaultProps,
        role: ClinicRole.RECEPTIONIST,
      })
    );

    expect(html).toContain('View-only mode:');
    expect(html).not.toContain('Save Notification Settings');
  });

  it('displays success message when saving succeeds', () => {
    const html = renderToString(
      React.createElement(ClinicNotificationSettingsView, {
        ...defaultProps,
        successMessage: 'Clinic notification settings updated successfully.',
      })
    );

    expect(html).toContain('Clinic notification settings updated successfully.');
  });

  it('displays error banner when an update error occurs', () => {
    const html = renderToString(
      React.createElement(ClinicNotificationSettingsView, {
        ...defaultProps,
        error: 'Sender name exceeds maximum permitted length of 50 characters.',
      })
    );

    expect(html).toContain('Sender name exceeds maximum permitted length of 50 characters.');
  });

  it('displays saving spinner when saving is in progress', () => {
    const html = renderToString(
      React.createElement(ClinicNotificationSettingsView, {
        ...defaultProps,
        saving: true,
      })
    );

    expect(html).toContain('Saving Changes...');
  });

  it('verifies provider security architecture notice is displayed', () => {
    const html = renderToString(
      React.createElement(ClinicNotificationSettingsView, defaultProps)
    );

    expect(html).toContain('Security &amp; Provider Privacy Architecture');
    expect(html).toContain('Provider API keys, secret credentials, and carrier webhook tokens');
  });
});
