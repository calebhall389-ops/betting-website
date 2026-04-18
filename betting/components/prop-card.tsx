'use client';

type PropCardProps = {
  prop: {
    id: string;
    sport: string;
    game: string;
    player: string;
    market: string;
    line: number;
    pick_type: 'over' | 'under';
    over_odds: number | null;
    under_odds: number | null;
    best_odds: number;
    best_book: string;
    ev: number;
    edge: number;
    confidence: number | string;
    analysis: string | null;
    play_rating?: string | null;
    top_play?: boolean | null;
    books_compared?: number | null;
    implied_probability?: number | null;
    event_date?: string | null;
    created_at?: string | null;
  };
};

function americanToImplied(odds: number) {
  if (!odds) return 0;
  if (odds > 0) return (100 / (odds + 100)) * 100;
  return ((-odds) / ((-odds) + 100)) * 100;
}

function formatOdds(odds: number | null | undefined) {
  if (odds == null) return '—';
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function getEvColor(ev: number) {
  if (ev >= 5) return 'text-emerald-400';
  if (ev >= 3) return 'text-green-400';
  if (ev >= 1.5) return 'text-yellow-400';
  return 'text-slate-400';
}

function getEdgeColor(edge: number) {
  if (edge >= 2.5) return 'text-emerald-400';
  if (edge >= 1.5) return 'text-yellow-400';
  if (edge >= 1) return 'text-orange-300';
  return 'text-slate-400';
}

function getRatingStyles(rating?: string | null) {
  switch (rating) {
    case 'A+':
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    case 'A':
      return 'bg-green-500/20 text-green-300 border border-green-500/40';
    case 'B':
      return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40';
    case 'C':
      return 'bg-slate-500/20 text-slate-300 border border-slate-500/40';
    default:
      return 'bg-slate-500/20 text-slate-300 border border-slate-500/40';
  }
}

function getSharpTags(prop: PropCardProps['prop']) {
  const tags: string[] = [];

  if (prop.ev >= 4) tags.push('🔥 Strong EV');
  else if (prop.ev >= 2) tags.push('📈 Positive EV');

  if (prop.edge >= 1.75) tags.push('📊 Model Edge');
  if ((prop.books_compared ?? 0) >= 3) tags.push('💰 Best Price');
  if (Math.abs(prop.best_odds) >= 120) tags.push('🎯 Plus Money');
  if (prop.top_play) tags.push('⭐ Top Play');

  return tags.slice(0, 4);
}

function formatDate(dateString?: string | null) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function PropCard({ prop }: PropCardProps) {
  const implied =
    prop.implied_probability && prop.implied_probability > 0
      ? prop.implied_probability
      : americanToImplied(prop.best_odds);

  const tags = getSharpTags(prop);

  const sideLabel = prop.pick_type === 'over' ? 'OVER' : 'UNDER';
  const sideClass =
    prop.pick_type === 'over'
      ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
      : 'text-rose-300 border-rose-500/30 bg-rose-500/10';

  const cardGlow =
    prop.top_play || prop.play_rating === 'A+'
      ? 'border-emerald-400 shadow-[0_0_40px_rgba(16,185,129,0.35)] bg-emerald-500/5'
      : 'border-slate-800';

  return (
    <div
      className={`relative rounded-2xl border bg-[#09152c] p-5 transition duration-200 hover:scale-[1.015] hover:border-slate-700 ${cardGlow}`}
    >
      {prop.top_play ? (
        <div className="absolute right-4 top-4 rounded-full bg-emerald-400 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-black">
          TOP PLAY
        </div>
      ) : null}

      <div className="mb-4 flex items-center gap-2 pr-24">
        <span className="rounded-md bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-300">
          {prop.sport}
        </span>

        <span className="rounded-md bg-slate-700/40 px-2.5 py-1 text-xs text-slate-300">
          Pending
        </span>

        {prop.play_rating ? (
          <span
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${getRatingStyles(prop.play_rating)}`}
          >
            {prop.play_rating}
          </span>
        ) : null}
      </div>

      <div className="mb-1 text-3xl font-bold tracking-tight text-white">
        {prop.player}
      </div>

      <div className="mb-4 text-sm text-slate-400">{prop.game}</div>

      <div className="mb-4 rounded-2xl border border-slate-700 bg-slate-800/45 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm text-slate-400">{prop.market}</div>

          <div
            className={`rounded-lg border px-3 py-1 text-sm font-bold ${sideClass}`}
          >
            {sideLabel}
          </div>
        </div>

        <div className="mb-3 flex items-end justify-between">
          <div className="text-4xl font-extrabold text-white">{prop.line}</div>

          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Best Odds
            </div>
            <div className="text-lg font-bold text-emerald-400">
              {formatOdds(prop.best_odds)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-slate-900/50 px-3 py-2">
            <div className="text-slate-500">Over</div>
            <div
              className={`font-semibold ${
                prop.pick_type === 'over' ? 'text-emerald-400' : 'text-slate-300'
              }`}
            >
              {formatOdds(prop.over_odds)}
            </div>
          </div>

          <div className="rounded-xl bg-slate-900/50 px-3 py-2">
            <div className="text-slate-500">Under</div>
            <div
              className={`font-semibold ${
                prop.pick_type === 'under' ? 'text-emerald-400' : 'text-slate-300'
              }`}
            >
              {formatOdds(prop.under_odds)}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-[#071126] px-3 py-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">EV</div>
          <div className={`mt-1 text-2xl font-extrabold ${getEvColor(prop.ev)}`}>
            +{prop.ev.toFixed(2)}%
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#071126] px-3 py-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Edge</div>
          <div className={`mt-1 text-xl font-bold ${getEdgeColor(prop.edge)}`}>
            +{prop.edge.toFixed(2)}%
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#071126] px-3 py-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Book</div>
          <div className="mt-1 truncate text-lg font-bold text-emerald-400">
            {prop.best_book}
          </div>
          <div className="text-xs text-slate-500">Best Available</div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#071126] px-3 py-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Implied
          </div>
          <div className="mt-1 text-xl font-bold text-white">
            {implied.toFixed(1)}%
          </div>
        </div>
      </div>

      {(tags.length > 0 || prop.edge > 1.5) ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-xs text-slate-300"
            >
              {tag}
            </span>
          ))}

          {prop.edge > 1.5 ? (
            <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-300">
              ⚠️ Market Inefficiency
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-sm leading-8 text-slate-300">
        {prop.analysis ||
          `${prop.player} ${sideLabel} ${prop.line} ${prop.market}. Model edge and current market pricing make this one worth a look.`}
      </div>

      <div className="flex items-center justify-between border-t border-slate-800 pt-4">
        <div className="text-sm text-slate-400">
          Books compared:{' '}
          <span className="font-semibold text-slate-200">
            {prop.books_compared ?? 0}
          </span>
        </div>

        <div className="text-sm text-slate-500">
          {formatDate(prop.event_date || prop.created_at)}
        </div>
      </div>
    </div>
  );
}
