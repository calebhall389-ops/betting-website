import Link from 'next/link';
import { ArrowRight, Target, TrendingUp, BarChart3, Trophy } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#020817] text-white">
      {/* HERO SECTION */}
      <section className="relative overflow-hidden border-b border-white/10">
        {/* Background */}
        <div className="absolute inset-0">
          <div
            className="h-full w-full bg-cover bg-center opacity-25"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1606167668584-78701c57f13d?auto=format&fit=crop&w=1600&q=80')",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#020817]/70 via-[#020817]/85 to-[#020817]" />
        </div>

        {/* Content */}
        <div className="relative mx-auto max-w-7xl px-6 py-24 md:px-8 md:py-32">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-1.5 text-sm font-medium text-emerald-300">
              Sharp picks. Best odds. Tracked results.
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-white md:text-6xl">
              SharpEdge
            </h1>

            <p className="mt-5 max-w-2xl text-base text-slate-300 md:text-xl">
              Find sharp picks, compare the best available odds, and track your results
              in one clean sportsbook dashboard.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/picks"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
              >
                View Today&apos;s Picks
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>

              <Link
                href="/odds"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Best Odds
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* QUICK ACCESS */}
      <section className="mx-auto max-w-7xl px-6 py-12 md:px-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white">Quick Access</h2>
          <p className="mt-2 text-sm text-slate-400">
            Jump straight to the tools you use most.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/picks"
            className="group rounded-2xl border border-white/10 bg-[#06101f] p-6 transition hover:border-emerald-400/30 hover:bg-[#0a1628]"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
              <Target className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">Picks</h3>
            <p className="mt-2 text-sm text-slate-400">
              View today&apos;s sharpest betting opportunities.
            </p>
            <span className="mt-5 inline-flex items-center text-sm font-medium text-emerald-300">
              Open Picks
              <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" />
            </span>
          </Link>

          <Link
            href="/props"
            className="group rounded-2xl border border-white/10 bg-[#06101f] p-6 transition hover:border-emerald-400/30 hover:bg-[#0a1628]"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
              <TrendingUp className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">Props</h3>
            <p className="mt-2 text-sm text-slate-400">
              Check player prop opportunities and value spots.
            </p>
            <span className="mt-5 inline-flex items-center text-sm font-medium text-emerald-300">
              Open Props
              <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" />
            </span>
          </Link>

          <Link
            href="/odds"
            className="group rounded-2xl border border-white/10 bg-[#06101f] p-6 transition hover:border-emerald-400/30 hover:bg-[#0a1628]"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
              <BarChart3 className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">Odds</h3>
            <p className="mt-2 text-sm text-slate-400">
              Compare lines and find the best available prices.
            </p>
            <span className="mt-5 inline-flex items-center text-sm font-medium text-emerald-300">
              Open Odds
              <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" />
            </span>
          </Link>

          <Link
            href="/results"
            className="group rounded-2xl border border-white/10 bg-[#06101f] p-6 transition hover:border-emerald-400/30 hover:bg-[#0a1628]"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
              <Trophy className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">Results</h3>
            <p className="mt-2 text-sm text-slate-400">
              Review completed plays and track performance.
            </p>
            <span className="mt-5 inline-flex items-center text-sm font-medium text-emerald-300">
              Open Results
              <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-1" />
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}
