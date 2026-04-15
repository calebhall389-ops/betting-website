import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type StoredPick = {
  id: string;
  sport: string;
  game: string;
  pick: string;
  odds: number;
  stake: number;
  result: string;
  created_at: string;
};

type ScoreEntry = {
  name: string;
  score: string;
};

type ScoreEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores?: ScoreEntry[];
  last_update?: string;
};

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secret) {
    throw new Error('Missing Supabase admin credentials');
  }

  return createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function parseGame(game: string) {
  const parts = game.split(' at ');
  if (parts.length !== 2) return null;

  return {
    awayTeam: parts[0].trim(),
    homeTeam: parts[1].trim(),
  };
}

function parsePickTeam(pick: string) {
  return pick.replace(/\s+ML$/i, '').trim();
}

function profitFromAmericanOdds(odds: number, stake: number) {
  if (odds > 0) {
    return Number(((odds / 100) * stake).toFixed(2));
  }

  return Number(((100 / Math.abs(odds)) * stake).toFixed(2));
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const apiKey = process.env.ODDS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing ODDS_API_KEY' },
        { status: 500 }
      );
    }

    const supabase = getAdminSupabase();

    const threeDaysAgoIso = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: pendingPicks, error: pendingError } = await supabase
      .from('picks')
      .select('id,sport,game,pick,odds,stake,result,created_at')
      .eq('sport', 'NBA')
      .eq('result', 'pending')
      .gte('created_at', threeDaysAgoIso);

    if (pendingError) {
      return NextResponse.json(
        { error: pendingError.message },
        { status: 500 }
      );
    }

    if (!pendingPicks || pendingPicks.length === 0) {
      return NextResponse.json({
        success: true,
        graded: 0,
        message: 'No pending NBA picks to grade.',
      });
    }

    const scoresUrl =
      `https://api.the-odds-api.com/v4/sports/basketball_nba/scores/` +
      `?apiKey=${apiKey}` +
      `&daysFrom=3` +
      `&dateFormat=iso`;

    const scoresRes = await fetch(scoresUrl, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!scoresRes.ok) {
      const text = await scoresRes.text();
      return NextResponse.json(
        { error: `Scores API failed: ${text}` },
        { status: 502 }
      );
    }

    const scoreEvents = (await scoresRes.json()) as ScoreEvent[];

    const completedByGame = new Map<string, ScoreEvent>();

    for (const event of scoreEvents) {
      if (!event.completed || !event.scores || event.scores.length < 2) continue;

      const key = `${event.away_team} at ${event.home_team}`;
      completedByGame.set(key, event);
    }

    const updates: Array<{
      id: string;
      result: 'win' | 'loss' | 'push';
      profit: number;
    }> = [];

    for (const rawPick of pendingPicks as StoredPick[]) {
      const parsedGame = parseGame(rawPick.game);
      if (!parsedGame) continue;

      const scoreEvent = completedByGame.get(rawPick.game);
      if (!scoreEvent) continue;

      const scoreMap = new Map(
        (scoreEvent.scores ?? []).map((s) => [s.name, Number(s.score)])
      );

      const homeScore = scoreMap.get(scoreEvent.home_team);
      const awayScore = scoreMap.get(scoreEvent.away_team);

      if (
        homeScore === undefined ||
        awayScore === undefined ||
        Number.isNaN(homeScore) ||
        Number.isNaN(awayScore)
      ) {
        continue;
      }

      const pickTeam = parsePickTeam(rawPick.pick);
      const pickedScore = scoreMap.get(pickTeam);

      if (pickedScore === undefined || Number.isNaN(pickedScore)) {
        continue;
      }

      let result: 'win' | 'loss' | 'push';
      let profit: number;

      if (homeScore === awayScore) {
        result = 'push';
        profit = 0;
      } else {
        const winningTeam =
          homeScore > awayScore ? scoreEvent.home_team : scoreEvent.away_team;

        if (pickTeam === winningTeam) {
          result = 'win';
          profit = profitFromAmericanOdds(rawPick.odds, Number(rawPick.stake ?? 1));
        } else {
          result = 'loss';
          profit = Number((-1 * Number(rawPick.stake ?? 1)).toFixed(2));
        }
      }

      updates.push({
        id: rawPick.id,
        result,
        profit,
      });
    }

    if (updates.length === 0) {
      return NextResponse.json({
        success: true,
        graded: 0,
        message: 'No completed games matched pending picks yet.',
      });
    }

    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('picks')
        .update({
          result: update.result,
          profit: update.profit,
        })
        .eq('id', update.id);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      graded: updates.length,
      updates,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
