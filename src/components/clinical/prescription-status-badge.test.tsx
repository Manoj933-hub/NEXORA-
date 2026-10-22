import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PrescriptionStatusBadge } from './prescription-status-badge';
import { PrescriptionStatus } from '@/lib/clinical/prescription-lifecycle';

describe('PrescriptionStatusBadge Component', () => {
  const statuses: { status: PrescriptionStatus; expectedLabel: string; expectedColorClass: string }[] = [
    { status: 'ACTIVE', expectedLabel: 'Active', expectedColorClass: 'emerald' },
    { status: 'COMPLETED', expectedLabel: 'Completed', expectedColorClass: 'teal' },
    { status: 'DISCONTINUED', expectedLabel: 'Discontinued', expectedColorClass: 'amber' },
    { status: 'CANCELLED', expectedLabel: 'Cancelled', expectedColorClass: 'rose' },
  ];

  it('renders all four supported statuses with accessible human-readable text', () => {
    for (const { status, expectedLabel } of statuses) {
      const html = renderToString(
        React.createElement(PrescriptionStatusBadge, { status })
      );

      // Verify human-readable text is rendered explicitly (not relying on color alone)
      expect(html).toContain(`<span>${expectedLabel}</span>`);
      // Verify screen-reader accessibility
      expect(html).toContain(`aria-label="Prescription status: ${expectedLabel}"`);
      // Verify informative title tooltip
      expect(html).toContain(`title="Prescription Status: ${expectedLabel}`);
    }
  });

  it('applies distinct design token styling and indicator dot for each status', () => {
    for (const { status, expectedColorClass } of statuses) {
      const html = renderToString(
        React.createElement(PrescriptionStatusBadge, { status })
      );

      expect(html).toContain(`text-${expectedColorClass}-300`);
      expect(html).toContain(`bg-${expectedColorClass}-950/80`);
      expect(html).toContain(`border-${expectedColorClass}-700/60`);
      // Indicator dot with aria-hidden
      expect(html).toContain(`bg-${expectedColorClass}-400`);
      expect(html).toContain('aria-hidden="true"');
    }
  });

  it('supports size="sm" (default) and size="md" variants', () => {
    const smHtml = renderToString(
      React.createElement(PrescriptionStatusBadge, { status: 'ACTIVE' })
    );
    expect(smHtml).toContain('px-2 py-0.5 text-[10px]');

    const explicitSmHtml = renderToString(
      React.createElement(PrescriptionStatusBadge, { status: 'ACTIVE', size: 'sm' })
    );
    expect(explicitSmHtml).toContain('px-2 py-0.5 text-[10px]');

    const mdHtml = renderToString(
      React.createElement(PrescriptionStatusBadge, { status: 'ACTIVE', size: 'md' })
    );
    expect(mdHtml).toContain('px-2.5 py-1 text-xs');
  });

  it('applies custom className when provided', () => {
    const html = renderToString(
      React.createElement(PrescriptionStatusBadge, {
        status: 'ACTIVE',
        className: 'custom-prescription-badge-class shadow-sm',
      })
    );
    expect(html).toContain('custom-prescription-badge-class');
    expect(html).toContain('shadow-sm');
  });

  it('gracefully handles unknown status strings with fallback badge styles', () => {
    const html = renderToString(
      React.createElement(PrescriptionStatusBadge, {
        status: 'PENDING_APPROVAL',
      })
    );

    expect(html).toContain('<span>PENDING_APPROVAL</span>');
    expect(html).toContain('aria-label="Prescription status: PENDING_APPROVAL"');
    expect(html).toContain('bg-slate-800/80');
    expect(html).toContain('text-slate-300');
  });
});
