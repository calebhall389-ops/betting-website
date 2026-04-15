'use client';

import { useState } from 'react';
import TrackerTable from '@/components/tracker-table';
import { mockTrackedBets } from '@/lib/mock-data';
import { computeTrackerStats, cn, formatOdds, calcProfit } from '@/lib/utils';
import { TrackedBet, Sport, BetType, PickResult } from '@/lib/types';
import { Plus, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const SPORTS: Sport[] = ['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'Soccer'];

export default function TrackerPage() {
  const [bets, setBets] = useState<TrackedBet[]>(mockTrackedBets);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    sport: 'NFL' as Sport,
    description: '',
    bet_type: 'spread' as BetType,
    odds: -110,
    units: 1.0,
    result: 'pending' as PickResult,
    date: new Date().toISOString().split('T')[0],
  });

  const stats = computeTrackerStats(bets);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const profit = form.result === 'win'
      ? calcProfit(form.units, form.odds)
      : form.result === 'loss'
      ? -form.units
      : 0;

    const newBet: TrackedBet = {
      id: Date.now().toString(),
      ...form,
      profit,
    };
    setBets((prev) => [newBet, ...prev]);
    setShowForm(false);
    setForm({ sport: 'NFL', description: '', bet_type: 'spread', odds: -110, units: 1.0, result: 'pending', date: new Date().toISOString().split('T')[0] });
  }

  const statItems = [
    { label: 'Win Rate', value: `${stats.winRate.toFixed(1)}%`, sub: `${stats.wins}W - ${stats.losses}L - ${stats.pushes}P`, color: 'text-emerald-400' },
    { label: 'Net Profit', value: `${stats.totalProfit >= 0 ? '+' : ''}${stats.totalProfit.toFixed(2)}u`, sub: 'Total units won/lost', color: stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'ROI', value: `${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}%`, sub: 'Return on investment', color: stats.roi >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Total Bets', value: stats.totalPicks.toString(), sub: `${stats.pending} pending`, color: 'text-white' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Bet Tracker</h1>
          <p className="text-sm text-slate-500 mt-1">Track your wagers and monitor performance</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
        >
          <Plus size={16} />
          Add Bet
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {statItems.map(({ label, value, sub, color }) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1.5">{label}</p>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            <p className="text-xs text-slate-600 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 mb-6">
          <h2 className="text-sm font-semibold text-white mb-4">Log New Bet</h2>
          <form onSubmit={handleSubmit} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Sport</label>
              <select
                value={form.sport}
                onChange={(e) => setForm({ ...form, sport: e.target.value as Sport })}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500"
              >
                {SPORTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-400 mb-1 block">Description</label>
              <input
                type="text"
                required
                placeholder="e.g. Chiefs -3 vs Ravens"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500 placeholder:text-slate-600"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Bet Type</label>
              <select
                value={form.bet_type}
                onChange={(e) => setForm({ ...form, bet_type: e.target.value as BetType })}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500"
              >
                {['spread', 'moneyline', 'over/under', 'prop', 'parlay'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Odds (American)</label>
              <input
                type="number"
                required
                value={form.odds}
                onChange={(e) => setForm({ ...form, odds: parseInt(e.target.value) })}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Units</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                required
                value={form.units}
                onChange={(e) => setForm({ ...form, units: parseFloat(e.target.value) })}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Result</label>
              <select
                value={form.result}
                onChange={(e) => setForm({ ...form, result: e.target.value as PickResult })}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500"
              >
                {['pending', 'win', 'loss', 'push'].map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Date</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4 flex gap-3 pt-2">
              <button
                type="submit"
                className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors"
              >
                Log Bet
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-5 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <TrackerTable bets={bets} />
    </div>
  );
}
