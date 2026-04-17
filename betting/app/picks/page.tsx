import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type PickRow = {
  id: string;
  created_at: string;
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: string | number;
  stake: number;
  result: string;
  game_time?: string | null;
  sportsbook?: string | null;
  edge?: number | null;
  ev?: number | null;
  analysis?: string | null;
  tag?: string | null;
};

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  if (!url || !anon) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY'
    );
  }

  return createClient(url, anon);
}

function formatOdds(odds: number) {
  if (odds > 0) return `+${odds}`;
  return `${odds}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';

  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return `${value.toFixed(2)}%`;
}

function formatConfidence(value: string | number) {
  const num = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(num)) return '--';
  return `${Math.round(num)}%`;
}

async function getPicks() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('picks')
    .select('*')
    .order('game_time', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as PickRow[];
}

export default async function PicksPage() {
  const picks = await getPicks();

  return (
    <main className="min-h-screen bg-black text-white px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Today&apos;s Picks</h1>
          <p className="mt-2 text-white/60">
            Sharp moneyline picks generated from market price comparisons.
          </p>
        </div>

        {picks.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-white/70">
            No picks found.
          </div>
        ) : (
          <div className="space-y-8">
            {picks.map((pick) => (
              <div
                key={pick.id}
                className="rounded-3xl border border-white/10 bg-gradient-to-r from-white/5 via-white/[0.03] to-white/5 p-6 shadow-2xl"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="mb-2 text-sm uppercase tracking-wide text-white/50">
                      {pick.sport}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-3xl font-bold">{pick.pick}</h2>

                      {pick.tag ? (
                        <span className="rounded-full bg-green-500/20 px-3 py-1 text-sm font-semibold text-green-300">
                          {pick.tag}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-2 text-2xl text-white/80">{pick.game}</p>
                  </div>

                  <div className="text-left md:text-right">
                    <div className="text-sm text-white/50">Odds</div>
                    <div className="text-5xl font-bold">{formatOdds(pick.odds)}</div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div className="rounded-2xl bg-white/5 p-5">
                    <div className="text-sm text-white/50">Confidence</div>
                    <div className="mt-2 text-4xl font-bold">
                      {formatConfidence(pick.confidence)}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-5">
                    <div className="text-sm text-white/50">Stake</div>
                    <div className="mt-2 text-4xl font-bold">{pick.stake}</div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-5">
                    <div className="text-sm text-white/50">Result</div>
                    <div className="mt-2 text-4xl font-bold">{pick.result}</div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-5">
                    <div className="text-sm text-white/50">Game Time</div>
                    <div className="mt-2 text-2xl font-bold leading-tight">
                      {formatDateTime(pick.game_time)}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-5">
                    <div className="text-sm text-white/50">Sportsbook</div>
                    <div className="mt-2 text-2xl font-bold">
                      {pick.sportsbook || 'N/A'}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-5">
                    <div className="text-sm text-white/50">Edge</div>
                    <div className="mt-2 text-2xl font-bold text-yellow-300">
                      {formatPercent(pick.edge)}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-5">
                    <div className="text-sm text-white/50">EV</div>
                    <div className="mt-2 text-2xl font-bold text-green-400">
                      {formatPercent(pick.ev)}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-5">
                    <div className="text-sm text-white/50">Created</div>
                    <div className="mt-2 text-2xl font-bold leading-tight">
                      {formatDateTime(pick.created_at)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-white/5 p-5">
                  <div className="text-sm text-white/50">Analysis</div>
                  <p className="mt-3 text-xl leading-9 text-white/85">
                    {pick.analysis || 'No analysis available.'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
