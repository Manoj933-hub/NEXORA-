import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-teal-500 selection:text-slate-950">
      {/* Top Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center font-black text-slate-950 text-lg shadow-lg shadow-teal-500/20">
              N
            </div>
            <div>
              <span className="font-bold text-xl tracking-tight text-white">NEXORA</span>
              <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-800/60">
                Healthcare SaaS
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-medium hidden md:inline">
              Serving India & Nepal
            </span>
            <Link
              href="/login"
              className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 transition"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md shadow-teal-500/20 transition"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <section className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 flex flex-col items-center justify-center text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-slate-300 text-xs sm:text-sm font-medium mb-8">
          <span className="inline-block w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
          Task 003: Clinic Onboarding &amp; Dashboard Active
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-tight">
          Modern Clinical Platform for Independent Doctors & Clinics
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-2xl leading-relaxed">
          Engineered for fast, reliable outpatient workflows, digital records, and local compliance across India and Nepal.
        </p>

        {/* Primary CTA Buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-xl shadow-teal-500/25 transition"
          >
            Launch Clinic Dashboard
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-semibold text-sm transition"
          >
            Register New Clinic
          </Link>
        </div>

        {/* Stack Status Grid */}
        <div className="mt-14 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition">
            <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Framework</div>
            <div className="text-lg font-bold text-white mt-1">Next.js 16</div>
            <div className="text-xs text-teal-400 mt-2">App Router + TypeScript</div>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition">
            <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Database</div>
            <div className="text-lg font-bold text-white mt-1">PostgreSQL 17</div>
            <div className="text-xs text-teal-400 mt-2">Database: nexora (Local 5432)</div>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition">
            <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">ORM Layer</div>
            <div className="text-lg font-bold text-white mt-1">Prisma 6.19</div>
            <div className="text-xs text-teal-400 mt-2">Verified Client Singleton</div>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition">
            <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Security</div>
            <div className="text-lg font-bold text-white mt-1">Zero Leakage</div>
            <div className="text-xs text-teal-400 mt-2">Gitignored .env Protection</div>
          </div>
        </div>

        {/* Health Check CTA */}
        <div className="mt-10 p-6 w-full max-w-xl rounded-xl bg-slate-900/80 border border-teal-900/40 text-center">
          <p className="text-sm text-slate-300">
            Database connectivity and application uptime are verified dynamically via the health API.
          </p>
          <div className="mt-4">
            <Link
              href="/api/health"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-slate-800 text-teal-300 border border-slate-700 hover:border-teal-500 hover:bg-slate-750 transition-colors shadow-lg"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Inspect GET /api/health Response
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        NEXORA • Healthcare SaaS Foundation (India &amp; Nepal)
      </footer>
    </main>
  );
}
