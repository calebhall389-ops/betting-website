import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_KEY = process.env.SPORTSGAMEODDS_API_KEY!;
const BASE_URL = 'https://api.sportsgameodds.com/v2';

export async function GET(req: NextRequest) {
  try {
    const eventID = req.nextUrl.searchParams.get('eventID');

    if (!eventID) {
      return NextResponse.json(
        { success: false, error: 'Missing eventID' },
        { status: 400 }
      );
    }

    const res = await fetch(
      `${BASE_URL}/events/${eventID}/odds`,
      {
        headers: {
          'x-api-key': API_KEY,
        },
        cache: 'no-store',
      }
    );

    const data = await res.json();

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch event odds',
      },
      { status: 500 }
    );
  }
}
