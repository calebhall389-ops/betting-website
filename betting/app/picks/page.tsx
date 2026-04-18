import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const DISPLAY_TIME_ZONE = 'America/Phoenix';

type Pick = {
  id: string;
  created_at: string;
  sport: string;
  game: string;
  pick: string;
  odds: number;
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
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    case 'B PLAY':
      return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
    case 'LEAN':
      return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
    default:
      return 'bg-white/10 text-gray-300 border border-white/10';
  }
}

function getModeBadgeClasses(mode?: string | null) {
  if (mode === 'pregame') {
    return 'bg-blue-500/20 text-blue-300';
  }

  if (mode === 'live') {
    return 'bg-red-500/20 text-red-300';
  }

  return 'bg-white/10 text-gray-300';
}

function formatCommenceTime(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
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
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-3xl">
            ◎
          </div>

          <div>
            <h1 className="text-4xl font-bold tracking-tight">Pregame Picks</h1>
            <p className="mt-2 text-lg text-gray-400">
              Model-approved pregame bets for upcoming games only.
            </p>
          </div>
        </div>

        {picks.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
            <h2 className="text-2xl font-semibold">No picks right now</h2>
            <p className="mt-3 text-gray-400">
              No qualifying pregame picks were found for upcoming games.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {picks.map((pick) => {
              const commence = formatCommenceTime(pick.commence_time);

              return (
                <article
                  key={pick.id}
                  className="rounded-3xl border border-white/10 bg-[#111111] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
                >
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-emerald-400">
                        {pick.sport || '--'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-sm font-medium ${getModeBadgeClasses(
                          pick.mode
                        )}`}
                      >
                        {pick.mode === 'pregame' ? 'Pregame' : pick.mode || '--'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h2 className="text-2xl font-semibold leading-snug">
                        {pick.game}
                      </h2>
                    </div>

                    <div>
                      <div className="text-2xl font-bold">{pick.pick}</div>
                    </div>

                    {commence ? (
                      <div className="text-sm text-gray-400">
                        Starts: {commence} MST
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-2xl bg-white/5 p-4">
                        <div className="text-sm text-gray-400">Odds</div>
                        <div className="mt-1 text-2xl font-semibold">
                          {formatOdds(pick.odds)}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white/5 p-4">
                        <div className="text-sm text-gray-400">Confidence</div>
                        <div className="mt-1 text-2xl font-semibold">
                          {formatPercent(pick.confidence, 0)}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white/5 p-4">
                        <div className="text-sm text-gray-400">Sportsbook</div>
                        <div className="mt-1 text-xl font-semibold">
                          {pick.sportsbook || '--'}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white/5 p-4">
                        <div className="text-sm text-gray-400">EV / Edge</div>
                        <div className="mt-1 text-xl font-semibold">
                          {formatPercent(pick.ev)} / {formatPercent(pick.edge)}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white/5 p-4">
                        <div className="text-sm text-gray-400">Play Rating</div>
                        <div className="mt-2">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${getBadgeClasses(
                              pick.play_rating
                            )}`}
                          >
                            {pick.play_rating || '--'}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white/5 p-4">
                        <div className="text-sm text-gray-400">Stake</div>
                        <div className="mt-1 text-xl font-semibold">
                          {pick.stake ?? '--'}
                          {pick.stake !== null && pick.stake !== undefined
                            ? 'u'
                            : ''}
                        </div>
                      </div>
                    </div>

                    {pick.analysis ? (
                      <div className="pt-1 text-base leading-8 text-gray-300">
                        {pick.analysis}
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
