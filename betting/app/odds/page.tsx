'use client';

import { useEffect, useMemo, useState } from 'react';

type TeamNames = {
  long?: string;
  medium?: string;
  short?: string;
};

type TeamInfo = {
  names?: TeamNames;
};

type EventTeams = {
  home?: TeamInfo;
  away?: TeamInfo;
};

type MarketOutcome = {
  name?: string;
  price?: number;
  odds?: number;
};

type Market = {
  marketKey?: string;
  key?: string;
  marketType?: string;
  outcomes?: MarketOutcome[];
};

type Bookmaker = {
  key?: string;
  title?: string;
  name?: string;
  markets?: Market[];
};

type OddsEvent = {
  id?: string;
  eventID?: string;
  sport_key?: string;
  home_team?: string;
  away_team?: string;
  commence_time?: string;
  startTime?: string;
  status?: {
    startsAt?: string;
  };
  teams?: EventTeams;
  bookmakers?: Bookmaker[];
};

type OddsResponse = {
  success?: boolean;
  data?: unknown;
  odds?: unknown;
  events?: unknown;
};

type BestLine = {
  book: string;
  price: number;
};

const MAJOR_BOOKS = [
  'draftkings',
  'fanduel',
  'betmgm',
  'caesars',
  'espnbet',
  'betrivers',
  'pointsbet',
  'hardrockbet',
  'bet365',
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function getBookName(book: Bookmaker) {
  return book.title || book.name || book.key || 'Unknown Book';
}

function normalizeBookKey(book: Bookmaker) {
  return (book.key || book.title || book.name || '').toLowerCase().replace(/\s+/g, '');
}

function isMajorBook(book: Bookmaker) {
  const key = normalizeBookKey(book);
  return MAJOR_BOOKS.includes(key);
}

function formatOdds(price: number | null | undefined) {
  if (price === null || price === undefined || Number.isNaN(price)) return '—';
  return price > 0 ? `+${price}` : `${price}`;
}

function formatStartTime(value?: string) {
  if (!value) return 'Start time unavailable';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Start time unavailable';

  return date.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getTeamName(team?: TeamInfo, fallback = 'Team') {
  return team?.names?.long || team?.names?.medium || team?.names?.short || fallback;
}

function getHomeTeam(event: OddsEvent) {
  return event.home_team || getTeamName(event.teams?.home, 'Home Team');
}

function getAwayTeam(event: OddsEvent) {
  return event.away_team || getTeamName(event.teams?.away, 'Away Team');
}

function getStartTime(event: OddsEvent) {
  return event.startTime || event.status?.startsAt || event.commence_time || '';
}

function isMoneylineMarket(market: Market) {
  const key = (market.marketKey || market.key || market.marketType || '').toLowerCase();
  return (
    key.includes('h2h') ||
    key.includes('moneyline') ||
    key === 'ml'
  );
}

function getOutcomePrice(outcome: MarketOutcome) {
  if (typeof outcome.price === 'number') return outcome.price;
  if (typeof outcome.odds === 'number') return outcome.odds;
  return null;
}

function isTeamMatch(outcomeName: string | undefined, teamName: string) {
  if (!outcomeName) return false;
  return outcomeName.trim().toLowerCase() === teamName.trim().toLowerCase();
}

function extractBestLines(event: OddsEvent) {
  const awayTeam = getAwayTeam(event);
  const homeTeam = getHomeTeam(event);

  let bestAway: BestLine | null = null;
  let bestHome: BestLine | null = null;

  const bookmakers = toArray<Bookmaker>((event as Record<string, unknown>).bookmakers);

  for (const book of bookmakers) {
    if (!isMajorBook(book)) continue;

    const markets = toArray<Market>(book.markets);
    const moneylineMarket = markets.find(isMoneylineMarket);

    if (!moneylineMarket) continue;

    const outcomes = toArray<MarketOutcome>(moneylineMarket.outcomes);

    const awayOutcome = outcomes.find((outcome) =>
      isTeamMatch(outcome.name, awayTeam)
    );

    const homeOutcome = outcomes.find((outcome) =>
      isTeamMatch(outcome.name, homeTeam)
    );

    const awayPrice = awayOutcome ? getOutcomePrice(awayOutcome) : null;
    const homePrice = homeOutcome ? getOutcomePrice(homeOutcome) : null;

    if (awayPrice !== null) {
      if (!bestAway || awayPrice > bestAway.price) {
        bestAway = {
          book: getBookName(book),
          price: awayPrice,
        };
      }
    }

    if (homePrice !== null) {
      if (!bestHome || homePrice > bestHome.price) {
        bestHome = {
          book: getBookName(book),
          price: homePrice,
        };
      }
    }
  }

  return { bestAway, bestHome };
}

function extractEvents(payload: OddsResponse): OddsEvent[] {
  if (Array.isArray(payload.data)) return payload.data as OddsEvent[];
  if (Array.isArray(payload.events)) return payload.events as OddsEvent[];
  if (Array.isArray(payload.odds)) return payload.odds as OddsEvent[];

  if (isObject(payload.data)) {
    const dataObj = payload.data as Record<string, unknown>;

    if (Array.isArray(dataObj.events)) return dataObj.events as OddsEvent[];
    if (Array.isArray(dataObj.data)) return dataObj.data as OddsEvent[];
    if (Array.isArray(dataObj.odds)) return dataObj.odds as OddsEvent[];
  }

  return [];
}

export default function OddsPage() {
  const [events, setEvents] = useState<OddsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sportFilter, setSportFilter] = useState('ALL');

  useEffect(() => {
    async function fetchOdds() {
      try {
        setLoading(true);
        setError('');

        const res = await fetch('/api/odds', {
          cache: 'no-store',
        });

        const json: OddsResponse = await res.json();

        if (!res.ok) {
          throw new Error('Failed to fetch odds');
        }

        const extracted = extractEvents(json);
        setEvents(extracted);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load odds');
      } finally {
        setLoading(false);
      }
    }

    fetchOdds();
  }, []);

  const sports = useMemo(() => {
    const uniqueSports = Array.from(
      new Set(
        events
          .map((event) => event.sport_key)
          .filter((sport): sport is string => Boolean(sport))
      )
    ).sort();

    return ['ALL', ...uniqueSports];
  }, [events]);

  const filteredEvents = useMemo(() => {
    let result = [...events];

    if (sportFilter !== 'ALL') {
      result = result.filter((event) => event.sport_key === sportFilter);
    }

    result.sort((a, b) => {
      const aTime = new Date(getStartTime(a)).getTime();
      const bTime = new Date(getStartTime(b)).getTime();
      return aTime - bTime;
    });

    return result;
  }, [events, sportFilter]);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-5xl font-bold tracking-tight">Best Odds</h1>
        <p className="mt-2 text-lg text-gray-400">
          Best available moneyline from major sportsbooks
        </p>

        <div className="mt-8 flex items-center gap-3">
          <label className="text-sm text-gray-400">Sport</label>
          <select
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
          >
            {sports.map((sport) => (
              <option key={sport} value={sport} className="bg-neutral-900">
                {sport}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 text-gray-300">
            Loading odds...
          </div>
        )}

        {error && !loading && (
          <div className="mt-8 rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && filteredEvents.length === 0 && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 text-gray-400">
            No odds available.
          </div>
        )}

        <div className="mt-10 grid gap-5">
          {!loading &&
            !error &&
            filteredEvents.map((event, index) => {
              const awayTeam = getAwayTeam(event);
              const homeTeam = getHomeTeam(event);
              const startTime = getStartTime(event);
              const { bestAway, bestHome } = extractBestLines(event);

              return (
                <div
                  key={event.eventID || event.id || `${awayTeam}-${homeTeam}-${index}`}
                  className="rounded-2xl border border-white/10 bg-white/5 p-6"
                >
                  <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-2xl font-semibold">
                        {awayTeam} @ {homeTeam}
                      </div>
                      <div className="mt-2 text-sm text-gray-400">
                        {formatStartTime(startTime)}
                      </div>
                    </div>

                    <div className="grid gap-4 md:min-w-[360px] md:grid-cols-2">
                      <div className="rounded-2xl bg-white/5 p-4">
                        <div className="text-sm text-gray-400">
                          {awayTeam} best ML
                        </div>
                        <div className="mt-1 text-2xl font-semibold text-green-300">
                          {formatOdds(bestAway?.price)}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {bestAway?.book || 'No major book found'}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white/5 p-4">
                        <div className="text-sm text-gray-400">
                          {homeTeam} best ML
                        </div>
                        <div className="mt-1 text-2xl font-semibold text-blue-300">
                          {formatOdds(bestHome?.price)}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {bestHome?.book || 'No major book found'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </main>
  );
}
