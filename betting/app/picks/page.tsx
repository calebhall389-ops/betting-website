import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type PickRow = {
  id: string;
  created_at: string;
  pick_date: string;
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: string | number;
  stake: number;
  result: string;
  analysis?: string | null;
  sportsbook?: string | null;
  play_rating?: string | null;
  edge?: number | null;
  ev?: number | null;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  return createClient(url, anon);
}

function getArizonaYmd(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDaysYmd(base: Date, days: number) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return getArizonaYmd(d);
}

function formatOdds(odds: number) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function renderPickCard(pick: PickRow) {
  return (
    <div
      key={pick.id}
      className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-semibold text-white">{pick.pick}</div>
          <div className="text-sm text-zinc-400">{pick.game}</div>
        </div>

        <div className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-200">
          {pick.play_rating || 'PLAY'}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-sm text-zinc-300">
        <span>{pick.sport}</span>
        <span>{pick.sportsbook || 'Sportsbook N/A'}</span>
        <span>{formatOdds(pick.odds)}</span>
        {pick.edge !== null && pick.edge !== undefined ? (
          <span>Edge: {pick.edge}%</span>
        ) : null}
        {pick.ev !== null && pick.ev !== undefined ? (
          <span>EV: {pick.ev}%</span>
        ) : null}
        <span>Confidence: {pick.confidence}%</span>
      </div>

      {pick.analysis ? (
        <p className="mt-3 text-sm leading-6 text-zinc-300">{pick.analysis}</p>
      ) : null}
    </div>
  );
}

export default async function PicksPage() {
  const supabase = getSupabase();

  const now = new Date();
  const today = getArizonaYmd(now);
  const tomorrow = addDaysYmd(now, 1);

  const [{ data: todayPicks, error: todayError }, { data: tomorrowPicks, error: tomorrowError }] =
    await Promise.all([
      supabase
        .from('picks')
        .select('*')
        .eq('pick_date', today)
        .order('created_at', { ascending: false }),
      supabase
        .from('picks')
        .select('*')
        .eq('pick_date', tomorrow)
        .order('created_at', { ascending: false }),
    ]);

  if (todayError || tomorrowError) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-bold text-white">Picks</h1>
        <p className="mt-4 text-zinc-400">
          Failed to load picks right now.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white">Sharp Picks</h1>
        <p className="mt-2 text-zinc-400">
          Official model-generated moneyline plays for today and tomorrow.
        </p>
      </div>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-semibold text-white">Today’s Picks</h2>

        {!todayPicks?.length ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-zinc-400">
            No sharp plays found today.
          </div>
        ) : (
          <div className="grid gap-4">
            {(todayPicks as PickRow[]).map(renderPickCard)}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold text-white">Tomorrow’s Picks</h2>

        {!tomorrowPicks?.length ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-zinc-400">
            Tomorrow’s lines are still developing. Check back later tonight or in the morning.
          </div>
        ) : (
          <div className="grid gap-4">
            {(tomorrowPicks as PickRow[]).map(renderPickCard)}
          </div>
        )}
      </section>
    </main>
  );
}
