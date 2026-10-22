'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './sidebar';
import { Header } from './header';
import type { ClinicRole } from '@/lib/auth/permissions';

interface ClinicData {
  id: string;
  name: string;
  slug: string;
  country: string;
  currency: string;
  role: ClinicRole | string;
}

interface UserData {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
}

interface AuthMeResponse {
  user: UserData;
  activeClinic: ClinicData | null;
  clinics: ClinicData[];
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AuthMeResponse | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        if (!res.ok) {
          throw new Error('Failed to load session');
        }
        const json: AuthMeResponse = await res.json();

        // If user has no clinics, direct to onboarding
        if (!json.clinics || json.clinics.length === 0) {
          router.push('/onboarding');
          return;
        }

        setData(json);
      } catch (err) {
        console.error('Session load error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-10 h-10 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mb-4" />
        <div className="text-sm font-medium tracking-wide">Loading NEXORA Workspace...</div>
      </div>
    );
  }

  if (!data || !data.activeClinic) {
    return null;
  }

  // Find user's role in active clinic
  const activeMembership = data.clinics.find((c) => c.id === data.activeClinic?.id);
  const currentRole = activeMembership ? activeMembership.role : 'STAFF';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-shrink-0 print:hidden">
        <Sidebar
          clinicName={data.activeClinic.name}
          clinicCountry={data.activeClinic.country}
          role={currentRole}
        />
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden print:hidden">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-50 w-72 max-w-xs h-full bg-slate-900">
            <Sidebar
              clinicName={data.activeClinic.name}
              clinicCountry={data.activeClinic.country}
              role={currentRole}
              onCloseMobile={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main App Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto print:overflow-visible">
        <div className="print:hidden">
          <Header
            userName={data.user.name}
            userEmail={data.user.email}
            activeClinic={data.activeClinic}
            clinics={data.clinics}
            onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
          />
        </div>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full print:p-0 print:m-0 print:max-w-none">
          {children}
        </main>
      </div>
    </div>
  );
}
