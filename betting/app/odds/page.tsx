'use client';

import { useEffect, useMemo, useState } from 'react';
import OddsTable from '@/components/odds-table';
import { SPORT_NAME_MAP } from '@/lib/odds-api';
import { cn } from '@/lib/utils';
import { Filter } from 'lucide-react';

type ApiSport = {
  key: string;
  group: string;
  title: string;
  active: boolean;
  has_outrights?: boolean;
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

        const loadedSports = Array.isArray(json.sports) ? json.sports : [];
        setSports(loadedSports);

        if (loadedSports.length === 0) {
          setSelectedSport('All');
        }
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
          const activeSports = sports.length > 0 ? sports : [];

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

              return normalizeOdds(
                json.data,
                SPORT_NAME_MAP[sport.key] || sport.title
              );
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
          SPORT_NAME_MAP[selectedSport] ||
          sports.find((s) => s.key === selectedSport)?.title ||
          selectedSport;

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

    if (!sportsLoading && sports.length === 0) {
      setOdds([]);
    }
  }, [selectedSport, sports, sportsLoading]);

  const sportButtons = useMemo(
    () => [
      { key: 'All', title: 'All' },
      ...sports.map((sport) => ({
        key: sport.key,
        title: SPORT_NAME_MAP[sport.key] || sport.title,
      })),
    ],
    [sports]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Live Odds</h1>
        <p className="mt-1 text-sm text-slate-500">
          Live odds for NBA, NFL, NHL, MMA, Soccer, WNBA, Golf, and NASCAR
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

  for (const item of apiData) {
    const bookmakers = Array.isArray(item.bookmakers) ? item.bookmakers : [];
    const commenceTime = item.commence_time
      ? new Date(item.commence_time).toLocaleString()
      : '-';

    const isTeamEvent = item.home_team || item.away_team;
    const eventLabel = isTeamEvent
      ? `${item.away_team ?? 'Away'} @ ${item.home_team ?? 'Home'}`
      : item.name || item.description || item.id || 'Outright Market';

    for (const bookmaker of bookmakers) {
      const markets = Array.isArray(bookmaker.markets) ? bookmaker.markets : [];

      for (const market of markets) {
        const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];

        for (const outcome of outcomes) {
          const line = buildLineLabel(market.key, outcome);

          rows.push({
            id: `${item.id}-${bookmaker.key}-${market.key}-${outcome.name}`,
            sport: sportTitle,
            event: eventLabel,
            market: formatMarketName(market.key),
            book: bookmaker.title ?? bookmaker.key ?? '-',
            line,
            price: formatAmericanOdds(outcome.price),
            commenceTime,
          });
        }
      }
    }
  }

  return rows;
}

function buildLineLabel(marketKey: string, outcome: any) {
  const name = outcome?.name ?? '-';
  const point =
    typeof outcome?.point === 'number'
      ? `${outcome.point > 0 ? '+' : ''}${outcome.point}`
      : '';

  if (marketKey === 'spreads') {
    return point ? `${name} ${point}` : name;
  }

  if (marketKey === 'totals') {
    return point ? `${name} ${point}` : name;
  }

  if (marketKey === 'outrights') {
    return name;
  }

  return point ? `${name} ${point}` : name;
}

function formatAmericanOdds(price: unknown) {
  if (typeof price !== 'number') return '-';
  return price > 0 ? `+${price}` : `${price}`;
}

function formatMarketName(market: string) {
  switch (market) {
    case 'h2h':
      return 'Moneyline';
    case 'spreads':
      return 'Spread';
    case 'totals':
      return 'Total';
    case 'outrights':
      return 'Outright';
    default:
      return market;
  }
}
