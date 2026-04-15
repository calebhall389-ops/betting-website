'use client';

import { TrackedBet } from '@/lib/types';
import { cn, formatOdds, getSportColor, getResultBadge, formatDate } from '@/lib/utils';

interface TrackerTableProps {
  bets: TrackedBet[];
}

export default function TrackerTable({ bets }: TrackerTableProps) {
  if (bets.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center">
        <p className="text-slate-500 text-sm">No tracked bets yet.</p>
      </div>
    );
  }

  const betTypeLabel: Record<string, string> = {
    spread: 'Spread',
    moneyline: 'Moneyline',
    'over/under': 'O/U',
    prop: 'Prop',
    parlay: 'Parlay',
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-800/50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Sport</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Odds</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Units</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Result</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Profit</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {bets.map((bet) => (
              <tr key={bet.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3.5">
                  <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded border', getSportColor(bet.sport))}>
                    {bet.sport}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-sm text-slate-200">{bet.description}</span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-xs text-slate-400">{betTypeLabel[bet.bet_type] || bet.bet_type}</span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className={cn('text-sm font-semibold', bet.odds > 0 ? 'text-emerald-400' : 'text-slate-300')}>
                    {formatOdds(bet.odds)}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className="text-sm text-slate-300">{bet.units}u</span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded border capitalize', getResultBadge(bet.result))}>
                    {bet.result}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span className={cn(
                    'text-sm font-semibold',
                    bet.profit > 0 ? 'text-emerald-400' : bet.profit < 0 ? 'text-red-400' : 'text-slate-400'
                  )}>
                    {bet.profit > 0 ? '+' : ''}{bet.profit.toFixed(2)}u
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span className="text-xs text-slate-500">{formatDate(bet.date)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
