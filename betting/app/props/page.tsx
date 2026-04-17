'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn, formatOdds, getSportColor, getResultBadge, formatDate } from '@/lib/utils';
import { Star, Filter, TrendingUp, TrendingDown } from 'lucide-react';

type PropRow = {
  id?: string;
  sport: string;
  player: string;
  game: string;
  market: string;
  market_key: string;
  recommendation: 'over' | 'under';
  line: number;
  over_odds: number;
  under_odds: number;
  best_sportsbook: string;
  edge: number;
  ev: number;
  confidence: number;
  analysis: string;
  event_time: string;
  game_date: string;
  result: string;
};

type SportFilter = 'All' | 'NFL' | 'NBA' | 'MLB' | 'NHL';

const SPORTS: SportFilter[] = ['All', 'NFL', 'NBA', 'MLB', 'NHL'];

export default function PropsPage() {
  const [sport, setSport] = useState<SportFilter>('All');
  const [recFilter, setRecFilter] = useState<'all' | 'over' | 'under'>('all');
  const [propsData, setPropsData] = useState<PropRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadProps() {
      try {
        setLoading(true);
        setError('');

        const res = await fetch('/api/props', {
          cache: 'no-store',
        });

        const json = await res.json();

        if (!res.ok || !json?.success) {
          throw new Error(json?.error || 'Failed to load props');
        }

        if (active) {
          setPropsData(Array.isArray(json.props) ? json.props : []);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load props');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProps();

    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return propsData.filter((p) => {
      if (sport !== 'All' && p.sport !== sport) return false;
      if (recFilter !== 'all' && p.recommendation !== recFilter) return false;
      return true;
    });
  }, [propsData, sport, recFilter]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Player Props</h1>
        <p className="mt-1 text-sm text-slate-500">
          Real value props from major books, ranked by edge and EV
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter size={12} /> Sport:
          </span>
          {SPORTS.map((s) => (
            <button
              key={s}
              onClick={() => setSport(s)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                sport === s
                  ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400'
                  : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="ml-0 flex flex-wrap items-center gap-2 md:ml-4">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter size={12} /> Pick:
          </span>
          {(['all', 'over', 'under'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRecFilter(r)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition-all',
                recFilter === r
                  ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400'
                  : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-16 text-center">
          <p className="text-sm text-slate-500">Loading props...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-16 text-center">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-16 text-center">
          <p className="text-sm text-slate-500">No props match your filters.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((prop, idx) => {
            const isOver = prop.recommendation === 'over';
            const recOdds = isOver ? prop.over_odds : prop.under_odds;
            const confidenceStars = Array.from(
              { length: 5 },
              (_, i) => i < Number(prop.confidence || 0)
            );

            return (
              <div
                key={`${prop.player}-${prop.market_key}-${prop.line}-${idx}`}
                className="rounded-xl border border-slate-800 bg-slate-900 p-5 transition-all duration-200 hover:border-slate-700 hover:bg-slate-800/50"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-md border px-2 py-0.5 text-xs font-semibold',
                        getSportColor(prop.sport)
                      )}
                    >
                      {prop.sport}
                    </span>

                    <span
                      className={cn(
                        'rounded-md border px-2 py-0.5 text-xs font-semibold capitalize',
                        getResultBadge(prop.result)
                      )}
                    >
                      {prop.result}
                    </span>
                  </div>

                  <div
                    className={cn(
                      'flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold',
                      isOver
                        ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                        : 'border-red-500/30 bg-red-500/15 text-red-400'
                    )}
                  >
                    {isOver ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {prop.recommendation.toUpperCase()}
                  </div>
                </div>

                <div className="mb-3">
                  <h3 className="text-base font-bold text-white">{prop.player}</h3>
                  <p className="text-xs text-slate-500">{prop.game}</p>
                </div>

                <div className="mb-4 rounded-lg border border-slate-700/50 bg-slate-800/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{prop.market}</span>
                    <span className="text-lg font-black text-white">{prop.line}</span>
                  </div>

                  <div className="mt-2 flex justify-between text-xs">
                    <span
                      className={cn(
                        'font-semibold',
                        isOver ? 'text-emerald-400' : 'text-slate-400'
                      )}
                    >
                      Over {formatOdds(prop.over_odds)}
                    </span>

                    <span
                      className={cn(
                        'font-semibold',
                        !isOver ? 'text-emerald-400' : 'text-slate-400'
                      )}
                    >
                      Under {formatOdds(prop.under_odds)}
                    </span>
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                    <div className="text-slate-500">EV</div>
                    <div className="mt-1 font-semibold text-emerald-400">
                      {prop.ev > 0 ? '+' : ''}
                      {prop.ev.toFixed(2)}%
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                    <div className="text-slate-500">Edge</div>
                    <div className="mt-1 font-semibold text-white">
                      {prop.edge > 0 ? '+' : ''}
                      {prop.edge.toFixed(2)}%
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                    <div className="text-slate-500">Book</div>
                    <div className="mt-1 truncate font-semibold text-white">
                      {prop.best_sportsbook}
                    </div>
                  </div>
                </div>

                {prop.analysis ? (
                  <p className="mb-4 line-clamp-4 text-xs leading-5 text-slate-400">
                    {prop.analysis}
                  </p>
                ) : null}

                <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    {confidenceStars.map((filled, i) => (
                      <Star
                        key={i}
                        size={11}
                        className={
                          filled
                            ? 'fill-amber-400 text-amber-400'
                            : 'fill-slate-700 text-slate-700'
                        }
                      />
                    ))}
                    <span className="ml-1">{prop.confidence}/5</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-sm font-semibold',
                        recOdds > 0 ? 'text-emerald-400' : 'text-slate-300'
                      )}
                    >
                      {formatOdds(recOdds)}
                    </span>
                    <span>{formatDate(prop.game_date)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
