import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

type LiveCandidate = {
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: number;
  analysis: string;
  sportsbook: string;
  edge: number;
  ev: number;
  stake: number;
  live_state?: string;
};

function isAuthorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;

  const authHeader = req.headers.get('authorization');
  const cronHeader = req.headers.get('x-cron-secret');

  return (
    authHeader === `Bearer ${cronSecret}` ||
    cronHeader === cronSecret
  );
}

function buildMockLiveCandidates(): LiveCandidate[] {
  return [
    {
      sport: 'NBA',
      game: 'Los Angeles Lakers at Phoenix Suns',
      pick: 'Phoenix Suns Live ML',
      odds: -108,
      confidence: 58,
      analysis:
        'Live market drift created a playable edge versus updated in-game win probability. Pace and shot quality remain favorable.',
      sportsbook: 'DraftKings',
      edge: 3.2,
      ev: 4.4,
      stake: 1,
      live_state: '3Q - 6:42',
    },
    {
      sport: 'MLB',
      game: 'Chicago Cubs at New York Mets',
      pick: 'Under 9.5 Live',
      odds: -102,
      confidence: 57,
      analysis:
        'Run environment has cooled versus pregame expectation and bullpen profile supports a lower-scoring finish.',
      sportsbook: 'FanDuel',
      edge: 2.8,
      ev: 3.7,
      stake: 1,
      live_state: 'Bottom 6th',
    },
  ];
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    /**
     * Replace this section with your real live model logic.
     * For now this route shows the exact insert structure you need.
     */
    const candidates = buildMockLiveCandidates();

    if (!candidates.length) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        picks: [],
        debug: {
          candidatesFound: 0,
          finalSelected: 0,
          mode: 'live',
        },
      });
    }

    const rows = candidates.map((c) => ({
      sport: c.sport,
      game: c.game,
      pick: c.pick,
      odds: c.odds,
      confidence: String(c.confidence),
      analysis: c.analysis,
      sportsbook: c.sportsbook,
      edge: c.edge,
      ev: c.ev,
      stake: c.stake,
      result: 'pending',
      pick_type: 'live',
      live_state: c.live_state ?? null,
    }));

    const { data, error } = await supabase
      .from('picks')
      .insert(rows)
      .select();

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      inserted: data?.length ?? 0,
      picks: data ?? [],
      debug: {
        candidatesFound: candidates.length,
        finalSelected: data?.length ?? 0,
        mode: 'live',
      },
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
