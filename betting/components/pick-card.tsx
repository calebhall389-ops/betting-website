import { Pick } from '@/lib/types';
import { cn, formatOdds, getSportColor, getResultBadge, formatDate } from '@/lib/utils';
import { Star, TrendingUp, Clock } from 'lucide-react';

interface PickCardProps {
  pick: Pick;
}

export default function PickCard({ pick }: PickCardProps) {
  const confidenceStars = Array.from({ length: 5 }, (_, i) => i < pick.confidence);

  const betTypeLabel: Record<string, string> = {
    spread: 'Spread',
    moneyline: 'Moneyline',
    'over/under': 'O/U',
    prop: 'Prop',
    parlay: 'Parlay',
  };

  return (
    <div className="group relative rounded-xl border border-slate-800 bg-slate-900 p-5 hover:border-slate-700 hover:bg-slate-800/50 transition-all duration-200">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-md border', getSportColor(pick.sport))}>
            {pick.sport}
          </span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-md border bg-slate-800 text-slate-400 border-slate-700">
            {betTypeLabel[pick.bet_type] || pick.bet_type}
          </span>
        </div>
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-md border capitalize', getResultBadge(pick.result))}>
          {pick.result}
        </span>
      </div>

      <div className="mb-3">
        <p className="text-xs text-slate-500 mb-1">{pick.game}</p>
        <div className="flex items-baseline gap-3">
          <h3 className="text-base font-bold text-white">{pick.pick}</h3>
          <span className={cn('text-sm font-semibold', pick.odds > 0 ? 'text-emerald-400' : 'text-slate-300')}>
            {formatOdds(pick.odds)}
          </span>
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed mb-4 line-clamp-2">{pick.analysis}</p>

      <div className="flex items-center justify-between pt-3 border-t border-slate-800">
        <div className="flex items-center gap-1">
          {confidenceStars.map((filled, i) => (
            <Star
              key={i}
              size={12}
              className={filled ? 'text-amber-400 fill-amber-400' : 'text-slate-700 fill-slate-700'}
            />
          ))}
          <span className="text-xs text-slate-500 ml-1">{pick.confidence}/5</span>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-1">
            <TrendingUp size={11} className="text-emerald-500" />
            <span>{pick.units}u</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={11} />
            <span>{formatDate(pick.game_date)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
