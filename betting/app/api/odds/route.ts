import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_KEY = process.env.SPORTSGAMEODDS_API_KEY!;
const BASE_URL = 'https://api.sportsgameodds.com/v2';

export async function GET() {
  try {
    const leagues = ['MLB', 'NBA', 'NHL', 'NFL'];

    const allEvents: any[] = [];

    for (const league of leagues) {
      const url = `${BASE_URL}/events?leagueID=${league}`;

      const res = await fetch(url, {
        headers: {
          'x-api-key': API_KEY,
          Accept: 'application/json',
        },
        cache: 'no-store',
      });

      const data = await res.json();

      if (data?.data && Array.isArray(data.data)) {
        for (const event of data.data) {
          allEvents.push(event);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: allEvents,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch odds',
      },
      { status: 500 }
    );
  }
}
