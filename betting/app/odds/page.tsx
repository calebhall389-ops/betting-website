'use client';

import { useEffect, useMemo, useState } from 'react';

type TeamNames = {
  long?: string;
  short?: string;
  medium?: string;
};

type TeamInfo = {
  teamID?: string;
  names?: TeamNames;
};

type Teams = {
  home?: TeamInfo;
  away?: TeamInfo;
};

type OddsEvent = {
  eventID?: string;
  sportID?: string;
  leagueID?: string;
  type?: string;
  teams?: Teams;
  startTime?: string;
  odds?: Record<string, unknown>;
};

type LeagueBlock = {
  league: string;
  events: OddsEvent[];
  error?: string;
};

function getTeamName(team?: TeamInfo, fallback = 'Team') {
  if (!team) return fallback;

  return (
    team.names?.long ||
    team.names?.medium ||
    team.names?.short ||
    fallback
  );
}

function formatStartTime(startTime?: string) {
  if (!startTime) return 'Start time unavailable';

  const date = new Date(startTime);

  if (Number.isNaN(date.getTime())) {
    return 'Start time unavailable';
  }

  return date.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function countMarkets(odds?: Record<string, unknown>) {
  if (!odds || typeof odds !== 'object') return 0;
  return Object.keys(odds).length;
}

export default function OddsPage() {
  const [data, setData] = useState<LeagueBlock[]>([]);
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

  const sports = useMemo(() => {
    const leagues = data
      .map((item) => item.league)
      .filter((league): league is string => Boolean(league));

    return ['ALL', ...leagues];
  }, [data]);

  const filteredData = useMemo(() => {
    if (sportFilter === 'ALL') return data;
    return data.filter((item) => item.league === sportFilter);
  }, [data, sportFilter]);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-5xl font-bold tracking-tight">Live Odds</h1>
        <p className="mt-2 text-lg text-gray-400">
          Live upcoming events from SportsGameOdds
        </p>

        <div className="mt-10 flex items-center gap-3">
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

        {!loading && !error && filteredData.length === 0 && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 text-gray-400">
            No odds available.
          </div>
        )}

        <div className="mt-10 space-y-10">
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

                <div className="grid gap-5">
                  {leagueBlock.events?.map((event, index) => {
                    const home = getTeamName(event.teams?.home, 'Home Team');
                    const away = getTeamName(event.teams?.away, 'Away Team');
                    const marketCount = countMarkets(event.odds);

                    return (
                      <div
                        key={event.eventID || `${leagueBlock.league}-${index}`}
                        className="rounded-2xl border border-white/10 bg-white/5 p-6"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-2xl font-semibold">
                              {away} @ {home}
                            </div>

                            <div className="mt-2 text-sm text-gray-400">
                              {formatStartTime(event.startTime)}
                            </div>
                          </div>

                          <div className="rounded-xl bg-white/5 px-4 py-3 text-sm text-gray-300">
                            Markets: {marketCount}
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
