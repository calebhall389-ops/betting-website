import { createClient } from '@supabase/supabase-js';
import { Flame, Star, BadgeDollarSign, TrendingUp, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

type PropRow = {
  id: string;
  created_at?: string | null;
  sport: string | null;
  player: string | null;
  game: string | null;
  market: string | null;
  market_key?: string | null;
  recommendation?: string | null;
  line: number | null;
  over_odds: number | null;
  under_odds: number | null;
  best_sportsbook: string | null;
  edge: number | null;
  ev: number | null;
  confidence: number | string | null;
  analysis: string | null;
  event_time?: string | null;
  game_date?: string | null;
  result: string | null;
  dedupe_key?: string | null;
  implied_probability: number | null;
  books_compared: number | null;
  play_rating: 'A+' | 'A' | 'B' | 'C' | null;
  top_play: boolean | null;
  event_date: string | null;
  best_book?: string | null;
  pick_type: 'over' | 'under' | null;
  stake?: number | null;
  profit?: number | null;
  best_odds: number | null;
  fair_odds: number | null;
};

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY'
    );
  }

  return createClient(url, anon);
}

function oddsText(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function pctText(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function plainPct(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)}%`;
}

function formatConfidence(value: number | string | null | undefined): number {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return Math.max(0, Math.min(100, value));
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return Math.max(0, Math.min(100, parsed));
    }
  }

  return 0;
}

function getConfidenceBars(confidence: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(confidence / 10)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function getRatingTone(rating?: string | null): string {
  if (rating === 'A+') {
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30';
  }
  if (rating === 'A') {
    return 'bg-green-500/15 text-green-300 border-green-400/30';
  }
  if (rating === 'B') {
    return 'bg-yellow-500/15 text-yellow-300 border-yellow-400/30';
  }
  return 'bg-slate-500/15 text-slate-300 border-slate-400/30';
}

function getPickTone(pickType: 'over' | 'under' | null | undefined) {
  if (pickType === 'over') {
    return {
      pill: 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30',
      activeBox:
        'border-emerald-400/40 bg-emerald-500/10 text-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.12)]',
    };
  }

  return {
    pill: 'bg-rose-500/15 text-rose-300 border border-rose-400/30',
    activeBox:
      'border-rose-400/40 bg-rose-500/10 text-rose-300 shadow-[0_0_24px_rgba(244,63,94,0.12)]',
  };
}

function fairOddsToProbability(fairOdds: number | null | undefined): number | null {
  if (typeof fairOdds !== 'number' || Number.isNaN(fairOdds)) return null;

  if (fairOdds > 0) {
    return (100 / (fairOdds + 100)) * 100;
  }

  return (Math.abs(fairOdds) / (Math.abs(fairOdds) + 100)) * 100;
}

function formatLocalEventTime(value: string | null | undefined): string {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function getProps(): Promise<{ props: PropRow[]; error: string | null }> {
  try {
    const supabase = getSupabase();

    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).toISOString();
    const end = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 2
    ).toISOString();

    const { data, error } = await supabase
      .from('props')
      .select('*')
      .gte('event_date', start)
      .lt('event_date', end)
      .order('top_play', { ascending: false })
      .order('ev', { ascending: false });

    if (error) {
      return { props: [], error: error.message };
    }

    return { props: (data || []) as PropRow[], error: null };
  } catch (error) {
    return {
      props: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function EmptyState({ message }: { message?: string }) {
  return (
    <div className="rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-8 text-center shadow-[0_0_50px_rgba(34,211,238,0.08)]">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-300">
        <TrendingUp className="h-7 w-7" />
      </div>
      <h2 className="text-2xl font-semibold text-white">No props right now</h2>
      <p className="mt-2 text-sm text-slate-400">
        {message || 'No qualifying props found for today or tomorrow.'}
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-rose-400/20 bg-slate-950/70 p-8 shadow-[0_0_50px_rgba(244,63,94,0.08)]">
      <h2 className="text-2xl font-semibold text-white">Props page error</h2>
      <p className="mt-3 text-sm text-slate-300">{message}</p>
    </div>
  );
}

function PropCard({ prop }: { prop: PropRow }) {
  const confidence = formatConfidence(prop.confidence);
  const pickTone = getPickTone(prop.pick_type);
  const fairOdds = typeof prop.fair_odds === 'number' ? prop.fair_odds : null;
  const projectionProbability = fairOddsToProbability(fairOdds);

  return (
    <article className="group relative overflow-hidden rounded-[28px] border border-cyan-400/35 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_rgba(2,6,23,0.96)_35%,_rgba(2,6,23,1)_75%)] p-5 shadow-[0_0_0_1px_rgba(34,211,238,0.06),0_18px_60px_rgba(0,0,0,0.55)] transition duration-300 hover:-translate-y-1 hover:border-cyan-300/50">
      <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100">
        <div className="absolute -top-10 right-10 h-32 w-32 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <div className="relative z-10">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-300">
            {prop.sport || '—'}
          </span>

          <span className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300">
            {prop.result || 'pending'}
          </span>

          {prop.play_rating ? (
            <span
              className={`rounded-lg border px-3 py-1 text-xs font-semibold ${getRatingTone(
                prop.play_rating
              )}`}
            >
              {prop.play_rating}
            </span>
          ) : null}

          {prop.top_play ? (
            <span className="ml-auto rounded-full bg-emerald-400 px-4 py-1.5 text-xs font-extrabold tracking-wide text-slate-950">
              TOP PLAY
            </span>
          ) : null}
        </div>

        <div className="mb-5 min-w-0">
          <h2 className="text-[2rem] font-extrabold leading-tight text-white md:text-[2.2rem]">
            {prop.player || 'Unknown Player'}
          </h2>

          <p className="mt-1 text-lg font-semibold text-slate-200">
            {(prop.pick_type || prop.recommendation || 'pick').toUpperCase()} {prop.line ?? '—'}{' '}
            {prop.market || 'Market'}
          </p>

          <p className="mt-1 text-base text-slate-400">{prop.game || '—'}</p>

          <p className="mt-1 text-sm text-slate-500">
            {formatLocalEventTime(prop.event_date)}
          </p>
        </div>

        <div className="mb-5 rounded-[24px] border border-cyan-400/15 bg-slate-950/55 p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-400">{prop.market || '—'}</p>

              <div className="mt-2 flex flex-wrap items-end gap-3">
                <span className="text-5xl font-black leading-none text-white">
                  {prop.line ?? '—'}
                </span>

                <span
                  className={`rounded-xl px-4 py-2 text-lg font-extrabold ${pickTone.pill}`}
                >
                  {(prop.pick_type || prop.recommendation || 'pick').toUpperCase()}
                </span>
              </div>
            </div>

            <div className="min-w-0 text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Best Odds
              </p>

              <p className="mt-1 text-3xl font-black leading-none break-words text-emerald-400 md:text-4xl">
                {oddsText(prop.best_odds)}
              </p>

              <p className="mt-1 truncate text-sm text-slate-400">
                {prop.best_sportsbook || prop.best_book || '—'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div
              className={`rounded-2xl border p-3 ${
                prop.pick_type === 'over'
                  ? pickTone.activeBox
                  : 'border-slate-800 bg-slate-900/80 text-slate-300'
              }`}
            >
              <p className="text-sm text-slate-400">Over {prop.line ?? '—'}</p>
              <p className="mt-1 text-2xl font-bold break-words">
                {oddsText(prop.over_odds)}
              </p>
            </div>

            <div
              className={`rounded-2xl border p-3 ${
                prop.pick_type === 'under'
                  ? pickTone.activeBox
                  : 'border-slate-800 bg-slate-900/80 text-slate-300'
              }`}
            >
              <p className="text-sm text-slate-400">Under {prop.line ?? '—'}</p>
              <p className="mt-1 text-2xl font-bold break-words">
                {oddsText(prop.under_odds)}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <div className="min-w-0 rounded-2xl border border-emerald-400/20 bg-slate-950/65 p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">EV</p>
            <p className="mt-2 text-3xl font-black leading-none break-words text-emerald-400 md:text-4xl">
              {pctText(prop.ev)}
            </p>
            <p className="mt-2 text-sm text-slate-400">Expected value</p>
          </div>

          <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Edge</p>
            <p className="mt-2 text-3xl font-black leading-none break-words text-white md:text-4xl">
              {pctText(prop.edge)}
            </p>
            <p className="mt-2 text-sm text-slate-400">Model edge</p>
          </div>

          <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Implied</p>
            <p className="mt-2 text-3xl font-black leading-none break-words text-white md:text-4xl">
              {plainPct(prop.implied_probability)}
            </p>
            <p className="mt-2 text-sm leading-5 text-slate-400">Market probability</p>
          </div>

          <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Fair Odds</p>
            <p className="mt-2 text-3xl font-black leading-none break-words text-cyan-300 md:text-4xl">
              {oddsText(fairOdds)}
            </p>
            <p className="mt-2 text-sm text-slate-400">Model price</p>
          </div>

          <div className="col-span-2 min-w-0 rounded-2xl border border-slate-800 bg-slate-950/65 p-4 md:col-span-3 xl:col-span-1">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
              Confidence
            </p>
            <p className="mt-2 text-3xl font-black leading-none break-words text-white md:text-4xl">
              {confidence}%
            </p>
            <p className="mt-2 overflow-hidden font-mono text-xs tracking-tight text-cyan-300 md:text-sm">
              {getConfidenceBars(confidence)}
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(prop.ev ?? 0) >= 3 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-sm text-orange-200">
              <Flame className="h-4 w-4" />
              Strong EV
            </span>
          ) : null}

          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-200">
            <BadgeDollarSign className="h-4 w-4" />
            Best Price
          </span>

          {prop.top_play ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-yellow-400/30 bg-yellow-500/10 px-3 py-1.5 text-sm text-yellow-200">
              <Star className="h-4 w-4" />
              Top Play
            </span>
          ) : null}

          {confidence >= 70 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-200">
              <ShieldCheck className="h-4 w-4" />
              High Confidence
            </span>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Projection</p>
              <p className="mt-1 text-lg font-bold text-white break-words">
                {projectionProbability !== null ? plainPct(projectionProbability) : '—'}
              </p>
            </div>

            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Market</p>
              <p className="mt-1 text-lg font-bold text-white break-words">
                {plainPct(prop.implied_probability)}
              </p>
            </div>

            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Best Book</p>
              <p className="mt-1 truncate text-lg font-bold text-emerald-300">
                {prop.best_sportsbook || prop.best_book || '—'}
              </p>
            </div>

            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                Books Compared
              </p>
              <p className="mt-1 text-lg font-bold text-white break-words">
                {prop.books_compared ?? '—'}
              </p>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-800 pt-4">
            <p className="text-base leading-8 text-slate-300">
              {prop.analysis ||
                `${prop.player || 'This prop'} ${
                  (prop.pick_type || prop.recommendation || 'pick').toUpperCase()
                } ${prop.line ?? '—'} ${prop.market || ''}. Best price ${oddsText(
                  prop.best_odds
                )} at ${prop.best_sportsbook || prop.best_book || 'best available book'}.`}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

export default async function PropsPage() {
  const { props, error } = await getProps();

  const avgEv = props.length
    ? (
        props.reduce((sum, prop) => sum + (typeof prop.ev === 'number' ? prop.ev : 0), 0) /
        props.length
      ).toFixed(2)
    : '0.00';

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(6,182,212,0.12),_rgba(2,6,23,1)_28%,_rgba(2,6,23,1)_100%)] px-4 py-8 md:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 rounded-[30px] border border-cyan-400/20 bg-slate-950/65 p-6 shadow-[0_0_60px_rgba(34,211,238,0.08)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
                SharpEdge Props
              </p>

              <h1 className="mt-2 text-4xl font-black tracking-tight text-white md:text-5xl">
                Best player props today
              </h1>

              <p className="mt-3 text-slate-400">
                Ranked by EV, edge, best available price, and consensus market value across major sportsbooks.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Props</p>
                <p className="mt-1 text-3xl font-black text-white">{props.length}</p>
              </div>

              <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Top Plays</p>
                <p className="mt-1 text-3xl font-black text-emerald-400">
                  {props.filter((p) => p.top_play).length}
                </p>
              </div>

              <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Avg EV</p>
                <p className="mt-1 text-3xl font-black text-cyan-300 break-words">
                  {avgEv}%
                </p>
              </div>

              <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Window</p>
                <p className="mt-1 text-3xl font-black text-white">48h</p>
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <ErrorState message={error} />
        ) : props.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            {props.map((prop) => (
              <PropCard key={prop.id} prop={prop} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
