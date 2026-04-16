'use client';

import { useEffect, useMemo, useState } from 'react';

type Pick = {
  id: string;
  created_at: string;
  commence_time?: string | null;
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: string | number;
  stake: number;
  result: string;
  sportsbook?: string | null;
  edge?: number | null;
  ev?: number | null;
  analysis?: string | null;
  max_play?: boolean | null;
};

export default function PicksPage() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sportFilter, setSportFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('newest');
  const [sharpOnly, setSharpOnly] = useState(false);

  useEffect(() => {
    async function fetchPicks() {
      try {
        setLoading(true);
        setError('');

        const res = await fetch('/api/picks', {
          cache: 'no-store',
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || 'Failed to fetch picks');
        }

        setPicks(Array.isArray(data?.picks) ? data.picks : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
    }

    fetchPicks();
  }, []);

  function isToday(dateString?: string | null) {
    if (!dateString) return false;

    const gameDate = new Date(dateString);
    const now = new Date();

    return (
      gameDate.getFullYear() === now.getFullYear() &&
      gameDate.getMonth() === now.getMonth() &&
      gameDate.getDate() === now.getDate()
    );
  }

  function formatOdds(odds: number | null | undefined) {
    if (odds === null || odds === undefined || Number.isNaN(Number(odds))) {
      return '—';
    }

    const num = Number(odds);
    return num > 0 ? `+${num}` : `${num}`;
  }

  function formatPercent(value: number | null | undefined) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return '—';
    }

    return `${Number(value).toFixed(2)}%`;
  }

  function formatConfidence(value: string | number | null | undefined) {
    if (value === null || value === undefined || value === '') return '—';

    if (typeof value === 'number') {
      return `${value}%`;
    }

    const cleaned = String(value).replace('%', '').trim();
    const asNumber = Number(cleaned);

    if (!Number.isNaN(asNumber)) {
      return `${asNumber}%`;
    }

    return String(value);
  }

  function formatCreatedAt(dateString: string) {
    try {
      return new Date(dateString).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return dateString;
    }
  }

  function formatGameTime(dateString?: string | null) {
    if (!dateString) return '—';

    try {
      return new Date(dateString).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return dateString;
    }
  }

  function getEdgeColor(edge: number | null | undefined) {
    if (edge === null || edge === undefined) return 'text-gray-300';
    if (edge >= 3) return 'text-green-400';
    if (edge >= 1.5) return 'text-yellow-300';
    return 'text-gray-300';
  }

  function getEvColor(ev: number | null | undefined) {
    if (ev === null || ev === undefined) return 'text-gray-300';
    if (ev >= 5) return 'text-green-400';
    if (ev >= 2) return 'text-yellow-300';
    return 'text-gray-300';
  }

  function isSharpPick(pick: Pick) {
    const ev = pick.ev ?? 0;
    const edge = pick.edge ?? 0;
    return ev >= 2 && edge >= 1;
  }

  const todaysPicks = useMemo(() => {
    return picks.filter((pick) => isToday(pick.commence_time));
  }, [picks]);

  const sports = useMemo(() => {
    const uniqueSports = Array.from(
      new Set(
        todaysPicks
          .map((pick) => pick.sport?.trim())
          .filter((sport): sport is string => Boolean(sport))
      )
    ).sort();

    return ['ALL', ...uniqueSports];
  }, [todaysPicks]);

  const filteredPicks = useMemo(() => {
    let result = [...todaysPicks];

    if (sportFilter !== 'ALL') {
      result = result.filter((pick) => pick.sport === sportFilter);
    }

    if (sharpOnly) {
      result = result.filter((pick) => isSharpPick(pick) || pick.max_play);
    }

    result = [...result].sort((a, b) => {
      if (sortBy === 'ev') {
        return (b.ev ?? -999) - (a.ev ?? -999);
      }

      if (sortBy === 'edge') {
        return (b.edge ?? -999) - (a.edge ?? -999);
      }

      if (sortBy === 'confidence') {
        const aConfidence =
          typeof a.confidence === 'number'
            ? a.confidence
            : Number(String(a.confidence).replace('%', '').trim()) || 0;

        const bConfidence =
          typeof b.confidence === 'number'
            ? b.confidence
            : Number(String(b.confidence).replace('%', '').trim()) || 0;

        return bConfidence - aConfidence;
      }

      if (sortBy === 'odds') {
        return (b.odds ?? -99999) - (a.odds ?? -99999);
      }

      return (
        new Date(b.commence_time || b.created_at).getTime() -
        new Date(a.commence_time || a.created_at).getTime()
      );
    });

    return result;
  }, [todaysPicks, sportFilter, sortBy, sharpOnly]);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">Latest Picks</h1>
          <p className="mt-2 text-base text-gray-400">
            Showing only picks for today’s games
          </p>
        </div>

        <div className="mb-6 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm text-gray-400">Sport</label>
            <select
              value={sportFilter}
              onChange={(e) => setSportFilter(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
            >
              {sports.map((sport) => (
                <option key={sport} value={sport} className="bg-gray-900">
                  {sport}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-gray-400">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
            >
              <option value="newest" className="bg-gray-900">
                Newest
              </option>
              <option value="ev" className="bg-gray-900">
                Highest EV
              </option>
              <option value="edge" className="bg-gray-900">
                Highest Edge
              </option>
              <option value="confidence" className="bg-gray-900">
                Highest Confidence
              </option>
              <option value="odds" className="bg-gray-900">
                Highest Odds
              </option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/10 px-4 py-3">
              <input
                type="checkbox"
                checked={sharpOnly}
                onChange={(e) => setSharpOnly(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm text-white">Sharp picks only</span>
            </label>
          </div>
        </div>

        {loading && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-gray-300">
            Loading picks...
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && filteredPicks.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-gray-400">
            No picks found for today’s games.
          </div>
        )}

        <div className="space-y-6">
          {!loading &&
            !error &&
            filteredPicks.map((pick) => (
              <div
                key={pick.id}
                className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-6 shadow-lg"
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-1 text-sm uppercase tracking-wide text-gray-400">
                      {pick.sport || 'Unknown Sport'}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-bold">{pick.pick}</h2>

                      {pick.max_play ? (
                        <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-300">
                          💎 Max Play
                        </span>
                      ) : isSharpPick(pick) ? (
                        <span className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-semibold text-green-300">
                          🔥 Sharp Pick
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 text-lg text-gray-300">{pick.game}</p>
                  </div>

                  <div className="text-right">
                    <div className="text-sm text-gray-400">Odds</div>
                    <div className="text-3xl font-bold">
                      {formatOdds(pick.odds)}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-sm text-gray-400">Confidence</div>
                    <div className="text-3xl font-semibold">
                      {formatConfidence(pick.confidence)}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-sm text-gray-400">Stake</div>
                    <div className="text-3xl font-semibold">
                      {pick.stake ?? '—'}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-sm text-gray-400">Result</div>
                    <div className="text-3xl font-semibold capitalize">
                      {pick.result || 'pending'}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-sm text-gray-400">Game Time</div>
                    <div className="text-xl font-semibold">
                      {formatGameTime(pick.commence_time)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-4">
                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-sm text-gray-400">Sportsbook</div>
                    <div className="text-2xl font-semibold">
                      {pick.sportsbook || '—'}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-sm text-gray-400">Edge</div>
                    <div
                      className={`text-2xl font-semibold ${getEdgeColor(
                        pick.edge
                      )}`}
                    >
                      {formatPercent(pick.edge)}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-sm text-gray-400">EV</div>
                    <div
                      className={`text-2xl font-semibold ${getEvColor(
                        pick.ev
                      )}`}
                    >
                      {formatPercent(pick.ev)}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-4">
                    <div className="text-sm text-gray-400">Created</div>
                    <div className="text-xl font-semibold">
                      {formatCreatedAt(pick.created_at)}
                    </div>
                  </div>
                </div>

                {pick.analysis && (
                  <div className="mt-4 rounded-2xl bg-white/5 p-4">
                    <div className="mb-2 text-sm text-gray-400">Analysis</div>
                    <p className="text-lg leading-8 text-gray-200">
                      {pick.analysis}
                    </p>
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    </main>
  );
}
