import { createClient } from '@supabase/supabase-js';
import LocalGameTime from '@/components/LocalGameTime';

export const dynamic = 'force-dynamic';

type Pick = {
  id: string;
  created_at: string;
  sport: string;
  game: string;
  pick: string;
  odds: number;
  best_odds?: number | null;
  implied_odds?: number | null;
  confidence: string | number;
  analysis?: string | null;
  sportsbook?: string | null;
  sportsbook_key?: string | null;
  edge?: number | null;
  ev?: number | null;
  play_rating?: string | null;
  stake?: number | null;
  result?: string | null;
  status?: string | null;
  mode?: string | null;
  market_type?: string | null;
  event_id?: string | null;
  commence_time?: string | null;
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

function formatOdds(odds?: number | null) {
  if (odds === null || odds === undefined || Number.isNaN(Number(odds))) {
    return '--';
  }

  const num = Number(odds);
  return num > 0 ? `+${num}` : `${num}`;
}

function formatPercent(value?: number | string | null, digits = 2) {
  if (value === null || value === undefined || value === '') return '--';

  const num = Number(value);
  if (Number.isNaN(num)) return '--';

  return `${num.toFixed(digits)}%`;
}

function getBadgeClasses(playRating?: string | null) {
  switch (playRating) {
    case 'A PLAY':
      return 'inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-300';
    case 'B PLAY':
      return 'inline-flex rounded-full border border-blue-500/30 bg-blue-500/15 px-3 py-1 text-sm font-semibold text-blue-300';
    case 'LEAN':
      return 'inline-flex rounded-full border border-yellow-500/30 bg-yellow-500/15 px-3 py-1 text-sm font-semibold text-yellow-300';
    default:
      return 'inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm font-semibold text-gray-300';
  }
}

function getModeBadgeClasses(mode?: string | null) {
  if (mode === 'pregame') {
    return 'border border-blue-500/25 bg-blue-500/15 text-blue-300';
  }

  if (mode === 'live') {
    return 'border border-red-500/25 bg-red-500/15 text-red-300';
  }

  return 'border border-white/10 bg-white/10 text-gray-300';
}

function getSportAccent(sport?: string | null) {
  switch (sport) {
    case 'MLB':
      return 'text-emerald-400';
    case 'NBA':
      return 'text-orange-400';
    case 'NHL':
      return 'text-cyan-400';
    default:
      return 'text-emerald-400';
  }
}

function getValuePoints(bestOdds?: number | null, impliedOdds?: number | null) {
  if (
    bestOdds === null ||
    bestOdds === undefined ||
    impliedOdds === null ||
    impliedOdds === undefined
  ) {
    return null;
  }

  return Math.abs(Number(bestOdds) - Number(impliedOdds));
}

async function getPicks(): Promise<Pick[]> {
  const supabase = getSupabase();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('picks')
    .select('*')
    .eq('mode', 'pregame')
    .in('status', ['open', 'pending'])
    .gt('commence_time', nowIso)
    .order('commence_time', { ascending: true });

  if (error) {
    throw new Error(`Failed to load picks: ${error.message}`);
  }

  return (data as Pick[]) || [];
}

export default async function PicksPage() {
  const picks = await getPicks();

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-10 flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-3xl">
            ◎
          </div>

          <div>
            <h1 className="text-4xl font-bold tracking-tight">
              Pregame Picks
            </h1>
            <p className="mt-2 text-lg text-gray-400">
              Model-approved pregame bets for upcoming games only.
            </p>
          </div>
        </div>

        {picks.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center">
            <h2 className="text-2xl font-semibold">No picks right now</h2>
            <p className="mt-3 text-gray-400">
              No qualifying pregame picks were found.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {picks.map((pick) => {
              const valuePoints = getValuePoints(
                pick.best_odds ?? pick.odds,
                pick.implied_odds
              );

              return (
                <article
                  key={pick.id}
                  className="group rounded-3xl border border-white/10 bg-[#0f0f10] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition duration-200 hover:border-white/15 hover:bg-[#121214]"
                >
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div
                        className={`text-sm font-semibold tracking-wide ${getSportAccent(
                          pick.sport
                        )}`}
                      >
                        {pick.sport || '--'}
                      </div>

                      {valuePoints !== null ? (
                        <div className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                          {valuePoints} pts value
                        </div>
                      ) : null}
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-sm font-medium ${getModeBadgeClasses(
                        pick.mode
                      )}`}
                    >
                      {pick.mode === 'pregame' ? 'Pregame' : pick.mode || '--'}
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h2 className="text-[2rem] font-bold leading-tight tracking-tight text-white">
                        {pick.game}
                      </h2>
                      <div className="mt-3 text-[2rem] font-semibold leading-tight text-white">
                        {pick.pick}
                      </div>
                    </div>

                    <div className="text-sm font-medium text-gray-400">
                      <LocalGameTime value={pick.commence_time} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-4">
                        <div className="text-sm text-gray-400">Best Odds</div>
                        <div className="mt-2 text-3xl font-bold text-white">
                          {formatOdds(pick.best_odds ?? pick.odds)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-4">
                        <div className="text-sm text-gray-400">
                          Implied Odds
                        </div>
                        <div className="mt-2 text-3xl font-bold text-white">
                          {formatOdds(pick.implied_odds)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-4">
                        <div className="text-sm text-gray-400">Confidence</div>
                        <div className="mt-2 text-3xl font-bold text-white">
                          {formatPercent(pick.confidence, 0)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-4">
                        <div className="text-sm text-gray-400">EV / Edge</div>
                        <div className="mt-2 text-2xl font-bold">
                          <span className="text-emerald-400">
                            {formatPercent(pick.ev)}
                          </span>
                          <span className="mx-2 text-gray-500">/</span>
                          <span className="text-blue-400">
                            {formatPercent(pick.edge)}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-4">
                        <div className="text-sm text-gray-400">Sportsbook</div>
                        <div className="mt-2 text-2xl font-bold text-white">
                          {pick.sportsbook || '--'}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-4">
                        <div className="text-sm text-gray-400">Stake</div>
                        <div className="mt-2 text-2xl font-bold text-white">
                          {pick.stake ?? '--'}
                          {pick.stake !== null && pick.stake !== undefined
                            ? 'u'
                            : ''}
                        </div>
                      </div>

                      <div className="col-span-2 rounded-2xl border border-white/5 bg-white/[0.04] p-4">
                        <div className="text-sm text-gray-400">Play Rating</div>
                        <div className="mt-3">
                          <span className={getBadgeClasses(pick.play_rating)}>
                            {pick.play_rating || '--'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {pick.analysis ? (
                      <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-4">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                          Model Notes
                        </div>
                        <p className="text-base leading-8 text-gray-300">
                          {pick.analysis}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
