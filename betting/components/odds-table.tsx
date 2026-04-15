'use client';

import { OddsEntry } from '@/lib/types';
import { cn, formatOdds, formatSpread, getSportColor, formatDate } from '@/lib/utils';
import { Clock } from 'lucide-react';

interface OddsTableProps {
  odds: OddsEntry[];
}

export default function OddsTable({ odds }: OddsTableProps) {
  if (odds.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center">
        <p className="text-slate-500 text-sm">No odds available.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-800/50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-12">Sport</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Matchup</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Date / Time</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Spread</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Moneyline</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {odds.map((entry) => (
              <tr key={entry.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-4">
                  <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded border', getSportColor(entry.sport))}>
                    {entry.sport}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-8 text-right">AWAY</span>
                      <span className="text-sm font-medium text-white">{entry.away_team}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-8 text-right">HOME</span>
                      <span className="text-sm font-medium text-slate-300">{entry.home_team}</span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-0.5">
                    <p className="text-sm text-slate-300">{formatDate(entry.game_date)}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock size={10} />
                      {entry.game_time}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-center space-y-1">
                    <div className="flex justify-center gap-3">
                      <span className="text-sm font-medium text-slate-200">
                        {formatSpread(entry.spread_away)}
                      </span>
                      <span className="text-xs text-slate-500">{formatOdds(entry.spread_away_odds)}</span>
                    </div>
                    <div className="flex justify-center gap-3">
                      <span className="text-sm font-medium text-slate-200">
                        {formatSpread(entry.spread_home)}
                      </span>
                      <span className="text-xs text-slate-500">{formatOdds(entry.spread_home_odds)}</span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-center space-y-1">
                    <div>
                      <span className={cn('text-sm font-semibold', entry.moneyline_away > 0 ? 'text-emerald-400' : 'text-slate-200')}>
                        {formatOdds(entry.moneyline_away)}
                      </span>
                    </div>
                    <div>
                      <span className={cn('text-sm font-semibold', entry.moneyline_home > 0 ? 'text-emerald-400' : 'text-slate-200')}>
                        {formatOdds(entry.moneyline_home)}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-center space-y-1">
                    <div className="flex justify-center gap-2">
                      <span className="text-xs text-slate-500">O</span>
                      <span className="text-sm text-slate-200">{entry.total}</span>
                      <span className="text-xs text-slate-500">{formatOdds(entry.over_odds)}</span>
                    </div>
                    <div className="flex justify-center gap-2">
                      <span className="text-xs text-slate-500">U</span>
                      <span className="text-sm text-slate-200">{entry.total}</span>
                      <span className="text-xs text-slate-500">{formatOdds(entry.under_odds)}</span>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
