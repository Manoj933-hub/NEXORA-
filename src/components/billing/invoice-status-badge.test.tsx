import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  InvoiceStatusBadge,
  getInvoiceStatusConfig,
  INVOICE_STATUS_CONFIGS,
} from './invoice-status-badge';

describe('InvoiceStatusBadge Component Tests', () => {
  it('defines distinct configurations for all 6 supported invoice statuses', () => {
    const statuses = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'REFUNDED'] as const;
    for (const status of statuses) {
      const config = INVOICE_STATUS_CONFIGS[status];
      expect(config).toBeDefined();
      expect(config.label).toBeTruthy();
      expect(config.badgeClasses.bg).toBeTruthy();
      expect(config.badgeClasses.text).toBeTruthy();
      expect(config.badgeClasses.dot).toBeTruthy();
    }
  });

  it('renders DRAFT status badge with slate styles', () => {
    const html = renderToString(React.createElement(InvoiceStatusBadge, { status: 'DRAFT' }));
    expect(html).toContain('Draft');
    expect(html).toContain('bg-slate-800/80');
    expect(html).toContain('text-slate-300');
    expect(html).toContain('aria-label="Invoice status: Draft"');
  });

  it('renders ISSUED status badge with sky styles', () => {
    const html = renderToString(React.createElement(InvoiceStatusBadge, { status: 'ISSUED' }));
    expect(html).toContain('Issued');
    expect(html).toContain('bg-sky-950/60');
    expect(html).toContain('text-sky-300');
  });

  it('renders PARTIALLY_PAID status badge with amber styles', () => {
    const html = renderToString(
      React.createElement(InvoiceStatusBadge, { status: 'PARTIALLY_PAID' })
    );
    expect(html).toContain('Partially Paid');
    expect(html).toContain('bg-amber-950/60');
    expect(html).toContain('text-amber-300');
  });

  it('renders PAID status badge with emerald styles', () => {
    const html = renderToString(React.createElement(InvoiceStatusBadge, { status: 'PAID' }));
    expect(html).toContain('Paid');
    expect(html).toContain('bg-emerald-950/60');
    expect(html).toContain('text-emerald-300');
  });

  it('renders VOID status badge with rose styles', () => {
    const html = renderToString(React.createElement(InvoiceStatusBadge, { status: 'VOID' }));
    expect(html).toContain('Void');
    expect(html).toContain('bg-rose-950/60');
    expect(html).toContain('text-rose-300');
  });

  it('renders REFUNDED status badge with purple styles', () => {
    const html = renderToString(React.createElement(InvoiceStatusBadge, { status: 'REFUNDED' }));
    expect(html).toContain('Refunded');
    expect(html).toContain('bg-purple-950/60');
    expect(html).toContain('text-purple-300');
  });

  it('handles lowercase or unknown status gracefully', () => {
    const lowerHtml = renderToString(React.createElement(InvoiceStatusBadge, { status: 'paid' }));
    expect(lowerHtml).toContain('Paid');

    const unknownConfig = getInvoiceStatusConfig('CUSTOM_STATE');
    expect(unknownConfig.label).toBe('CUSTOM_STATE');

    const unknownHtml = renderToString(
      React.createElement(InvoiceStatusBadge, { status: 'UNKNOWN_TEST' })
    );
    expect(unknownHtml).toContain('UNKNOWN_TEST');
  });

  it('supports size variants', () => {
    const smHtml = renderToString(
      React.createElement(InvoiceStatusBadge, { status: 'PAID', size: 'sm' })
    );
    expect(smHtml).toContain('text-[10px]');

    const mdHtml = renderToString(
      React.createElement(InvoiceStatusBadge, { status: 'PAID', size: 'md' })
    );
    expect(mdHtml).toContain('text-xs');
  });
});
