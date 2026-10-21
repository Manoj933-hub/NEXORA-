import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import HomePage from './page';

describe('HomePage', () => {
  it('renders NEXORA branding, stack, and health check link', () => {
    const html = renderToString(React.createElement(HomePage));

    expect(html).toContain('NEXORA');
    expect(html).toContain('Healthcare SaaS');
    expect(html).toContain('India &amp; Nepal');
    expect(html).toContain('/api/health');
    expect(html).toContain('PostgreSQL 17');
    expect(html).toContain('Prisma 6.19');
  });
});
