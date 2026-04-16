import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_KEY = process.env.SPORTSGAMEODDS_API_KEY!;
const BASE_URL =
  process.env.SPORTSGAMEODDS_BASE_URL || 'https://api.sportsgameodds.com/v2';

export async function GET(req: NextRequest) {
  try {
    const eventID = req.nextUrl.searchParams.get('eventID');

    if (!eventID) {
      return NextResponse.json(
        { success: false, error: 'Missing eventID' },
        { status: 400 }
      );
    }

    const url = new URL(`${BASE_URL}/events`);
    url.searchParams.set('eventID', eventID);
    url.searchParams.set('oddsAvailable', 'true');

    const res = await fetch(url.toString(), {
      headers: {
        'x-api-key': API_KEY,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const text = await res.text();

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `SportsGameOdds error (${res.status})`,
          data,
        },
        { status: res.status }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch event odds',
      },
      { status: 500 }
    );
  }
}
