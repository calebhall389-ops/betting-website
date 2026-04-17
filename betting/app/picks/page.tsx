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
  analysis?: string | null;
  sportsbook?: string | null;
  status?: string | null;
  play_rating?: string | null;
  is_live?: boolean | null;
  market_type?: string | null;
  commence_time?: string | null;
  line_movement?: number | null;
  previous_odds?: number | null;
};

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  return createClient(url, anon);
}

function formatOdds(odds: number) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatTime(dateString?: string | null) {
  if (!dateString) return 'TBD';

  const date = new Date(dateString);

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getBadgeClasses(isLive?: boolean | null) {
  if (isLive) {
    return 'border border-red-500/30 bg-red-500/15 text-red-400';
  }

  return 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-400';
}

function getResultClasses(result: string) {
  if (result === 'win') return 'text-emerald-400';
  if (result === 'loss') return 'text-red-400';
  if (result === 'push') return 'text-yellow-400';
  return 'text-zinc-400';
}

async function getPicks(): Promise<PickRow[]> {
  const supabase = getSupabase();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const tomorrowEnd = new Date(todayStart);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 2);

  const { data, error } = await supabase
    .from('picks')
    .select(`
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
      status,
      play_rating,
      is_live,
      market_type,
      commence_time,
      line_movement,
      previous_odds
    `)
    .eq('status', 'active')
    .gte('commence_time', todayStart.toISOString())
    .lt('commence_time', tomorrowEnd.toISOString())
    .order('is_live', { ascending: false })
    .order('commence_time', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase picks fetch failed:', error.message);
    return [];
  }

  return (data || []) as PickRow[];
}

export default async function PicksPage() {
  const picks = await getPicks();

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Picks
          </h1>
          <p className="mt-2 text-sm text-zinc-400 sm:text-base">
            Pregame model plays and live value spots for today and tomorrow.
          </p>
        </div>

        {picks.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
            <h2 className="text-xl font-semibold">No active picks right now</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Run your generators or check back closer to game time.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {picks.map((pick) => (
              <div
                key={pick.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-sm"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                      {pick.sport}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold leading-tight text-white">
                      {pick.pick}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-400">{pick.game}</p>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${getBadgeClasses(
                      pick.is_live
                    )}`}
                  >
                    {pick.is_live ? 'LIVE' : 'PRE-GAME'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      Odds
                    </p>
                    <p className="mt-1 text-xl font-bold">
                      {formatOdds(Number(pick.odds))}
                    </p>
                    {pick.previous_odds !== null &&
                    pick.previous_odds !== undefined ? (
                      <p className="mt-1 text-xs text-zinc-400">
                        Previous:{' '}
                        {formatOdds(Number(pick.previous_odds))}
                        {pick.line_movement !== null &&
                        pick.line_movement !== undefined ? (
                          <>
                            {' '}
                            · Move:{' '}
                            {pick.line_movement > 0
                              ? `+${pick.line_movement}`
                              : pick.line_movement}
                          </>
                        ) : null}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-zinc-500">
                        No prior scan yet
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      Confidence
                    </p>
                    <p className="mt-1 text-xl font-bold">
                      {pick.confidence}%
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      Stake: {pick.stake}u
                    </p>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      Sportsbook
                    </p>
                    <p className="mt-1 text-sm font-medium text-white">
                      {pick.sportsbook || 'N/A'}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {pick.market_type || 'moneyline'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      Rating
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {pick.play_rating || 'LEAN'}
                    </p>
                    <p className={`mt-1 text-xs font-medium ${getResultClasses(pick.result)}`}>
                      {pick.result?.toUpperCase() || 'PENDING'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-zinc-800 bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    Start Time
                  </p>
                  <p className="mt-1 text-sm text-white">
                    {formatTime(pick.commence_time)}
                  </p>
                </div>

                {pick.analysis ? (
                  <div className="mt-4 rounded-xl border border-zinc-800 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      Analysis
                    </p>
                    <p className="mt-2 text-sm leading-6 text-zinc-300">
                      {pick.analysis}
                    </p>
                  </div>
                ) : null}

                <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                  <span>Created: {formatTime(pick.created_at)}</span>
                  <span>{pick.status || 'active'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
