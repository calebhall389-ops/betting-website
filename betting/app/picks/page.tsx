import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type PickRow = {
  id: string;
  created_at: string;
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: number | string;
  stake: number;
  result: string;
  analysis?: string | null;
  sportsbook?: string | null;
  edge?: number | null;
  ev?: number | null;
  game_time?: string | null;
  play_rating?: string | null;
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

function formatOdds(odds: number | null | undefined) {
  if (typeof odds !== 'number' || !Number.isFinite(odds)) return 'N/A';
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(2)}%`;
}

function formatGameTime(value: string | null | undefined) {
  if (!value) return 'TBD';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'TBD';

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getResultClass(result: string | null | undefined) {
  const normalized = (result || '').toLowerCase();

  if (normalized === 'win') return 'text-emerald-400';
  if (normalized === 'loss') return 'text-red-400';
  if (normalized === 'push') return 'text-yellow-400';
  return 'text-white';
}

function getPlayRatingClass(playRating: string | null | undefined) {
  switch ((playRating || '').toUpperCase()) {
    case 'MAX PLAY':
      return 'text-red-400';
    case 'A PLAY':
      return 'text-cyan-400';
    case 'B PLAY':
      return 'text-yellow-400';
    default:
      return 'text-white';
  }
}

function getConfidenceLabel(pick: PickRow) {
  const confidence =
    typeof pick.confidence === 'number'
      ? pick.confidence
      : Number(pick.confidence);

  if (!Number.isFinite(confidence)) return 'N/A';

  if (typeof pick.odds === 'number' && pick.odds >= 300) {
    return `Win Prob: ${confidence}%`;
  }

  if (confidence < 50) {
    return 'Value Edge Detected';
  }

  return `${confidence}%`;
}

function getConfidenceTitle(pick: PickRow) {
  if (typeof pick.odds === 'number' && pick.odds >= 300) {
    return 'Win Probability';
  }

  const confidence =
    typeof pick.confidence === 'number'
      ? pick.confidence
      : Number(pick.confidence);

  if (Number.isFinite(confidence) && confidence < 50) {
    return 'Signal';
  }

  return 'Confidence';
}

async function getPicks(): Promise<PickRow[]> {
  const supabase = getSupabase();

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const endOfTomorrow = new Date(startOfToday);
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 2);
  endOfTomorrow.setMilliseconds(-1);

  const { data, error } = await supabase
    .from('picks')
    .select(
      `
      id,
      created_at,
      sport,
      game,
      pick,
      odds,
      confidence,
      stake,
      result,
      analysis,
      sportsbook,
      edge,
      ev,
      game_time,
      play_rating
    `
    )
    .gte('game_time', startOfToday.toISOString())
    .lte('game_time', endOfTomorrow.toISOString())
    .order('ev', { ascending: false })
    .order('edge', { ascending: false })
    .order('game_time', { ascending: true });

  if (error) {
    console.error('Supabase picks fetch error:', error);
    return [];
  }

  return (data as PickRow[]) || [];
}

export default async function PicksPage() {
  const picks = await getPicks();

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">Today&apos;s Picks</h1>
          <p className="mt-2 text-gray-400">
            Best available model-driven moneyline plays for today and tomorrow.
          </p>
        </div>

        {picks.length === 0 ? (
          <div className="rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-10 text-center shadow-2xl">
            <h2 className="text-2xl font-semibold">No sharp picks found</h2>
            <p className="mt-3 text-gray-400">
              No qualifying plays are available right now. Try regenerating picks or
              check back closer to game time.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {picks.map((pick) => (
              <section
                key={pick.id}
                className="overflow-hidden rounded-[2.25rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(20,40,80,0.15),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_30px_80px_rgba(0,0,0,0.45)]"
              >
                <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="mb-3 text-sm uppercase tracking-[0.35em] text-gray-300">
                      {pick.sport || 'SPORT'}
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                      {pick.pick}
                    </h2>
                    <p className="mt-2 text-2xl text-gray-300">{pick.game}</p>
                  </div>

                  <div className="shrink-0 text-left lg:text-right">
                    <div className="text-sm text-gray-400">Odds</div>
                    <div className="text-6xl font-bold tracking-tight md:text-7xl">
                      {formatOdds(pick.odds)}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    label={getConfidenceTitle(pick)}
                    value={getConfidenceLabel(pick)}
                  />
                  <StatCard label="Stake" value={`${pick.stake ?? 0}`} />
                  <StatCard
                    label="Result"
                    value={pick.result || 'pending'}
                    valueClassName={getResultClass(pick.result)}
                  />
                  <StatCard
                    label="Game Time"
                    value={formatGameTime(pick.game_time)}
                  />
                  <StatCard
                    label="Sportsbook"
                    value={pick.sportsbook || 'N/A'}
                  />
                  <StatCard
                    label="Edge"
                    value={formatPercent(pick.edge)}
                    valueClassName="text-emerald-400"
                  />
                  <StatCard
                    label="EV"
                    value={formatPercent(pick.ev)}
                    valueClassName="text-emerald-400"
                  />
                  <StatCard
                    label="Play Rating"
                    value={pick.play_rating || 'N/A'}
                    valueClassName={getPlayRatingClass(pick.play_rating)}
                  />
                </div>

                <div className="mt-6 rounded-[1.75rem] border border-white/5 bg-white/[0.02] p-6">
                  <div className="mb-4 text-sm text-gray-300">Analysis</div>
                  <p className="text-xl leading-10 text-gray-100">
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

function StatCard({
  label,
  value,
  valueClassName = 'text-white',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-white/5 bg-white/[0.03] p-6 shadow-inner shadow-black/20">
      <div className="mb-3 text-sm text-gray-300">{label}</div>
      <div className={`text-2xl font-semibold leading-snug ${valueClassName}`}>
        {value}
      </div>
    </div>
  );
}
