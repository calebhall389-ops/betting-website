import { NextResponse } from 'next/server';
import { fetchLeagueEvents } from '@/lib/sportsgameodds';

export const dynamic = 'force-dynamic';

const LEAGUES = ['MLB', 'NBA', 'NFL', 'NHL'];

export async function GET() {
  try {
    if (!process.env.SPORTSGAMEODDS_API_KEY) {
      throw new Error('Missing SPORTSGAMEODDS_API_KEY');
    }

    const results = await Promise.all(
      LEAGUES.map(async (leagueID) => {
        try {
          const response = await fetchLeagueEvents(leagueID);

          return {
            league: leagueID,
            events: response?.data || response || [],
          };
        } catch (error) {
          return {
            league: leagueID,
            events: [],
            error:
              error instanceof Error ? error.message : 'Failed to fetch league',
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
          error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
