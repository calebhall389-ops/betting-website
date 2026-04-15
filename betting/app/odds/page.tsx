'use client';

import { useEffect, useMemo, useState } from 'react';
import OddsTable from '@/components/odds-table';
import { cn } from '@/lib/utils';
import { Filter } from 'lucide-react';

type ApiSport = {
  key: string;
  group: string;
  title: string;
  active: boolean;
};

type OddsPageRow = {
  id: string;
  sport: string;
  event: string;
  market: string;
  book: string;
  line: string;
  price: string;
  commenceTime: string;
};

export default function OddsPage() {
  const [sports, setSports] = useState<ApiSport[]>([]);
  const [selectedSport, setSelectedSport] = useState<string>('All');
  const [odds, setOdds] = useState<OddsPageRow[]>([]);
  const [sportsLoading, setSportsLoading] = useState(true);
  const [oddsLoading, setOddsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSports() {
      try {
        setSportsLoading(true);
        setError(null);

        const res = await fetch('/api/sports', { cache: 'no-store' });
        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to load sports');
        }

        const loadedSports = (json.sports as ApiSport[]) ?? [];
        setSports(loadedSports);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sports');
      } finally {
        setSportsLoading(false);
      }
    }

    loadSports();
  }, []);

  useEffect(() => {
    async function loadOdds() {
      try {
        setOddsLoading(true);
        setError(null);

        if (selectedSport === 'All') {
          const activeSports = sports.filter((sport) => sport.active).slice(0, 12);

          const results = await Promise.all(
            activeSports.map(async (sport) => {
              const res = await fetch(
                `/api/odds?sport=${encodeURIComponent(sport.key)}`,
                { cache: 'no-store' }
              );
              const json = await res.json();

              if (!res.ok || !json.success) {
                return [];
              }

              return normalizeOdds(json.data, sport.title);
            })
          );

          setOdds(results.flat());
          return;
        }

        const res = await fetch(
          `/api/odds?sport=${encodeURIComponent(selectedSport)}`,
          { cache: 'no-store' }
        );
        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to load odds');
        }

        const sportTitle =
          sports.find((s) => s.key === selectedSport)?.title ?? selectedSport;

        setOdds(normalizeOdds(json.data, sportTitle));
      } catch (err) {
        setOdds([]);
        setError(err instanceof Error ? err.message : 'Failed to load odds');
      } finally {
        setOddsLoading(false);
      }
    }

    if (!sportsLoading && sports.length > 0) {
      loadOdds();
    }
  }, [selectedSport, sports, sportsLoading]);

  const sportButtons = useMemo(
    () => [
      { key: 'All', title: 'All' },
      ...sports.map((sport) => ({
        key: sport.key,
        title: sport.title,
      })),
    ],
    [sports]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Live Odds</h1>
        <p className="mt-1 text-sm text-slate-500">
          Spreads, moneylines, and totals across all available sports
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <Filter size={12} /> Sport:
        </span>

        {sportsLoading ? (
          <div className="text-sm text-slate-400">Loading sports...</div>
        ) : (
          sportButtons.map((s) => (
            <button
              key={s.key}
              onClick={() => setSelectedSport(s.key)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                selectedSport === s.key
                  ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400'
                  : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              )}
            >
              {s.title}
            </button>
          ))
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {oddsLoading ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
          Loading odds...
        </div>
      ) : (
        <OddsTable odds={odds} />
      )}
    </div>
  );
}

function normalizeOdds(apiData: any[], sportTitle: string): OddsPageRow[] {
  if (!Array.isArray(apiData)) return [];

  const rows: OddsPageRow[] = [];

  for (const game of apiData) {
    const homeTeam = game.home_team ?? 'Home Team';
    const awayTeam = game.away_team ?? 'Away Team';
    const event = `${awayTeam} @ ${homeTeam}`;
    const commenceTime = game.commence_time
      ? new Date(game.commence_time).toLocaleString()
      : '-';

    for (const bookmaker of game.bookmakers ?? []) {
      for (const market of bookmaker.markets ?? []) {
        for (const outcome of market.outcomes ?? []) {
          let line = outcome.name ?? '-';

          if (typeof outcome.point === 'number') {
            line += ` ${outcome.point > 0 ? '+' : ''}${outcome.point}`;
          }

          rows.push({
            id: `${game.id}-${bookmaker.key}-${market.key}-${outcome.name}`,
            sport: sportTitle,
            event,
            market: formatMarketName(market.key),
            book: bookmaker.title ?? bookmaker.key ?? '-',
            line,
            price:
              typeof outcome.price === 'number'
                ? outcome.price > 0
                  ? `+${outcome.price}`
                  : `${outcome.price}`
                : '-',
            commenceTime,
          });
        }
      }
    }
  }

  return rows;
}

function formatMarketName(market: string) {
  switch (market) {
    case 'h2h':
      return 'Moneyline';
    case 'spreads':
      return 'Spread';
    case 'totals':
      return 'Total';
    default:
      return market;
  }
}
