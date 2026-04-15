import { NextResponse } from 'next/server';
import { fetchAvailableSports } from '@/lib/odds-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sports = await fetchAvailableSports();

    return NextResponse.json({
      success: true,
      count: sports.length,
      sports,
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
