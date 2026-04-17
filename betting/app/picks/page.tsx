import { Target } from 'lucide-react';

type Pick = {
  id: string;
  created_at: string;
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence?: string | number | null;
  analysis?: string | null;
  sportsbook?: string | null;
  result?: string | null;
  edge?: number | null;
  ev?: number | null;
  stake?: number | null;
  pick_type?: string | null;
};

async function getPregamePicks(): Promise<Pick[]> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  const res = await fetch(`${baseUrl}/api/picks`, {
    cache: 'no-store',
  });

  const json = await res.json();
  return json?.picks ?? [];
}

function formatOdds(odds: number) {
  if (odds > 0) return `+${odds}`;
  return `${odds}`;
}

export default async function PicksPage() {
  const picks = await getPregamePicks();

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-2xl bg-white/10 p-3">
            <Target size={22} />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Pregame Picks</h1>
            <p className="text-white/70">
              Model-approved pregame bets for today and tomorrow.
            </p>
          </div>
        </div>

        {picks.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">
            No pregame picks available right now.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {picks.map((pick) => (
              <div
                key={pick.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-emerald-400">
                      {pick.sport}
                    </div>
                    <h2 className="mt-1 text-lg font-semibold">{pick.game}</h2>
                  </div>
                  <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-300">
                    Pregame
                  </span>
                </div>

                <div className="mb-3 text-xl font-bold">{pick.pick}</div>

                <div className="grid grid-cols-2 gap-3 text-sm text-white/80">
                  <div className="rounded-xl bg-white/5 p-3">
                    <div className="text-white/50">Odds</div>
                    <div className="mt-1 font-semibold">
                      {formatOdds(pick.odds)}
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/5 p-3">
                    <div className="text-white/50">Confidence</div>
                    <div className="mt-1 font-semibold">
                      {pick.confidence ?? '—'}
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/5 p-3">
                    <div className="text-white/50">Sportsbook</div>
                    <div className="mt-1 font-semibold">
                      {pick.sportsbook ?? '—'}
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/5 p-3">
                    <div className="text-white/50">EV / Edge</div>
                    <div className="mt-1 font-semibold">
                      {pick.ev != null ? `${pick.ev.toFixed(2)}%` : '—'} /{' '}
                      {pick.edge != null ? `${pick.edge.toFixed(2)}%` : '—'}
                    </div>
                  </div>
                </div>

                {pick.analysis && (
                  <p className="mt-4 text-sm leading-6 text-white/75">
                    {pick.analysis}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
