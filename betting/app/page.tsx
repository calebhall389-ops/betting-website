import Link from 'next/link';
import { TrendingUp, Target, BarChart2, ListChecks, ArrowRight, Trophy } from 'lucide-react';
import PickCard from '@/components/pick-card';
import { mockPicks } from '@/lib/mock-data';
import { computeStats } from '@/lib/utils';

export default function HomePage() {
  const stats = computeStats(mockPicks);
  const featuredPicks = mockPicks.slice(0, 3);

  const statCards = [
    { label: 'Win Rate', value: `${stats.winRate.toFixed(1)}%`, sub: `${stats.wins}W - ${stats.losses}L`, color: 'text-emerald-400' },
    { label: 'Total Profit', value: `${stats.totalProfit > 0 ? '+' : ''}${stats.totalProfit.toFixed(1)}u`, sub: 'All-time units', color: stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'ROI', value: `${stats.roi > 0 ? '+' : ''}${stats.roi.toFixed(1)}%`, sub: 'Return on investment', color: stats.roi >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Total Picks', value: stats.totalPicks.toString(), sub: `${stats.pending} pending`, color: 'text-white' },
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      <section className="relative overflow-hidden border-b border-slate-800">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/30 via-slate-950 to-slate-950" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400 font-medium mb-6">
              <Trophy size={12} />
              Professional Sports Analysis
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight leading-none mb-5">
              Bet Smarter,<br />
              <span className="text-emerald-400">Win More.</span>
            </h1>
            <p className="text-lg text-slate-400 leading-relaxed mb-8 max-w-xl">
              Expert picks, sharp player props, real-time odds, and comprehensive bet tracking — all in one place.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/picks"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/25"
              >
                View Today&apos;s Picks
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/odds"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
              >
                Live Odds
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(({ label, value, sub, color }) => (
            <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">{label}</p>
              <p className={`text-2xl md:text-3xl font-black ${color}`}>{value}</p>
              <p className="text-xs text-slate-600 mt-1">{sub}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">Recent Picks</h2>
            <p className="text-sm text-slate-500 mt-0.5">Latest expert analysis</p>
          </div>
          <Link
            href="/picks"
            className="inline-flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
          >
            View all <ArrowRight size={14} />
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {featuredPicks.map((pick) => (
            <PickCard key={pick.id} pick={pick} />
          ))}
        </div>
      </section>

      <section className="border-t border-slate-800 bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-xl font-bold text-white mb-8 text-center">Everything You Need</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Target, title: 'Expert Picks', desc: 'Curated picks with detailed analysis and confidence ratings across all major sports.', href: '/picks' },
              { icon: TrendingUp, title: 'Player Props', desc: 'Daily player prop recommendations with over/under lines and sharp angles.', href: '/props' },
              { icon: BarChart2, title: 'Live Odds', desc: 'Up-to-date spreads, moneylines, and totals across NFL, NBA, MLB, NHL and more.', href: '/odds' },
              { icon: ListChecks, title: 'Bet Tracker', desc: 'Track every wager, monitor your ROI, and analyze your betting performance.', href: '/tracker' },
            ].map(({ icon: Icon, title, desc, href }) => (
              <Link
                key={href}
                href={href}
                className="group rounded-xl border border-slate-800 bg-slate-900 p-6 hover:border-emerald-500/30 hover:bg-slate-800/50 transition-all duration-200"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-4 group-hover:bg-emerald-500/20 transition-colors">
                  <Icon size={18} className="text-emerald-400" />
                </div>
                <h3 className="text-sm font-bold text-white mb-2">{title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
