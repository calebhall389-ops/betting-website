import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_KEY = process.env.ODDS_API_KEY!;
const BASE_URL = 'https://api.the-odds-api.com/v4';

const SPORTS = [
  { key: 'baseball_mlb', label: 'MLB' },
  { key: 'basketball_nba', label: 'NBA' },
  { key: 'icehockey_nhl', label: 'NHL' },
  { key: 'americanfootball_nfl', label: 'NFL' },
];

async function fetchSportOdds(sportKey: string) {
  const url = new URL(`${BASE_URL}/sports/${sportKey}/odds`);

  url.searchParams.set('apiKey', API_KEY);
  url.searchParams.set('regions', 'us');
  url.searchParams.set('markets', 'h2h');
  url.searchParams.set('oddsFormat', 'american');
  url.searchParams.set('dateFormat', 'iso');

  const res = await fetch(url.toString(), {
    cache: 'no-store',
  });

  const text = await res.text();

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from Odds API: ${text}`);
  }

  if (!res.ok) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as { message?: unknown }).message)
        : text;

    throw new Error(`Odds API error (${sportKey}): ${message}`);
  }

  return data;
}

export async function GET() {
  try {
    if (!API_KEY) {
      throw new Error('Missing ODDS_API_KEY');
    }

    const responses = await Promise.all(
      SPORTS.map(async (sport) => {
        try {
          const data = await fetchSportOdds(sport.key);

          return {
            sport_key: sport.key,
            sport_title: sport.label,
            events: Array.isArray(data) ? data : [],
          };
        } catch (error) {
          return {
            sport_key: sport.key,
            sport_title: sport.label,
            events: [],
            error:
              error instanceof Error ? error.message : 'Failed to fetch sport',
          };
        }
      })
    );

    const allEvents = responses.flatMap((sport) =>
      sport.events.map((event) => ({
        sport_key: sport.sport_key,
        sport_title: sport.sport_title,
        ...event,
      }))
    );

    return NextResponse.json({
      success: true,
      count: allEvents.length,
      data: allEvents,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
