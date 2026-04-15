import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { mockOdds } from '@/lib/mock-data';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport');

  try {
    let query = supabase
      .from('odds')
      .select('*')
      .order('game_date', { ascending: true });

    if (sport && sport !== 'All') {
      query = query.eq('sport', sport);
    }

    const { data, error } = await query;

    if (error) {
      const filtered = sport && sport !== 'All'
        ? mockOdds.filter((o) => o.sport === sport)
        : mockOdds;
      return NextResponse.json({ odds: filtered });
    }

    const result = data?.length ? data : mockOdds;
    const filtered = sport && sport !== 'All'
      ? result.filter((o: { sport: string }) => o.sport === sport)
      : result;

    return NextResponse.json({ odds: filtered });
  } catch {
    return NextResponse.json({ odds: mockOdds });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { data, error } = await supabase
      .from('odds')
      .insert([body])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ odds: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
