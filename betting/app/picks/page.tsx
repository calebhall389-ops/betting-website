import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type PickRow = {
  id: string;
  created_at: string;
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: string | number | null;
  stake: number | null;
  result: string | null;
  sportsbook?: string | null;
  edge?: number | null;
  ev?: number | null;
  analysis?: string | null;
  game_time?: string | null;
  commence_time?: string | null;
  market_probability?: number | null;
  model_probability?: number | null;
  play_rating?: string | null;
};

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY'
    );
  }

  return createClient(url, anon);
}

function formatOdds(odds: number | null | undefined) {
  if (odds === null || odds === undefined || Number.isNaN(Number(odds))) {
    return '—';
  }

  const value = Number(odds);
  return value > 0 ? `+${value}` : `${value}`;
}

function formatPercent(
  value: number | string | null | undefined,
  digits = 2,
  addPercentSign = true
) {
  if (value === null || value === undefined || value === '') return '—';

  const num = Number(value);
  if (!Number.isFinite(num)) return '—';

  const fixed =
    digits === 0 ? `${Math.round(num)}` : num.toFixed(digits);

  return addPercentSign ? `${fixed}%` : fixed;
}

function formatConfidence(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';

  const num = Number(value);
  if (!Number.isFinite(num)) return '—';

  return `${Math.round(num)}%`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function normalizeResult(result: string | null | undefined) {
  if (!result) return 'pending';
  return result;
}

function getRatingClasses(rating: string | null | undefined) {
  const value = (rating || '').toUpperCase();

  if (value === 'MAX PLAY') {
    return 'text-emerald-400';
  }

  if (value === 'A PLAY') {
    return 'text-cyan-400';
  }

  if (value === 'B PLAY') {
    return 'text-yellow-300';
  }

  return 'text-white';
}

export default async function PicksPage() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('picks')
    .select('*')
    .order('game_time', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <main className="min-h-screen bg-black px-6 py-10 text-white">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-4xl font-bold">Today&apos;s Picks</h1>
          <p className="mt-4 text-red-400">
            Failed to load picks: {error.message}
          </p>
        </div>
      </main>
    );
  }

  const picks = ((data as PickRow[] | null) || []).filter(Boolean);

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-bold">Today&apos;s Picks</h1>
        <p className="mt-3 text-lg text-white/70">
          Sharp moneyline picks generated from market price comparisons.
        </p>

        {picks.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-8">
            <p className="text-lg text-white/80">
              No picks available right now.
            </p>
          </div>
        ) : (
          <div className="mt-10 space-y-10">
            {picks.map((pick) => (
              <section
                key={pick.id}
                className="rounded-[32px] border border-white/10 bg-gradient-to-r from-white/[0.04] via-white/[0.02] to-white/[0.04] p-7 shadow-2xl"
              >
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-white/45">
                      {pick.sport || 'Pick'}
                    </p>
                    <h2 className="mt-2 text-3xl font-bold tracking-tight">
                      {pick.pick}
                    </h2>
                    <p className="mt-2 text-2xl text-white/75">{pick.game}</p>
                  </div>

                  <div className="text-left lg:text-right">
                    <p className="text-sm text-white/50">Odds</p>
                    <p className="text-6xl font-bold tracking-tight">
                      {formatOdds(pick.odds)}
                    </p>
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-3xl bg-white/[0.04] p-5">
                    <p className="text-sm text-white/55">Confidence</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {formatConfidence(pick.confidence)}
                    </p>
                  </div>

                  <div className="rounded-3xl bg-white/[0.04] p-5">
                    <p className="text-sm text-white/55">Stake</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {pick.stake ?? '—'}
                    </p>
                  </div>

                  <div className="rounded-3xl bg-white/[0.04] p-5">
                    <p className="text-sm text-white/55">Result</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {normalizeResult(pick.result)}
                    </p>
                  </div>

                  <div className="rounded-3xl bg-white/[0.04] p-5">
                    <p className="text-sm text-white/55">Game Time</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {formatDateTime(pick.game_time || pick.commence_time)}
                    </p>
                  </div>

                  <div className="rounded-3xl bg-white/[0.04] p-5">
                    <p className="text-sm text-white/55">Sportsbook</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {pick.sportsbook || '—'}
                    </p>
                  </div>

                  <div className="rounded-3xl bg-white/[0.04] p-5">
                    <p className="text-sm text-white/55">Edge</p>
                    <p className="mt-2 text-2xl font-semibold text-emerald-400">
                      {formatPercent(pick.edge)}
                    </p>
                  </div>

                  <div className="rounded-3xl bg-white/[0.04] p-5">
                    <p className="text-sm text-white/55">EV</p>
                    <p className="mt-2 text-2xl font-semibold text-emerald-400">
                      {formatPercent(pick.ev)}
                    </p>
                  </div>

                  <div className="rounded-3xl bg-white/[0.04] p-5">
                    <p className="text-sm text-white/55">Play Rating</p>
                    <p
                      className={`mt-2 text-2xl font-semibold ${getRatingClasses(
                        pick.play_rating
                      )}`}
                    >
                      {pick.play_rating || '—'}
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-3xl bg-white/[0.04] p-5">
                  <p className="text-sm text-white/55">Analysis</p>
                  <p className="mt-3 text-xl leading-10 text-white/92">
                    {pick.analysis || 'No analysis available.'}
                  </p>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
