'use client';

import { useState } from 'react';
import PickCard from '@/components/pick-card';
import { mockPicks } from '@/lib/mock-data';
import { computeStats } from '@/lib/utils';
import { Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sport, BetType, PickResult } from '@/lib/types';

const SPORTS: (Sport | 'All')[] = ['All', 'NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB'];
const BET_TYPES: (BetType | 'All')[] = ['All', 'spread', 'moneyline', 'over/under', 'prop', 'parlay'];
const RESULTS: (PickResult | 'All')[] = ['All', 'pending', 'win', 'loss', 'push'];

export default function PicksPage() {
  const [sport, setSport] = useState<Sport | 'All'>('All');
  const [betType, setBetType] = useState<BetType | 'All'>('All');
  const [result, setResult] = useState<PickResult | 'All'>('All');

  const filtered = mockPicks.filter((p) => {
    if (sport !== 'All' && p.sport !== sport) return false;
    if (betType !== 'All' && p.bet_type !== betType) return false;
    if (result !== 'All' && p.result !== result) return false;
    return true;
  });

  const stats = computeStats(mockPicks);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Expert Picks</h1>
        <p className="text-sm text-slate-500 mt-1">
          {stats.wins}W - {stats.losses}L &nbsp;&middot;&nbsp; {stats.winRate.toFixed(1)}% Win Rate &nbsp;&middot;&nbsp;
          {stats.totalProfit > 0 ? '+' : ''}{stats.totalProfit.toFixed(1)}u Profit
        </p>
      </div>

      <div className="mb-6 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mr-1">
            <Filter size={12} />
            Sport:
          </div>
          {SPORTS.map((s) => (
            <button
              key={s}
              onClick={() => setSport(s)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                sport === s
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white hover:bg-slate-700'
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mr-1">
            <Filter size={12} />
            Type:
          </div>
          {BET_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setBetType(t)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-all capitalize',
                betType === t
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white hover:bg-slate-700'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mr-1">
            <Filter size={12} />
            Result:
          </div>
          {RESULTS.map((r) => (
            <button
              key={r}
              onClick={() => setResult(r)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-all capitalize',
                result === r
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white hover:bg-slate-700'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-16 text-center">
          <p className="text-slate-500 text-sm">No picks match your filters.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((pick) => (
            <PickCard key={pick.id} pick={pick} />
          ))}
        </div>
      )}
    </div>
  );
}
