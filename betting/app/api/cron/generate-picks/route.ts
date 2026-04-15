import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  americanToImpliedProbability,
  expectedValue,
  confidenceFromEdge,
} from '@/lib/ev';

export const dynamic = 'force-dynamic';

type OddsOutcome = {
  name: string;
  price: number;
};

type OddsMarket = {
  key: string;
  outcomes: OddsOutcome[];
};

type Bookmaker = {
  key: string;
  title: string;
  markets: OddsMarket[];
};

type OddsEvent = {
  id: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
};

type CandidatePick = {
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: number;
  analysis: string;
  stake: number;
  result: string;
  edge: number;
  ev: number;
};

const MIN_EDGE = 0.012; // 1.2%
const MIN_EV = 0.025; // 0.025 units
const MAX_FAVORITE_PRICE = -250;
const MAX_PICKS = 5;

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
      return NextResponse.json({ error: 'Missing ODDS_API_KEY' }, { status: 500 });
    }

    const url =
      `https://api.the-odds-api.com/v4/sports/basketball_nba/odds` +
      `?apiKey=${apiKey}` +
      `&regions=us` +
      `&markets=h2h` +
      `&oddsFormat=american`;

    const oddsRes = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!oddsRes.ok) {
      const text = await oddsRes.text();
      return NextResponse.json(
        { error: `Odds API failed: ${text}` },
        { status: 502 }
      );
    }

    const events = (await oddsRes.json()) as OddsEvent[];
    const supabase = getAdminSupabase();

    const today = new Date();
    const startOfUtcDay = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    ).toISOString();

    const { data: existingRows, error: existingError } = await supabase
      .from('picks')
      .select('game,pick,created_at')
      .gte('created_at', startOfUtcDay);

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const existingSet = new Set(
      (existingRows ?? []).map((row) => `${row.game}__${row.pick}`)
    );

    const candidates: CandidatePick[] = [];

    for (const event of events) {
      const game = `${event.away_team} at ${event.home_team}`;
      const allTeamPrices = new Map<string, number[]>();

      for (const bookmaker of event.bookmakers ?? []) {
        const h2h = bookmaker.markets?.find((m) => m.key === 'h2h');
        if (!h2h) continue;

        for (const outcome of h2h.outcomes ?? []) {
          const arr = allTeamPrices.get(outcome.name) ?? [];
          arr.push(outcome.price);
          allTeamPrices.set(outcome.name, arr);
        }
      }

      for (const bookmaker of event.bookmakers ?? []) {
        const h2h = bookmaker.markets?.find((m) => m.key === 'h2h');
        if (!h2h) continue;

        for (const outcome of h2h.outcomes ?? []) {
          const allPrices = allTeamPrices.get(outcome.name) ?? [];
          if (allPrices.length < 2) continue;

          const otherBookPrices = allPrices.filter((p) => p !== outcome.price);
          const pricesForConsensus =
            otherBookPrices.length > 0 ? otherBookPrices : allPrices;

          const implieds = pricesForConsensus.map(americanToImpliedProbability);
          const consensusProbability =
            implieds.reduce((sum, n) => sum + n, 0) / implieds.length;

          const bookProbability = americanToImpliedProbability(outcome.price);
          const edge = consensusProbability - bookProbability;
          const ev = expectedValue(consensusProbability, outcome.price, 1);
          const isTooExpensiveFavorite =
            outcome.price < 0 && outcome.price < MAX_FAVORITE_PRICE;

          const passesStrong = edge >= MIN_EDGE_STRONG && ev >= MIN_EV_STRONG;
          const passesOkay = edge >= MIN_EDGE_OK && ev >= MIN_EV_OK;

if (isTooExpensiveFavorite) continue;
if (!passesStrong && !passesOkay) continue;

          const pick = `${outcome.name} ML`;
          const dedupeKey = `${game}__${pick}`;

          if (existingSet.has(dedupeKey)) continue;

          candidates.push({
            sport: 'NBA',
            game,
            pick,
            odds: outcome.price,
            confidence: confidenceFromEdge(edge),
            analysis:
              `${bookmaker.title} is offering ${outcome.price} on ${outcome.name}. ` +
              `Consensus implied win probability is ${(consensusProbability * 100).toFixed(1)}% ` +
              `vs this book at ${(bookProbability * 100).toFixed(1)}%, ` +
              `for an edge of ${(edge * 100).toFixed(1)}% and EV of ${ev.toFixed(3)}u.`,
            stake: 1,
            result: 'pending',
            edge,
            ev,
          });
        }
      }
    }

    const bestByGame = new Map<string, CandidatePick>();

    for (const candidate of candidates) {
      const current = bestByGame.get(candidate.game);

      if (!current) {
        bestByGame.set(candidate.game, candidate);
        continue;
      }

      if (candidate.ev > current.ev) {
        bestByGame.set(candidate.game, candidate);
        continue;
      }

      if (candidate.ev === current.ev && candidate.edge > current.edge) {
        bestByGame.set(candidate.game, candidate);
      }
    }

    const finalPicks = Array.from(bestByGame.values())
      .sort((a, b) => {
        if (b.ev !== a.ev) return b.ev - a.ev;
        return b.edge - a.edge;
      })
      .slice(0, MAX_PICKS)
      .map(({ edge, ev, ...row }) => row);

    if (finalPicks.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying EV picks found today.',
      });
    }

    const { data: inserted, error: insertError } = await supabase
      .from('picks')
      .insert(finalPicks)
      .select();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      inserted: inserted?.length ?? 0,
      picks: inserted ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
