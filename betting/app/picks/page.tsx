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

  return createClient(url!, anon!);
}

function formatOdds(odds: number) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatTime(dateString?: string | null) {
  if (!dateString) return 'TBD';

  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function getPicks(): Promise<PickRow[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('picks')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error(error);
    return [];
  }

  return data as PickRow[];
}

function PickCard({ pick }: { pick: PickRow }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex justify-between mb-3">
        <div>
          <p className="text-xs text-zinc-500">{pick.sport}</p>
          <h2 className="text-lg font-semibold">{pick.pick}</h2>
          <p className="text-sm text-zinc-400">{pick.game}</p>
        </div>

        <span
          className={`px-2 py-1 text-xs rounded-full ${
            pick.is_live
              ? 'bg-red-500/20 text-red-400'
              : 'bg-emerald-500/20 text-emerald-400'
          }`}
        >
          {pick.is_live ? 'LIVE' : 'PRE'}
        </span>
      </div>

      <p className="text-xl font-bold">{formatOdds(pick.odds)}</p>

      {pick.previous_odds !== null && (
        <p className="text-xs text-zinc-400 mt-1">
          Prev: {formatOdds(pick.previous_odds!)} | Move:{' '}
          {pick.line_movement}
        </p>
      )}

      <p className="text-sm mt-2 text-zinc-300">{pick.analysis}</p>

      <div className="text-xs text-zinc-500 mt-3">
        {formatTime(pick.commence_time)}
      </div>
    </div>
  );
}

export default async function PicksPage() {
  const allPicks = await getPicks();

  const livePicks = allPicks.filter((p) => p.is_live);
  const mainPicks = allPicks.filter((p) => !p.is_live);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white p-6">
      <h1 className="text-3xl font-bold mb-6">Picks</h1>

      {/* 🔥 LIVE PICKS */}
      <h2 className="text-xl font-semibold mb-3 text-red-400">
        🔥 Live Picks
      </h2>

      {livePicks.length === 0 ? (
        <p className="text-zinc-500 mb-6">No live picks right now</p>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mb-10">
          {livePicks.map((pick) => (
            <PickCard key={pick.id} pick={pick} />
          ))}
        </div>
      )}

      {/* 🎯 MAIN PICKS */}
      <h2 className="text-xl font-semibold mb-3 text-emerald-400">
        🎯 Main Picks
      </h2>

      {mainPicks.length === 0 ? (
        <p className="text-zinc-500">No main picks available</p>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {mainPicks.map((pick) => (
            <PickCard key={pick.id} pick={pick} />
          ))}
        </div>
      )}
    </main>
  );
}
