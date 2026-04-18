import { createClient } from '@supabase/supabase-js';
import LocalGameTime from '@/components/LocalGameTime';

export const dynamic = 'force-dynamic';

type Pick = {
  id: string;
  sport: string;
  game: string;
  pick: string;
  odds: number;
  best_odds?: number | null;
  implied_odds?: number | null;
  confidence: string | number;
  analysis?: string | null;
  sportsbook?: string | null;
  edge?: number | null;
  ev?: number | null;
  play_rating?: string | null;
  stake?: number | null;
  mode?: string | null;
  commence_time?: string | null;
};

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function formatOdds(odds?: number | null) {
  if (!odds && odds !== 0) return '--';
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatPercent(val?: number | string | null, d = 2) {
  if (!val && val !== 0) return '--';
  return `${Number(val).toFixed(d)}%`;
}

function badge(play?: string | null) {
  switch (play) {
    case 'A PLAY':
      return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25';
    case 'B PLAY':
      return 'bg-blue-500/15 text-blue-300 border border-blue-500/25';
    case 'LEAN':
      return 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/25';
    default:
      return 'bg-white/10 text-gray-300 border border-white/10';
  }
}

function valuePts(best?: number | null, implied?: number | null) {
  if (!best || !implied) return null;
  return Math.abs(best - implied);
}

async function getPicks(): Promise<Pick[]> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data } = await supabase
    .from('picks')
    .select('*')
    .eq('mode', 'pregame')
    .gt('commence_time', now)
    .order('commence_time', { ascending: true });

  return (data as Pick[]) || [];
}

export default async function PicksPage() {
  const picks = await getPicks();

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-7xl mx-auto px-6 py-10">

        <h1 className="text-4xl font-bold mb-8">Pregame Picks</h1>

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {picks.map((p) => {
            const val = valuePts(p.best_odds, p.implied_odds);

            return (
              <div
                key={p.id}
                className="rounded-3xl bg-[#0e0e0f] border border-white/10 p-6 hover:border-white/20 transition"
              >

                {/* TOP BAR */}
                <div className="flex justify-between items-center mb-4">
                  <div className="text-emerald-400 text-sm font-semibold">
                    {p.sport}
                  </div>

                  <div className="text-xs px-3 py-1 rounded-full bg-blue-500/15 text-blue-300">
                    Pregame
                  </div>
                </div>

                {/* VALUE TAG */}
                {val && (
                  <div className="mb-3 text-xs text-emerald-300 bg-emerald-500/10 px-3 py-1 rounded-full inline-block">
                    {val} pts value
                  </div>
                )}

                {/* GAME */}
                <div className="text-2xl font-bold leading-tight">
                  {p.game}
                </div>

                {/* PICK */}
                <div className="text-2xl font-semibold mt-2 text-white">
                  {p.pick}
                </div>

                {/* TIME */}
                <div className="text-gray-400 text-sm mt-2">
                  <LocalGameTime value={p.commence_time} />
                </div>

                {/* ODDS ROW */}
                <div className="grid grid-cols-2 gap-4 mt-5">
                  <div>
                    <div className="text-gray-400 text-sm">Best Odds</div>
                    <div className="text-3xl font-bold">
                      {formatOdds(p.best_odds ?? p.odds)}
                    </div>
                  </div>

                  <div>
                    <div className="text-gray-400 text-sm">Fair Line</div>
                    <div className="text-3xl font-bold text-gray-300">
                      {formatOdds(p.implied_odds)}
                    </div>
                  </div>
                </div>

                {/* METRICS */}
                <div className="grid grid-cols-2 gap-4 mt-5 text-sm">
                  <div>
                    <div className="text-gray-400">Confidence</div>
                    <div className="text-xl font-bold">
                      {formatPercent(p.confidence, 0)}
                    </div>
                  </div>

                  <div>
                    <div className="text-gray-400">EV / Edge</div>
                    <div className="text-xl font-bold">
                      <span className="text-emerald-400">
                        {formatPercent(p.ev)}
                      </span>{' '}
                      /
                      <span className="text-blue-400 ml-1">
                        {formatPercent(p.edge)}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-gray-400">Book</div>
                    <div className="font-semibold">{p.sportsbook}</div>
                  </div>

                  <div>
                    <div className="text-gray-400">Stake</div>
                    <div className="font-semibold">{p.stake}u</div>
                  </div>
                </div>

                {/* RATING */}
                <div className="mt-5">
                  <span className={`px-3 py-1 text-sm rounded-full ${badge(p.play_rating)}`}>
                    {p.play_rating}
                  </span>
                </div>

                {/* NOTES */}
                {p.analysis && (
                  <div className="mt-5 text-sm text-gray-400 leading-6 border-t border-white/10 pt-4">
                    {p.analysis}
                  </div>
                )}

              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
