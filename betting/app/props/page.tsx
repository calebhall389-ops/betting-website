import { createClient } from '@supabase/supabase-js';
import PropCard from '@/components/prop-card';

export const dynamic = 'force-dynamic';

type SearchParams = {
  sport?: string;
  pick?: string;
  rating?: string;
  sort?: string;
};

type PropRow = {
  id: string;
  created_at: string;
  sport: string;
  game: string;
  player: string;
  market: string;
  line: number;
  pick_type: 'over' | 'under';
  over_odds: number | null;
  under_odds: number | null;
  best_odds: number;
  best_book: string;
  ev: number;
  edge: number;
  confidence: number | string;
  analysis: string | null;
  play_rating?: string | null;
  top_play?: boolean | null;
  books_compared?: number | null;
  implied_probability?: number | null;
  event_date?: string | null;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(url, anon);
}

function FilterButton({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <a
      href={href}
      className={`rounded-xl border px-4 py-2 text-sm transition ${
        active
          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
          : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-600'
      }`}
    >
      {label}
    </a>
  );
}

function buildHref(params: {
  sport?: string;
  pick?: string;
  rating?: string;
  sort?: string;
}) {
  const search = new URLSearchParams();

  if (params.sport && params.sport !== 'all') search.set('sport', params.sport);
  if (params.pick && params.pick !== 'all') search.set('pick', params.pick);
  if (params.rating && params.rating !== 'all') search.set('rating', params.rating);
  if (params.sort && params.sort !== 'ev') search.set('sort', params.sort);

  const qs = search.toString();
  return qs ? `/props?${qs}` : '/props';
}

function startOfTodayLocal() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

function endOfTomorrowLocal() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString();
}

export default async function PropsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) || {};

  const sport = (params.sport || 'all').toUpperCase();
  const pick = (params.pick || 'all').toLowerCase();
  const rating = (params.rating || 'all').toUpperCase();
  const sort = (params.sort || 'ev').toLowerCase();

  const supabase = getSupabase();

  let query = supabase
    .from('props')
    .select('*')
    .gte('event_date', startOfTodayLocal())
    .lt('event_date', endOfTomorrowLocal());

  if (sport !== 'ALL') query = query.eq('sport', sport);
  if (pick !== 'all') query = query.eq('pick_type', pick);
  if (rating !== 'ALL') query = query.eq('play_rating', rating);

  if (sort === 'edge') query = query.order('edge', { ascending: false });
  else if (sort === 'odds') query = query.order('best_odds', { ascending: false });
  else if (sort === 'confidence') query = query.order('confidence', { ascending: false });
  else if (sort === 'date') query = query.order('event_date', { ascending: true });
  else query = query.order('ev', { ascending: false });

  const { data, error } = await query.limit(60);

  if (error) {
    return (
      <main className="min-h-screen bg-[#020817] px-6 py-16 text-white">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-4 text-4xl font-bold">Player Props</h1>
          <p className="text-rose-400">Failed to load props: {error.message}</p>
        </div>
      </main>
    );
  }

  const props = (data || []) as PropRow[];

  return (
    <main className="min-h-screen bg-[#020817] px-6 py-12 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight">Player Props</h1>
          <p className="mt-2 text-slate-400">
            Real value props from major books, ranked by edge and EV
          </p>
        </div>

        <div className="mb-8 space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-400">Sport:</span>
            {['all', 'NFL', 'NBA', 'MLB', 'NHL'].map((item) => (
              <FilterButton
                key={item}
                label={item.toUpperCase()}
                href={buildHref({
                  sport: item,
                  pick,
                  rating,
                  sort,
                })}
                active={sport === item.toUpperCase()}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-400">Pick:</span>
            {['all', 'over', 'under'].map((item) => (
              <FilterButton
                key={item}
                label={item.charAt(0).toUpperCase() + item.slice(1)}
                href={buildHref({
                  sport,
                  pick: item,
                  rating,
                  sort,
                })}
                active={pick === item}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-400">Grade:</span>
            {['all', 'A+', 'A', 'B', 'C'].map((item) => (
              <FilterButton
                key={item}
                label={item}
                href={buildHref({
                  sport,
                  pick,
                  rating: item,
                  sort,
                })}
                active={rating === item.toUpperCase()}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-400">Sort:</span>
            {[
              ['ev', 'Highest EV'],
              ['edge', 'Highest Edge'],
              ['odds', 'Best Odds'],
              ['confidence', 'Confidence'],
              ['date', 'Game Time'],
            ].map(([value, label]) => (
              <FilterButton
                key={value}
                label={label}
                href={buildHref({
                  sport,
                  pick,
                  rating,
                  sort: value,
                })}
                active={sort === value}
              />
            ))}
          </div>
        </div>

        {props.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-400">
            No qualifying props found for the selected filters.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {props.map((prop) => (
              <PropCard key={prop.id} prop={prop} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
