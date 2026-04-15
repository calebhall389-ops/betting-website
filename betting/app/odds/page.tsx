'use client';

import { useState } from 'react';
import OddsTable from '@/components/odds-table';
import { mockOdds } from '@/lib/mock-data';
import { cn } from '@/lib/utils';
import { Sport } from '@/lib/types';
import { Filter } from 'lucide-react';

const SPORTS: (Sport | 'All')[] = ['All', 'NFL', 'NBA', 'MLB', 'NHL'];

export default function OddsPage() {
  const [sport, setSport] = useState<Sport | 'All'>('All');

  const filtered = mockOdds.filter((o) => sport === 'All' || o.sport === sport);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Live Odds</h1>
        <p className="text-sm text-slate-500 mt-1">Spreads, moneylines, and totals across major sports</p>
      </div>

      <div className="mb-6 flex items-center gap-2 flex-wrap">
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

      <OddsTable odds={filtered} />
    </div>
  );
}
