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

  // Do not crash the page if env vars are missing
  if (!url || !anon) {
    return null;
  }

  return createClient(url, anon);
}

function formatOdds(odds: number) {
  if (typeof odds !== 'number' || Number.isNaN(odds)) return '--';
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
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--';
  }

  return `${Number(value).toFixed(2)}%`;
}

function formatConfidence(value: string | number) {
  if (value === null || value === undefined || value === '') return '--';

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && !Number.isNaN(value)) {
    return `${Math.round(value)}%`;
  }

  return '--';
}

async function getPicks(): Promise<{
  picks: PickRow[];
  error: string | null;
}> {
  try {
    const supabase = getSupabase();

    if (!supabase) {
      return {
        picks: [],
        error:
          'Missing Supabase env variables. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.',
      };
    }

    const { data, error } = await supabase
      .from('picks')
      .select('*')
      .order('game_time', { ascending: true, nullsFirst: false });

    if (error) {
      return {
        picks: [],
        error: error.message,
      };
    }

    return {
      picks: (data || []) as PickRow[],
      error: null,
    };
  } catch (err) {
    return {
      picks: [],
      error: err instanceof Error ? err.message : 'Unknown server error',
    };
  }
}

export default async function PicksPage() {
  const { picks, error } = await getPicks();

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Today&apos;s Picks</h1>
          <p className="mt-2 text-white/60">
            Sharp moneyline picks generated from market price comparisons.
          </p>
        </div>

        {error ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-8 text-red-200">
            <div className="text-xl font-bold">Picks Error</div>
            <p className="mt-3 break-words text-sm">{error}</p>
          </div>
        ) : picks.length === 0 ? (
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
                      {pick.sport || 'N/A'}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-3xl font-bold">
                        {pick.pick || 'N/A'}
                      </h2>

                      {pick.tag && (
                        <span className="rounded-full bg-green-500/20 px-3 py-1 text-sm font-semibold text-green-300">
                          {pick.tag}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-2xl text-white/80">
                      {pick.game || 'N/A'}
                    </p>
                  </div>

                  <div className="text-left md:text-right">
                    <div className="text-sm text-white/50">Odds</div>
                    <div className="text-5xl font-bold">
                      {formatOdds(pick.odds)}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
                  <Stat
                    title="Confidence"
                    value={formatConfidence(pick.confidence)}
                  />
                  <Stat title="Stake" value={pick.stake ?? '--'} />
                  <Stat title="Result" value={pick.result || '--'} />
                  <Stat
                    title="Game Time"
                    value={formatDateTime(pick.game_time)}
                  />
                  <Stat title="Sportsbook" value={pick.sportsbook || 'N/A'} />
                  <Stat
                    title="Edge"
                    value={formatPercent(pick.edge)}
                    highlight={typeof pick.edge === 'number' && pick.edge > 10}
                  />
                  <Stat
                    title="EV"
                    value={formatPercent(pick.ev)}
                    highlight={typeof pick.ev === 'number' && pick.ev > 10}
                  />
                  <Stat
                    title="Created"
                    value={formatDateTime(pick.created_at)}
                  />
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

function Stat({
  title,
  value,
  highlight = false,
}: {
  title: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white/5 p-5">
      <div className="text-sm text-white/50">{title}</div>
      <div
        className={`mt-2 text-2xl font-bold ${
          highlight ? 'text-green-400' : ''
        }`}
      >
        {value}
      </div>
    </div>
  );
}
