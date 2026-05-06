import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type PickRow = {
  id: string;
  created_at: string;
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: string | number | null;
  stake: number | null;
  result: string | null;
  analysis?: string | null;
  sportsbook?: string | null;
  sportsbook_key?: string | null;
  status?: string | null;
  commence_time?: string | null;
  market_type?: string | null;
  market_key?: string | null;
  selection_name?: string | null;
  fair_line?: number | null;
  model_probability?: number | null;
  implied_probability?: number | null;
  edge?: number | null;
  ev?: number | null;
  play_rating?: string | null;
  max_play?: boolean | null;
  pick_type?: string | null;
  is_live?: boolean | null;
};

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(url, anon);
}

function formatAmericanOdds(odds: number | null | undefined) {
  if (typeof odds !== 'number' || Number.isNaN(odds)) return '—';
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatPercent(value: number | null | undefined, digits = 2) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

function formatUnits(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${value}u`;
}

function getMarketBadge(pick: PickRow) {
  if (pick.market_type === 'spread') return 'Spread';
  if (pick.market_type === 'total') return 'Total';
  return 'ML';
}

function getRatingLabel(pick: PickRow) {
  if (pick.max_play || pick.play_rating === 'MAX') return 'MAX';
  if (pick.play_rating === 'A') return 'A';
  if (pick.play_rating === 'B') return 'B';
  return 'C';
}

function getRatingClasses(pick: PickRow) {
  const rating = getRatingLabel(pick);

  if (rating === 'MAX') {
    return 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300';
  }
  if (rating === 'A') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  }
  if (rating === 'B') {
    return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300';
  }
  return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
}

function getSportColor(sport?: string | null) {
  if (sport === 'MLB') return 'text-emerald-400';
  if (sport === 'NBA') return 'text-orange-400';
  if (sport === 'NHL') return 'text-cyan-400';
  return 'text-white';
}

function formatGameTime(value?: string | null) {
  if (!value) return 'TBD';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'TBD';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Phoenix',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

async function getPicks(): Promise<PickRow[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('picks')
    .select('*')
    .eq('status', 'pregame')
    .eq('result', 'pending')
    .order('max_play', { ascending: false })
    .order('ev', { ascending: false })
    .order('edge', { ascending: false })
    .limit(24);

  if (error) {
    console.error('Supabase picks fetch error:', error.message);
    return [];
  }

  return (data as PickRow[]) || [];
}

function EmptyState() {
  return (
    <div className="rounded-[28px] border border-white/10 bg-[#050816] p-8 text-white">
      <h2 className="text-2xl font-bold">No pregame picks right now</h2>
      <p className="mt-3 max-w-2xl text-white/60">
        No plays passed your current filters. That usually means the board is
        being selective, not broken.
      </p>
    </div>
  );
}

function PickCard({ pick }: { pick: PickRow }) {
  const ratingLabel = getRatingLabel(pick);

  return (
    <div
      className={`rounded-[28px] border bg-[#040816] p-6 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.03)] transition ${
        pick.max_play || pick.play_rating === 'MAX'
          ? 'border-yellow-500/40'
          : 'border-white/10'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className={`text-lg font-semibold ${getSportColor(pick.sport)}`}>
          {pick.sport || '—'}
        </div>
        <div className="text-sm text-sky-300">
          {pick.pick_type || pick.status || 'Pregame'}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-sm text-blue-300">
          {getMarketBadge(pick)}
        </span>

        <span
          className={`rounded-full border px-3 py-1 text-sm font-semibold ${getRatingClasses(
            pick
          )}`}
        >
          {ratingLabel}
        </span>
      </div>

      <div className="mt-6">
        <h2 className="text-[26px] font-bold leading-tight">{pick.game}</h2>
        <div className="mt-3 text-[24px] font-semibold">{pick.pick}</div>
        <div className="mt-3 text-[18px] text-white/65">
          {formatGameTime(pick.commence_time)}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6">
        <div>
          <div className="text-[15px] text-white/65">Best Odds</div>
          <div className="mt-1 text-[30px] font-bold">
            {formatAmericanOdds(pick.odds)}
          </div>
        </div>

        <div>
          <div className="text-[15px] text-white/65">Fair Line</div>
          <div className="mt-1 text-[30px] font-bold">
            {formatAmericanOdds(pick.fair_line)}
          </div>
        </div>

        <div>
          <div className="text-[15px] text-white/65">Confidence</div>
          <div className="mt-1 text-[26px] font-bold">
            {pick.confidence !== null && pick.confidence !== undefined
              ? `${pick.confidence}%`
              : '—'}
          </div>
        </div>

        <div>
          <div className="text-[15px] text-white/65">EV / Edge</div>
          <div className="mt-1 text-[22px] font-bold text-cyan-400">
            {formatPercent(pick.ev)} / {formatPercent(pick.edge)}
          </div>
        </div>

        <div>
          <div className="text-[15px] text-white/65">Book</div>
          <div className="mt-1 text-[26px] font-bold">
            {pick.sportsbook || '—'}
          </div>
        </div>

        <div>
          <div className="text-[15px] text-white/65">Stake</div>
          <div className="mt-1 text-[26px] font-bold">
            {formatUnits(pick.stake)}
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-white/10 pt-7">
        <p className="text-[17px] leading-9 text-white/70">
          {pick.analysis || 'No analysis available.'}
        </p>
      </div>
    </div>
  );
}

export default async function PicksPage() {
  const picks = await getPicks();

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-6">
        <div className="mb-10">
          <h1 className="text-5xl font-bold tracking-tight">Pregame Picks</h1>
          <p className="mt-3 text-lg text-white/55">
            Best available pregame value plays ranked by edge, EV, and rating.
          </p>
        </div>

        {picks.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
            {picks.map((pick) => (
              <PickCard key={pick.id} pick={pick} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
