'use client';

import { useEffect, useState } from 'react';

type Event = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime?: string;
};

type LeagueData = {
  league: string;
  events: Event[];
};

export default function OddsPage() {
  const [data, setData] = useState<LeagueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchOdds() {
      try {
        setLoading(true);

        const res = await fetch('/api/odds', {
          cache: 'no-store',
        });

        if (!res.ok) {
          throw new Error('Failed to fetch odds');
        }

        const json = await res.json();

        if (!json.success) {
          throw new Error(json.error || 'API error');
        }

        setData(json.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading odds');
      } finally {
        setLoading(false);
      }
    }

    fetchOdds();
  }, []);

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10">
      <h1 className="text-4xl font-bold mb-6">Live Odds</h1>

      {loading && <p className="text-gray-400">Loading odds...</p>}

      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-300 p-4 rounded-xl">
          {error}
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <p className="text-gray-400">No odds available.</p>
      )}

      <div className="space-y-8">
        {data.map((league) => (
          <div key={league.league}>
            <h2 className="text-2xl font-semibold mb-4">
              {league.league}
            </h2>

            <div className="grid gap-4">
              {league.events.map((event) => (
                <div
                  key={event.id}
                  className="bg-white/5 p-4 rounded-xl border border-white/10"
                >
                  <div className="text-lg font-semibold">
                    {event.awayTeam} @ {event.homeTeam}
                  </div>

                  {event.commenceTime && (
                    <div className="text-sm text-gray-400 mt-1">
                      {new Date(event.commenceTime).toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
