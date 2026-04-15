'use client';

import { useEffect, useMemo, useState } from 'react';
import PickCard from '@/components/pick-card';
import { mockPicks } from '@/lib/mock-data';
import { computeStats, cn } from '@/lib/utils';
import { Sport, BetType, PickResult, Pick } from '@/lib/types';

const SPORTS: (Sport | 'All')[] = ['All', 'NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB'];
const BET_TYPES: (BetType | 'All')[] = ['All', 'spread', 'moneyline', 'over/under', 'prop', 'parlay'];
const RESULTS: (PickResult | 'All')[] = ['All', 'pending', 'win', 'loss', 'push'];

export default function PicksPage() {
  const [picks, setPicks] = useState<Pick[]>(mockPicks);
  const [loading, setLoading] = useState(true);
  const [sport, setSport] = useState<'All' | Sport>('All');
  const [betType, setBetType] = useState<'All' | BetType>('All');
  const [result, setResult] = useState<'All' | PickResult>('All');

  useEffect(() => {
    const loadPicks = async () => {
      try {
        const res = await fetch('/api/picks', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to fetch picks');

        const data = await res.json();
        if (Array.isArray(data.picks) && data.picks.length > 0) {
          setPicks(data.picks);
        } else {
          setPicks(mockPicks);
        }
      } catch {
        setPicks(mockPicks);
      } finally {
        setLoading(false);
      }
    };

    loadPicks();
  }, []);

  const filtered = useMemo(() => {
    return picks.filter((p) => {
      if (sport !== 'All' && p.sport !== sport) return false;
      if (betType !== 'All' && p.bet_type !== betType) return false;
      if (result !== 'All' && p.result !== result) return false;
      return true;
    });
  }, [picks, sport, betType, result]);

  const stats = useMemo(() => computeStats(picks), [picks]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Expert Picks</h1>
        <p className="mt-2 text-slate-400">
          {stats.wins}W - {stats.losses}L · {stats.winRate.toFixed(1)}% Win Rate ·
          {stats.totalProfit > 0 ? ' +' : ' '}
          {stats.totalProfit.toFixed(1)}u Profit
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-300">Sport:</p>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((s) => (
              <button
                key={s}
                onClick={() => setSport(s)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                  sport === s
                    ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-400'
                    : 'border border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-300">Type:</p>
          <div className="flex flex-wrap gap-2">
            {BET_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setBetType(t)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all',
                  betType === t
                    ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-400'
                    : 'border border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-300">Result:</p>
          <div className="flex flex-wrap gap-2">
            {RESULTS.map((r) => (
              <button
                key={r}
                onClick={() => setResult(r)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all',
                  result === r
                    ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-400'
                    : 'border border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-400">Loading picks...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center text-slate-400">
          No picks match your filters.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {filtered.map((pick) => (
            <PickCard key={pick.id} pick={pick} />
          ))}
        </div>
      )}
    </div>
  );
}
    </div>
  );
}
