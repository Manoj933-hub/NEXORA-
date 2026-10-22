import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RoleBadge } from './role-badge';
import { Sidebar } from './sidebar';
import { ClinicRole } from '@/lib/auth/permissions';

let currentPathname: string = '/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
}));

describe('Dashboard Components Unit Tests', () => {
  describe('RoleBadge', () => {
    it('renders OWNER role badge with emerald styles', () => {
      const html = renderToString(React.createElement(RoleBadge, { role: ClinicRole.OWNER }));
      expect(html).toContain('Clinic Owner');
      expect(html).toContain('emerald');
    });

    it('renders DOCTOR role badge with sky styles', () => {
      const html = renderToString(React.createElement(RoleBadge, { role: ClinicRole.DOCTOR }));
      expect(html).toContain('Doctor / Physician');
      expect(html).toContain('sky');
    });

    it('renders RECEPTIONIST role badge with amber styles', () => {
      const html = renderToString(React.createElement(RoleBadge, { role: ClinicRole.RECEPTIONIST }));
      expect(html).toContain('Reception Desk');
      expect(html).toContain('amber');
    });

    it('renders STAFF role badge with slate styles', () => {
      const html = renderToString(React.createElement(RoleBadge, { role: ClinicRole.STAFF }));
      expect(html).toContain('Support Staff');
      expect(html).toContain('slate');
    });
  });

  describe('Sidebar Navigation', () => {
    it('renders all administrative items for OWNER', () => {
      currentPathname = '/dashboard';
      const html = renderToString(
        React.createElement(Sidebar, {
          clinicName: 'Test Medical Clinic',
          clinicCountry: 'NP',
          role: ClinicRole.OWNER,
        })
      );

      expect(html).toContain('Test Medical Clinic');
      expect(html).toContain('🇳🇵 NP');
      expect(html).toContain('Clinic Profile');
      expect(html).toContain('Clinical Records');
      expect(html).toContain('Prescriptions');
      expect(html).toContain('Patient Intake');
      expect(html).toContain('Staff &amp; Members');
    });

    it('disables administrative settings for STAFF role', () => {
      currentPathname = '/dashboard';
      const html = renderToString(
        React.createElement(Sidebar, {
          clinicName: 'Staff Clinic View',
          clinicCountry: 'IN',
          role: ClinicRole.STAFF,
        })
      );

      expect(html).toContain('Staff Clinic View');
      expect(html).toContain('cursor-not-allowed');
      expect(html).toContain('Owner / Admin');
    });

    it('renders active Prescriptions link pointing to /dashboard/prescriptions for authorized clinical roles', () => {
      currentPathname = '/dashboard';
      const authorizedRoles = [ClinicRole.OWNER, ClinicRole.ADMIN, ClinicRole.DOCTOR];

      for (const role of authorizedRoles) {
        const html = renderToString(
          React.createElement(Sidebar, {
            clinicName: 'Apollo Care',
            clinicCountry: 'IN',
            role,
          })
        );

        // Verify link points to /dashboard/prescriptions
        expect(html).toContain('href="/dashboard/prescriptions"');
        expect(html).toContain('<span>Prescriptions</span>');
      }
    });

    it('disables Prescriptions item for roles lacking clinical:records:read permission', () => {
      currentPathname = '/dashboard';
      const unauthorizedRoles = [ClinicRole.STAFF, ClinicRole.RECEPTIONIST];

      for (const role of unauthorizedRoles) {
        const html = renderToString(
          React.createElement(Sidebar, {
            clinicName: 'Apollo Care',
            clinicCountry: 'IN',
            role,
          })
        );

        // Verify it is not rendered as an active Link targeting /dashboard/prescriptions
        expect(html).not.toContain('href="/dashboard/prescriptions"');
        // Verify it shows disabled styling with cursor-not-allowed and appropriate title
        expect(html).toContain('cursor-not-allowed');
        expect(html).toContain('Prescriptions');
        expect(html).toContain(`Requires permission not held by your current role (${role})`);
      }
    });

    it('highlights Prescriptions nav item when active path is /dashboard/prescriptions', () => {
      currentPathname = '/dashboard/prescriptions';
      const html = renderToString(
        React.createElement(Sidebar, {
          clinicName: 'City Hospital',
          clinicCountry: 'IN',
          role: ClinicRole.DOCTOR,
        })
      );
      // Verify Prescriptions link has active styling classes
      expect(html).toMatch(/class="[^"]*bg-teal-500\/15 text-teal-300 border border-teal-500\/30[^"]*" href="\/dashboard\/prescriptions"/);
      // Verify Overview is NOT active
      expect(html).not.toMatch(/class="[^"]*bg-teal-500\/15 text-teal-300[^"]*" href="\/dashboard"/);
    });

    it('highlights Prescriptions nav item when active path is a prescription detail route', () => {
      currentPathname = '/dashboard/prescriptions/rx-sample-456';
      const html = renderToString(
        React.createElement(Sidebar, {
          clinicName: 'City Hospital',
          clinicCountry: 'IN',
          role: ClinicRole.DOCTOR,
        })
      );

      // Verify Prescriptions link has active styling classes on detail page
      expect(html).toMatch(/class="[^"]*bg-teal-500\/15 text-teal-300 border border-teal-500\/30[^"]*" href="\/dashboard\/prescriptions"/);
      // Verify Overview is NOT active
      expect(html).not.toMatch(/class="[^"]*bg-teal-500\/15 text-teal-300[^"]*" href="\/dashboard"/);
      // Verify Clinical Records is NOT active
      expect(html).not.toMatch(/class="[^"]*bg-teal-500\/15 text-teal-300[^"]*" href="\/dashboard\/records"/);
    });

    it('preserves all existing navigation entries and quick links intact', () => {
      currentPathname = '/dashboard';
      const html = renderToString(
        React.createElement(Sidebar, {
          clinicName: 'City Hospital',
          clinicCountry: 'IN',
          role: ClinicRole.OWNER,
        })
      );

      // Core sections
      expect(html).toContain('Overview');
      expect(html).toContain('Patients');
      expect(html).toContain('Appointments');
      expect(html).toContain('Patient Intake &amp; Queue');
      expect(html).toContain('Clinical Records');
      expect(html).toContain('Prescriptions');
      expect(html).toContain('Clinic Profile');
      expect(html).toContain('Staff &amp; Members');

      // Quick links
      expect(html).toContain('Switch Clinic');
      expect(html).toContain('Add Another Clinic');
      expect(html).toContain('href="/select-clinic"');
      expect(html).toContain('href="/onboarding"');
    });
  });
});
