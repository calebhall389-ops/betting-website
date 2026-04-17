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
  edge?: number | null;
  ev?: number | null;
  play_rating?: string | null;
  game_date?: string | null;
  status?: string | null;
};

const DISPLAY_TIMEZONE = 'America/Phoenix';

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      'Missing Supabase environment variables'
    );
  }

  return createClient(url, anon);
}

function getDateKeyInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatOdds(odds: number) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatPercent(value?: number | null) {
  if (typeof value !== 'number') return '0%';
  return `${value}%`;
}

function formatConfidence(value: string | number) {
  if (typeof value === 'number') return `${value}%`;
  return `${value}%`;
}

export default async function PicksPage() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('picks')
    .select(
      'id, created_at, sport, game, pick, odds, confidence, stake, result, analysis, sportsbook, edge, ev, play_rating, game_date, status'
    )
    .eq('status', 'pending')
    .order('game_date', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const picks = (data ?? []) as PickRow[];

  const now = new Date();

  const todayKey = getDateKeyInTimeZone(now, DISPLAY_TIMEZONE);

  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowKey = getDateKeyInTimeZone(tomorrow, DISPLAY_TIMEZONE);

  const todaysPicks = picks.filter((pick) => {
    if (!pick.game_date) return false;
    return (
      getDateKeyInTimeZone(new Date(pick.game_date), DISPLAY_TIMEZONE) ===
      todayKey
    );
  });

  const tomorrowsPicks = picks.filter((pick) => {
    if (!pick.game_date) return false;
    return (
      getDateKeyInTimeZone(new Date(pick.game_date), DISPLAY_TIMEZONE) ===
      tomorrowKey
    );
  });

  return (
    <main className="min-h-screen bg-[#020817] text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">

        {/* HEADER */}
        <div className="mb-12">
          <h1 className="text-5xl font-bold tracking-tight">Sharp Picks</h1>

          <p className="mt-3 text-lg text-gray-400">
            Official model-generated moneyline plays for today and tomorrow.
          </p>

          <p className="mt-2 text-sm text-gray-500">
            Picks update as market odds move and may appear or disappear throughout the day.
          </p>

          {/* 🔥 LAST UPDATED */}
          <p className="mt-2 text-sm text-gray-500">
            Last updated: {formatTime(now, DISPLAY_TIMEZONE)} (Arizona time)
          </p>
        </div>

        {/* TODAY */}
        <section className="mb-14">
          <h2 className="mb-5 text-3xl font-semibold">Today&apos;s Picks</h2>

          {todaysPicks.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-gray-400">
              No sharp plays found today.
            </div>
          ) : (
            <div className="space-y-5">
              {todaysPicks.map((pick) => (
                <div
                  key={pick.id}
                  className="rounded-3xl border border-white/10 bg-[#061028] p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-2xl font-semibold">{pick.pick}</h3>
                      <p className="mt-1 text-gray-400">{pick.game}</p>

                      <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-300">
                        <span>{pick.sport}</span>
                        <span>{pick.sportsbook ?? '—'}</span>
                        <span>{formatOdds(pick.odds)}</span>
                        <span>Edge: {formatPercent(pick.edge)}</span>
                        <span>EV: {formatPercent(pick.ev)}</span>
                        <span>Confidence: {formatConfidence(pick.confidence)}</span>
                      </div>

                      {pick.analysis && (
                        <p className="mt-4 text-gray-300">{pick.analysis}</p>
                      )}
                    </div>

                    <div className="rounded-full border border-white/15 px-4 py-2 text-sm">
                      {pick.play_rating ?? 'PLAY'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* TOMORROW */}
        <section>
          <h2 className="mb-5 text-3xl font-semibold">Tomorrow&apos;s Picks</h2>

          {tomorrowsPicks.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-gray-400">
              Tomorrow&apos;s lines are still developing. Check back later.
            </div>
          ) : (
            <div className="space-y-5">
              {tomorrowsPicks.map((pick) => (
                <div
                  key={pick.id}
                  className="rounded-3xl border border-white/10 bg-[#061028] p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-2xl font-semibold">{pick.pick}</h3>
                      <p className="mt-1 text-gray-400">{pick.game}</p>

                      <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-300">
                        <span>{pick.sport}</span>
                        <span>{pick.sportsbook ?? '—'}</span>
                        <span>{formatOdds(pick.odds)}</span>
                        <span>Edge: {formatPercent(pick.edge)}</span>
                        <span>EV: {formatPercent(pick.ev)}</span>
                        <span>Confidence: {formatConfidence(pick.confidence)}</span>
                      </div>

                      {pick.analysis && (
                        <p className="mt-4 text-gray-300">{pick.analysis}</p>
                      )}
                    </div>

                    <div className="rounded-full border border-white/15 px-4 py-2 text-sm">
                      {pick.play_rating ?? 'PLAY'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
