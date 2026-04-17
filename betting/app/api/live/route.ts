import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const now = new Date();
    const lookback = new Date(now.getTime() - 12 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('picks')
      .select('*')
      .eq('pick_type', 'live')
      .gte('created_at', lookback.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      picks: data ?? [],
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
