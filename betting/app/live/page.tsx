import { Activity, Clock3, TrendingUp, BadgeDollarSign } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type LivePick = {
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
  market_type?: string | null;
  status?: string | null;
  implied_odds?: number | null;
  fair_odds?: number | null;
  best_odds?: number | null;
  commence_time?: string | null;
};

async function getLivePicks(): Promise<LivePick[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('picks')
    .select('*')
    .eq('status', 'live')
    .order('created_at', { ascending: false })
    .limit(24);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as LivePick[];
}

function formatOdds(odds: number | null | undefined) {
  if (odds == null) return '—';
  if (odds > 0) return `+${odds}`;
  return `${odds}`;
}

function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(2)}%`;
}

function formatConfidence(value: string | number | null | undefined) {
  if (value == null || value === '') return '—';
  return `${value}`;
}

function formatUpdatedTime(dateString: string | null | undefined) {
  if (!dateString) return '—';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes === 1) return '1 min ago';
  if (diffMinutes < 60) return `${diffMinutes} mins ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours === 1) return '1 hr ago';
  return `${diffHours} hrs ago`;
}

function formatGameTime(dateString: string | null | undefined) {
  if (!dateString) return '—';

  const date = new Date(dateString);

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getTopPickId(picks: LivePick[]) {
  if (!picks.length) return null;

  const sorted = [...picks].sort((a, b) => {
    const aEv = a.ev ?? -999;
    const bEv = b.ev ?? -999;
    if (bEv !== aEv) return bEv - aEv;

    const aEdge = a.edge ?? -999;
    const bEdge = b.edge ?? -999;
    if (bEdge !== aEdge) return bEdge - aEdge;

    const aConfidence = Number(a.confidence ?? 0);
    const bConfidence = Number(b.confidence ?? 0);
    return bConfidence - aConfidence;
  });

  return sorted[0]?.id ?? null;
}

export default async function LivePage() {
  const picks = await getLivePicks();
  const topPickId = getTopPickId(picks);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-red-500/15 p-3 text-red-400">
              <Activity size={22} />
            </div>

            <div>
              <h1 className="text-3xl font-bold">Live Bets</h1>
              <p className="text-white/70">
                Real-time opportunities refreshed from your live board.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-white/50">
                Active Live Picks
              </div>
              <div className="mt-1 text-lg font-semibold">{picks.length}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-white/50">
                Refresh
              </div>
              <div className="mt-1 text-lg font-semibold">On page reload</div>
            </div>
          </div>
        </div>

        {picks.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-white/70">
            No live picks available right now.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {picks.map((pick) => {
              const isTopPick = pick.id === topPickId;

              return (
                <div
                  key={pick.id}
                  className={`rounded-2xl border p-5 shadow-lg transition ${
                    isTopPick
                      ? 'border-red-500/40 bg-gradient-to-br from-red-500/10 to-white/5'
                      : 'border-red-500/20 bg-white/5'
                  }`}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-red-400">
                          {pick.sport}
                        </span>

                        {isTopPick && (
                          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                            Top Live Play
                          </span>
                        )}
                      </div>

                      <h2 className="mt-1 text-lg font-semibold">{pick.game}</h2>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/55">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 size={12} />
                          Updated {formatUpdatedTime(pick.created_at)}
                        </span>

                        {pick.commence_time && (
                          <span>
                            • Started {formatGameTime(pick.commence_time)}
                          </span>
                        )}
                      </div>
                    </div>

                    <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-300">
                      LIVE
                    </span>
                  </div>

                  <div className="mb-4">
                    <div className="text-xl font-bold">{pick.pick}</div>
                    <div className="mt-1 text-sm text-white/60">
                      {pick.market_type
                        ? `${pick.market_type.charAt(0).toUpperCase()}${pick.market_type.slice(1)} market`
                        : 'Live market'}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm text-white/80">
                    <div className="rounded-xl bg-white/5 p-3">
                      <div className="text-white/50">Best Odds</div>
                      <div className="mt-1 font-semibold">
                        {formatOdds(pick.best_odds ?? pick.odds)}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white/5 p-3">
                      <div className="text-white/50">Sportsbook</div>
                      <div className="mt-1 font-semibold">
                        {pick.sportsbook ?? '—'}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white/5 p-3">
                      <div className="text-white/50">Confidence</div>
                      <div className="mt-1 font-semibold">
                        {formatConfidence(pick.confidence)}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white/5 p-3">
                      <div className="text-white/50">Stake</div>
                      <div className="mt-1 font-semibold">
                        {pick.stake != null ? `${pick.stake}u` : '—'}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white/5 p-3">
                      <div className="text-white/50">Implied Odds</div>
                      <div className="mt-1 font-semibold">
                        {formatPercent(pick.implied_odds)}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white/5 p-3">
                      <div className="text-white/50">Fair Odds</div>
                      <div className="mt-1 font-semibold">
                        {formatOdds(pick.fair_odds)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-emerald-300">
                        <TrendingUp size={14} />
                        Edge
                      </div>
                      <div className="mt-1 text-lg font-semibold text-emerald-200">
                        {formatPercent(pick.edge)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-3">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-sky-300">
                        <BadgeDollarSign size={14} />
                        EV
                      </div>
                      <div className="mt-1 text-lg font-semibold text-sky-200">
                        {formatPercent(pick.ev)}
                      </div>
                    </div>
                  </div>

                  {pick.analysis && (
                    <p className="mt-4 text-sm leading-6 text-white/75">
                      {pick.analysis}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
