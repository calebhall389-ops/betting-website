import { NextRequest, NextResponse } from 'next/server';
import { fetchOddsForSport } from '@/lib/odds-api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sport = searchParams.get('sport');

    if (!sport) {
      return NextResponse.json(
        { success: false, error: 'Missing sport parameter' },
        { status: 400 }
      );
    }

    const data = await fetchOddsForSport(sport);

    return NextResponse.json({
      success: true,
      sport,
      count: Array.isArray(data) ? data.length : 0,
      data,
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
