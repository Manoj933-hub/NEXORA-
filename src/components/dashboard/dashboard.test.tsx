import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RoleBadge } from './role-badge';
import { Sidebar } from './sidebar';
import { ClinicRole } from '@/lib/auth/permissions';

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
      expect(html).toContain('Patient Intake');
      expect(html).toContain('Staff &amp; Members');
    });

    it('disables administrative settings for STAFF role', () => {
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
  });
});
