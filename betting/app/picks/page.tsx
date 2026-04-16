import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type Pick = {
  id?: string;
  created_at?: string;
  sport?: string | null;
  game?: string | null;
  pick?: string | null;
  odds?: number | string | null;
  confidence?: string | number | null;
  stake?: number | string | null;
  result?: string | null;
  analysis?: string | null;
  edge?: number | null;
  ev?: number | null;
  sportsbook?: string | null;
  model_probability?: number | null;
  market_probability?: number | null;
};

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export default async function PicksPage() {
  let picks: Pick[] = [];
  let error: string | null = null;

  try {
    const supabase = getSupabase();

    const { data, error: supabaseError } = await supabase
      .from('picks')
      .select('*')
      .order('created_at', { ascending: false });

    if (supabaseError) {
      throw new Error(supabaseError.message);
    }

    picks = Array.isArray(data) ? data : [];
  } catch (err) {
    error = err instanceof Error ? err.message : 'Something went wrong';
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold mb-6">Picks</h1>

        {error && (
          <div className="rounded-xl border border-red-800 bg-red-950 p-4 text-red-200">
            Error: {error}
          </div>
        )}

        {!error && picks.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            No picks found.
          </div>
        )}

        <div className="grid gap-4">
          {picks.map((pick, index) => (
            <div
              key={pick.id ?? `${pick.game ?? 'game'}-${index}`}
              className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-zinc-400">
                    {pick.sport ?? 'Unknown Sport'}
                  </p>
                  <h2 className="text-xl font-semibold">
                    {pick.pick ?? 'Unknown Pick'}
                  </h2>
                  <p className="text-zinc-300">
                    {pick.game ?? 'Unknown Game'}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm text-zinc-400">Odds</p>
                  <p className="text-lg font-bold">{pick.odds ?? 'N/A'}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-zinc-800 p-3">
                  <p className="text-xs text-zinc-400">Confidence</p>
                  <p>{pick.confidence ?? 'N/A'}</p>
                </div>

                <div className="rounded-xl bg-zinc-800 p-3">
                  <p className="text-xs text-zinc-400">Stake</p>
                  <p>{pick.stake ?? 'N/A'}</p>
                </div>

                <div className="rounded-xl bg-zinc-800 p-3">
                  <p className="text-xs text-zinc-400">Result</p>
                  <p>{pick.result ?? 'pending'}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <div className="rounded-xl bg-zinc-800 p-3">
                  <p className="text-xs text-zinc-400">Sportsbook</p>
                  <p>{pick.sportsbook ?? 'N/A'}</p>
                </div>

                <div className="rounded-xl bg-zinc-800 p-3">
                  <p className="text-xs text-zinc-400">Edge</p>
                  <p>{pick.edge ?? 'N/A'}</p>
                </div>

                <div className="rounded-xl bg-zinc-800 p-3">
                  <p className="text-xs text-zinc-400">EV</p>
                  <p>{pick.ev ?? 'N/A'}</p>
                </div>

                <div className="rounded-xl bg-zinc-800 p-3">
                  <p className="text-xs text-zinc-400">Created</p>
                  <p>
                    {pick.created_at
                      ? new Date(pick.created_at).toLocaleString()
                      : 'N/A'}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-zinc-800 p-3">
                <p className="text-xs text-zinc-400 mb-1">Analysis</p>
                <p className="text-zinc-200">
                  {pick.analysis ?? 'No analysis available yet.'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
