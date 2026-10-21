import React from 'react';
import type { Metadata } from 'next';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';

export const metadata: Metadata = {
  title: 'Dashboard | NEXORA Healthcare Platform',
  description: 'Clinical Operations and Multi-Tenant Clinic Management for NEXORA',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
