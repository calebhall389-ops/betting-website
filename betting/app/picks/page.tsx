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
  sportsbook_key?: string | null;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error('Missing Supabase public environment variables');
  }

  return createClient(url, anon);
}

function formatOdds(odds: number) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function getResultBadge(result: string) {
  switch (result) {
    case 'win':
      return 'bg-green-100 text-green-700';
    case 'loss':
      return 'bg-red-100 text-red-700';
    case 'push':
      return 'bg-gray-200 text-gray-700';
    case 'pending':
      return 'bg-yellow-100 text-yellow-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

function formatStake(stake: number) {
  return `${stake}u`;
}

function getStarCount(confidence: string | number) {
  const value = Number(confidence);

  if (Number.isNaN(value)) return 1;

  return Math.max(1, Math.min(5, Math.round(value)));
}

function renderStars(confidence: string | number) {
  const stars = getStarCount(confidence);

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          key={index}
          className={index < stars ? 'text-yellow-400' : 'text-slate-600'}
        >
          ★
        </span>
      ))}
      <span className="ml-2 text-slate-300 text-sm">{stars}/5</span>
    </div>
  );
}

export default async function PicksPage() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('picks')
    .select(
      'id, created_at, sport, game, pick, odds, confidence, stake, result, analysis, sportsbook, sportsbook_key'
    )
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-white">Expert Picks</h1>
        <p className="mt-3 text-red-400">
          Error loading picks: {error.message}
        </p>
      </main>
    );
  }

  const picks = (data ?? []) as PickRow[];

  const wins = picks.filter((pick) => pick.result === 'win').length;
  const losses = picks.filter((pick) => pick.result === 'loss').length;
  const graded = wins + losses;
  const winRate = graded > 0 ? ((wins / graded) * 100).toFixed(1) : '0.0';

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Expert Picks</h1>
        <p className="mt-2 text-sm text-slate-400">
          {wins} W - {losses} L · {winRate}% Win Rate · Live picks from your
          database
        </p>
      </div>

      <div className="grid gap-4">
        {picks.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
            No picks found yet.
          </div>
        ) : (
          picks.map((pick) => (
            <div
              key={pick.id}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-sm"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-300">
                  {pick.sport}
                </span>

                <span
                  className={`rounded-md px-2 py-1 text-xs font-semibold capitalize ${getResultBadge(
                    pick.result
                  )}`}
                >
                  {pick.result}
                </span>
              </div>

              <p className="text-sm text-slate-400">{pick.game}</p>

              <h2 className="mt-1 text-xl font-bold text-white">
                {pick.pick}
              </h2>

              <p className="mt-2 text-sm text-slate-300">
                Sportsbook: {pick.sportsbook ?? '-'}
              </p>

              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <span className="font-semibold text-emerald-400">
                  {formatOdds(Number(pick.odds))}
                </span>

                <span className="text-slate-300">
                  Stake: {formatStake(Number(pick.stake))}
                </span>

                <span className="text-slate-500">
                  {new Date(pick.created_at).toLocaleDateString()}
                </span>
              </div>

              <div className="mt-3">{renderStars(pick.confidence)}</div>

              {pick.analysis && (
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  {pick.analysis}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  );
}
