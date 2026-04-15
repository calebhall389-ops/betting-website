import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { mockPicks } from '@/lib/mock-data';

export async function GET() {
  try {
    if (!supabase) {
      return NextResponse.json({ picks: mockPicks });
    }

    const { data, error } = await supabase
      .from('picks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ picks: mockPicks });
    }

    return NextResponse.json({ picks: data?.length ? data : mockPicks });
  } catch {
    return NextResponse.json({ picks: mockPicks });
  }
}

export async function POST(request: Request) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase is not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();

    const { data, error } = await supabase
      .from('picks')
      .insert([body])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ pick: data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
