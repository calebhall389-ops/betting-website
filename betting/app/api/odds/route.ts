import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_KEY = process.env.SPORTSGAMEODDS_API_KEY!;
const BASE_URL =
  process.env.SPORTSGAMEODDS_BASE_URL ||
  'https://api.sportsgameodds.com/v2';

// Supported leagues (adjust based on your subscription)
const LEAGUES = ['MLB', 'NBA', 'NFL', 'NHL'];

async function fetchLeagueOdds(league: string) {
  const url = `${BASE_URL}/events?league=${league}&includeOdds=true`;

  const res = await fetch(url, {
    headers: {
      'x-api-key': API_KEY,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SportsGameOdds error (${league}): ${text}`);
  }

  return res.json();
}

export async function GET() {
  try {
    if (!API_KEY) {
      throw new Error('Missing SPORTSGAMEODDS_API_KEY');
    }

    const results = await Promise.all(
      LEAGUES.map(async (league) => {
        try {
          const data = await fetchLeagueOdds(league);
          return {
            league,
            events: data?.data || data || [],
          };
        } catch (error) {
          return {
            league,
            events: [],
            error:
              error instanceof Error
                ? error.message
                : 'Failed to fetch odds',
          };
        }
      })
    );

    const totalEvents = results.reduce(
      (sum, league) => sum + league.events.length,
      0
    );

    return NextResponse.json({
      success: true,
      provider: 'SportsGameOdds',
      count: totalEvents,
      data: results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch odds',
      },
      { status: 500 }
    );
  }
}
