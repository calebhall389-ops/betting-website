'use client';

import { useState } from 'react';
import { mockProps } from '@/lib/mock-data';
import { cn, formatOdds, getSportColor, getResultBadge, formatDate } from '@/lib/utils';
import { Sport } from '@/lib/types';
import { Star, Filter, TrendingUp, TrendingDown } from 'lucide-react';

const SPORTS: (Sport | 'All')[] = ['All', 'NFL', 'NBA', 'MLB', 'NHL'];

export default function PropsPage() {
  const [sport, setSport] = useState<Sport | 'All'>('All');
  const [recFilter, setRecFilter] = useState<'all' | 'over' | 'under'>('all');

  const filtered = mockProps.filter((p) => {
    if (sport !== 'All' && p.sport !== sport) return false;
    if (recFilter !== 'all' && p.recommendation !== recFilter) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Player Props</h1>
        <p className="text-sm text-slate-500 mt-1">Sharp over/under recommendations with expert analysis</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter size={12} /> Sport:
          </span>
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
        <div className="flex items-center gap-2 flex-wrap ml-0 md:ml-4">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter size={12} /> Pick:
          </span>
          {(['all', 'over', 'under'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRecFilter(r)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-all capitalize',
                recFilter === r
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
          <p className="text-slate-500 text-sm">No props match your filters.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((prop) => {
            const isOver = prop.recommendation === 'over';
            const recOdds = isOver ? prop.over_odds : prop.under_odds;
            const confidenceStars = Array.from({ length: 5 }, (_, i) => i < prop.confidence);

            return (
              <div
                key={prop.id}
                className="rounded-xl border border-slate-800 bg-slate-900 p-5 hover:border-slate-700 hover:bg-slate-800/50 transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-md border', getSportColor(prop.sport))}>
                      {prop.sport}
                    </span>
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-md border capitalize', getResultBadge(prop.result))}>
                      {prop.result}
                    </span>
                  </div>
                  <div className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold border',
                    isOver ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'
                  )}>
                    {isOver ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {prop.recommendation.toUpperCase()}
                  </div>
                </div>

                <div className="mb-3">
                  <h3 className="text-base font-bold text-white">{prop.player}</h3>
                  <p className="text-xs text-slate-500">{prop.team} vs {prop.opponent}</p>
                </div>

                <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 p-3 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{prop.stat}</span>
                    <span className="text-lg font-black text-white">{prop.line}</span>
                  </div>
                  <div className="flex justify-between mt-2 text-xs">
                    <span className={cn('font-semibold', isOver ? 'text-emerald-400' : 'text-slate-400')}>
                      Over {formatOdds(prop.over_odds)}
                    </span>
                    <span className={cn('font-semibold', !isOver ? 'text-emerald-400' : 'text-slate-400')}>
                      Under {formatOdds(prop.under_odds)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-slate-800">
                  <div className="flex items-center gap-1">
                    {confidenceStars.map((filled, i) => (
                      <Star
                        key={i}
                        size={11}
                        className={filled ? 'text-amber-400 fill-amber-400' : 'text-slate-700 fill-slate-700'}
                      />
                    ))}
                    <span className="ml-1">{prop.confidence}/5</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn('font-semibold text-sm', recOdds > 0 ? 'text-emerald-400' : 'text-slate-300')}>
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
