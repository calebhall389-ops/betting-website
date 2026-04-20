import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type PickRow = {
  id: string;
  created_at: string;
  sport: string;
  game: string;
  pick: string;
  odds: number;
  best_odds?: number | null;
  implied_odds?: number | null;
  confidence: string | number;
  stake: number;
  result: string;
  analysis?: string | null;
  sportsbook?: string | null;
  edge?: number | null;
  ev?: number | null;
  play_rating?: string | null;
  status?: string | null;
  pick_type?: string | null;
  market_type?: 'moneyline' | 'spread' | 'total' | 'h2h' | 'spreads' | 'totals' | string | null;
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

function formatAmericanOdds(odds?: number | null) {
  if (typeof odds !== 'number' || Number.isNaN(odds)) return '—';
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatPercent(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${value.toFixed(2)}%`;
}

function formatConfidence(value?: string | number | null) {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(num)) return '—';
  return `${Math.round(num)}%`;
}

function formatGameTime(value?: string | null) {
  if (!value) return 'TBD';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'TBD';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getSportBadgeClasses(sport: string) {
  if (sport === 'MLB') return 'text-emerald-400';
  if (sport === 'NBA') return 'text-orange-400';
  if (sport === 'NHL') return 'text-cyan-400';
  if (sport === 'NFL') return 'text-lime-400';
  if (sport === 'NCAAB') return 'text-violet-400';
  return 'text-blue-400';
}

function getMarketBadgeLabel(marketType?: string | null) {
  if (marketType === 'h2h' || marketType === 'moneyline') return 'ML';
  if (marketType === 'spreads' || marketType === 'spread') return 'SPREAD';
  if (marketType === 'totals' || marketType === 'total') return 'TOTAL';
  return 'PICK';
}

function getMarketBadgeClasses(marketType?: string | null) {
  if (marketType === 'h2h' || marketType === 'moneyline') {
    return 'border border-blue-500/30 bg-blue-500/10 text-blue-300';
  }

  if (marketType === 'spreads' || marketType === 'spread') {
    return 'border border-violet-500/30 bg-violet-500/10 text-violet-300';
  }

  if (marketType === 'totals' || marketType === 'total') {
    return 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
  }

  return 'border border-white/10 bg-white/5 text-white/70';
}

function getRatingBadgeClasses(rating?: string | null) {
  if (rating === 'A+' || rating === 'A' || rating === 'A PLAY') {
    return 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  }

  if (rating === 'B+' || rating === 'B' || rating === 'B PLAY') {
    return 'border border-sky-500/30 bg-sky-500/10 text-sky-300';
  }

  if (rating === 'C' || rating === 'LEAN') {
    return 'border border-yellow-500/30 bg-yellow-500/10 text-yellow-300';
  }

  return 'border border-white/10 bg-white/5 text-white/70';
}

async function getPicks(): Promise<PickRow[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('picks')
    .select(
      `
        id,
        created_at,
        sport,
        game,
        pick,
        odds,
        best_odds,
        implied_odds,
        confidence,
        stake,
        result,
        analysis,
        sportsbook,
        edge,
        ev,
        play_rating,
        status,
        pick_type,
        market_type,
        commence_time
      `
    )
    .eq('pick_type', 'pregame')
    .eq('status', 'open')
    .order('ev', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('SUPABASE PICKS ERROR:', error);
    return [];
  }

  return (data || []) as PickRow[];
}

export default async function PicksPage() {
  const picks = await getPicks();

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight">Pregame Picks</h1>
        </div>

        {!picks.length ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-white/70">
            No pregame picks available right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {picks.map((pick) => (
              <div
                key={pick.id}
                className="rounded-3xl border border-white/10 bg-[#05070b] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div
                      className={`text-sm font-semibold ${getSportBadgeClasses(
                        pick.sport
                      )}`}
                    >
                      {pick.sport}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getMarketBadgeClasses(
                          pick.market_type
                        )}`}
                      >
                        {getMarketBadgeLabel(pick.market_type)}
                      </span>

                      {pick.play_rating ? (
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getRatingBadgeClasses(
                            pick.play_rating
                          )}`}
                        >
                          {pick.play_rating}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-sm text-blue-300">Pregame</div>
                </div>

                <div className="mb-2 text-2xl font-bold leading-tight">
                  {pick.game}
                </div>

                <div className="mb-2 text-2xl font-semibold leading-tight text-white">
                  {pick.pick}
                </div>

                <div className="mb-8 text-lg text-white/60">
                  {formatGameTime(pick.commence_time)}
                </div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                  <div>
                    <div className="text-sm text-white/55">Best Odds</div>
                    <div className="text-3xl font-bold">
                      {formatAmericanOdds(
                        typeof pick.best_odds === 'number'
                          ? pick.best_odds
                          : pick.odds
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-white/55">Fair Line</div>
                    <div className="text-3xl font-bold">
                      {formatAmericanOdds(pick.implied_odds)}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-white/55">Confidence</div>
                    <div className="text-2xl font-semibold">
                      {formatConfidence(pick.confidence)}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-white/55">EV / Edge</div>
                    <div className="text-2xl font-semibold text-cyan-400">
                      {formatPercent(pick.ev)} /{' '}
                      <span className="text-blue-400">
                        {formatPercent(pick.edge)}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-white/55">Book</div>
                    <div className="text-2xl font-semibold">
                      {pick.sportsbook || '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-white/55">Stake</div>
                    <div className="text-2xl font-semibold">
                      {typeof pick.stake === 'number' ? `${pick.stake}u` : '—'}
                    </div>
                  </div>
                </div>

                <div className="mb-5 mt-6">
                  <div className="h-px w-full bg-white/10" />
                </div>

                <div className="text-lg leading-9 text-white/70">
                  {pick.analysis || 'No analysis available.'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
