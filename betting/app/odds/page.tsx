'use client';

import { useEffect, useMemo, useState } from 'react';

type GenericEvent = {
  id?: string;
  eventID?: string;
  eventId?: string;
  awayTeam?: string;
  homeTeam?: string;
  awayTeamName?: string;
  homeTeamName?: string;
  name?: string;
  slug?: string;
  startTime?: string;
  startsAt?: string;
  commenceTime?: string;
  odds?: Record<string, unknown>;
  [key: string]: unknown;
};

type LeagueData = {
  league: string;
  events: GenericEvent[];
  error?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function extractTeamNames(event: GenericEvent) {
  const directAway =
    readString(event.awayTeam) || readString(event.awayTeamName);
  const directHome =
    readString(event.homeTeam) || readString(event.homeTeamName);

  if (directAway || directHome) {
    return {
      away: directAway || 'Away Team',
      home: directHome || 'Home Team',
    };
  }

  const teams = asArray((event as Record<string, unknown>).teams);
  if (teams.length >= 2) {
    const first = asRecord(teams[0]);
    const second = asRecord(teams[1]);

    const firstName =
      readString(first?.name) ||
      readString(first?.displayName) ||
      readString(first?.teamName);
    const secondName =
      readString(second?.name) ||
      readString(second?.displayName) ||
      readString(second?.teamName);

    if (firstName || secondName) {
      return {
        away: firstName || 'Away Team',
        home: secondName || 'Home Team',
      };
    }
  }

  const participants = asArray((event as Record<string, unknown>).participants);
  if (participants.length >= 2) {
    const first = asRecord(participants[0]);
    const second = asRecord(participants[1]);

    const firstName =
      readString(first?.name) ||
      readString(first?.displayName) ||
      readString(first?.teamName);
    const secondName =
      readString(second?.name) ||
      readString(second?.displayName) ||
      readString(second?.teamName);

    if (firstName || secondName) {
      return {
        away: firstName || 'Away Team',
        home: secondName || 'Home Team',
      };
    }
  }

  const matchup = readString(event.name) || readString((event as Record<string, unknown>).matchup);
  if (matchup) {
    if (matchup.includes(' at ')) {
      const [away, home] = matchup.split(' at ');
      return {
        away: away || 'Away Team',
        home: home || 'Home Team',
      };
    }

    if (matchup.includes(' @ ')) {
      const [away, home] = matchup.split(' @ ');
      return {
        away: away || 'Away Team',
        home: home || 'Home Team',
      };
    }

    if (matchup.includes(' vs ')) {
      const [away, home] = matchup.split(' vs ');
      return {
        away: away || 'Away Team',
        home: home || 'Home Team',
      };
    }
  }

  return {
    away: 'Away Team',
    home: 'Home Team',
  };
}

function extractStartTime(event: GenericEvent) {
  return (
    readString(event.startTime) ||
    readString(event.startsAt) ||
    readString(event.commenceTime)
  );
}

function formatStartTime(value: string) {
  if (!value) return 'Start time unavailable';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getEventId(event: GenericEvent, index: number) {
  return (
    readString(event.id) ||
    readString(event.eventID) ||
    readString(event.eventId) ||
    `event-${index}`
  );
}

function countMarkets(event: GenericEvent) {
  const odds = asRecord(event.odds);
  if (!odds) return 0;
  return Object.keys(odds).length;
}

export default function OddsPage() {
  const [data, setData] = useState<LeagueData[]>([]);
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

        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to fetch odds');
        }

        setData(Array.isArray(json.data) ? json.data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading odds');
      } finally {
        setLoading(false);
      }
    }

    fetchOdds();
  }, []);

  const leagues = useMemo(() => {
    const names = data.map((item) => item.league).filter(Boolean);
    return ['ALL', ...names];
  }, [data]);

  const filteredData = useMemo(() => {
    if (sportFilter === 'ALL') return data;
    return data.filter((item) => item.league === sportFilter);
  }, [data, sportFilter]);

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-2 text-5xl font-bold tracking-tight">Live Odds</h1>
        <p className="mb-8 text-gray-400">
          Live upcoming events from SportsGameOdds
        </p>

        <div className="mb-8 flex items-center gap-3">
          <label className="text-sm text-gray-400">Sport</label>
          <select
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white outline-none"
          >
            {leagues.map((league) => (
              <option key={league} value={league} className="bg-neutral-900">
                {league}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-gray-300">
            Loading odds...
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && filteredData.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-gray-400">
            No odds available.
          </div>
        )}

        <div className="space-y-10">
          {!loading &&
            !error &&
            filteredData.map((leagueBlock) => (
              <section key={leagueBlock.league}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-3xl font-semibold">{leagueBlock.league}</h2>
                  <span className="text-sm text-gray-400">
                    {leagueBlock.events?.length || 0} events
                  </span>
                </div>

                {leagueBlock.error && (
                  <div className="mb-4 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-yellow-300">
                    {leagueBlock.error}
                  </div>
                )}

                {(!leagueBlock.events || leagueBlock.events.length === 0) && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-gray-400">
                    No events found for this league.
                  </div>
                )}

                <div className="grid gap-4">
                  {leagueBlock.events?.map((event, index) => {
                    const teams = extractTeamNames(event);
                    const startTime = extractStartTime(event);
                    const marketCount = countMarkets(event);

                    return (
                      <div
                        key={getEventId(event, index)}
                        className="rounded-2xl border border-white/10 bg-white/5 p-5"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-2xl font-semibold">
                              {teams.away} @ {teams.home}
                            </div>
                            <div className="mt-1 text-sm text-gray-400">
                              {formatStartTime(startTime)}
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <div className="rounded-xl bg-white/5 px-4 py-2 text-sm text-gray-300">
                              Markets: {marketCount}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
        </div>
      </div>
    </main>
  );
}
