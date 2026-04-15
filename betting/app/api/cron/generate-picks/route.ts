import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  americanToImpliedProbability,
  expectedValue,
} from '@/lib/ev';

export const dynamic = 'force-dynamic';

/**
 * Supported sports for automated picks
 */
const SPORTS = [
  { key: 'basketball_nba', label: 'NBA' },
  { key: 'americanfootball_nfl', label: 'NFL' },
  { key: 'icehockey_nhl', label: 'NHL' },
  { key: 'mma_mixed_martial_arts', label: 'MMA' },
  { key: 'soccer_epl', label: 'Soccer (EPL)' },
  { key: 'soccer_usa_mls', label: 'Soccer (MLS)' },
  { key: 'basketball_wnba', label: 'WNBA' },
];

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

const MIN_EDGE_STRONG = 0.015;
const MIN_EV_STRONG = 0.04;
const MIN_EDGE_OK = 0.012;
const MIN_EV_OK = 0.025;
const MAX_FAVORITE_PRICE = -250;
const MAX_UNDERDOG_PRICE = 400;
const MAX_PICKS = 5;
const BANKROLL = Number(process.env.BANKROLL ?? 1000);

function confidenceFromEV(ev: number): number {
  if (ev >= 0.07) return 3;
  if (ev >= 0.04) return 2;
  return 1;
}

function kellyStake(probability: number, odds: number, bankroll: number): number {
  const decimalOdds =
    odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);

  const b = decimalOdds - 1;
  const q = 1 - probability;
  const kelly = (probability * b - q) / b;

  if (kelly <= 0) return 0;

  const fraction = kelly * 0.25;
  return Number(Math.min(fraction * bankroll, bankroll * 0.05).toFixed(2));
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

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
      return NextResponse.json(
        { error: 'Missing ODDS_API_KEY' },
        { status: 500 }
      );
    }

    const supabase = getAdminSupabase();

    const today = new Date();
    const startOfUtcDay = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    ).toISOString();

    const { data: existingRows } = await supabase
      .from('picks')
      .select('game,pick,created_at')
      .gte('created_at', startOfUtcDay);

    const existingSet = new Set(
      (existingRows ?? []).map((row) => `${row.game}__${row.pick}`)
    );

    const candidates: CandidatePick[] = [];

    // 🔁 LOOP THROUGH ALL SPORTS
    for (const sport of SPORTS) {
      const url =
        `https://api.the-odds-api.com/v4/sports/${sport.key}/odds` +
        `?apiKey=${apiKey}` +
        `&regions=us` +
        `&markets=h2h` +
        `&oddsFormat=american`;

      const oddsRes = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      if (!oddsRes.ok) continue;

      const events = (await oddsRes.json()) as OddsEvent[];

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

            const avgProb =
              allPrices
                .filter((p) => p !== outcome.price)
                .map(americanToImpliedProbability)
                .reduce((sum, p) => sum + p, 0) /
              (allPrices.length - 1);

            const bookProb = americanToImpliedProbability(outcome.price);
            const edge = avgProb - bookProb;
            const ev = expectedValue(avgProb, outcome.price, 1);

            const isTooExpensiveFavorite =
              outcome.price < 0 && outcome.price < MAX_FAVORITE_PRICE;

            const isTooLargeUnderdog =
              outcome.price > 0 && outcome.price > MAX_UNDERDOG_PRICE;

            if (isTooExpensiveFavorite || isTooLargeUnderdog) continue;
            if (
              !(edge >= MIN_EDGE_STRONG && ev >= MIN_EV_STRONG) &&
              !(edge >= MIN_EDGE_OK && ev >= MIN_EV_OK)
            ) {
              continue;
            }

            const pick = `${outcome.name} ML`;
            const dedupeKey = `${game}__${pick}`;

            if (existingSet.has(dedupeKey)) continue;

            const stake = kellyStake(avgProb, outcome.price, BANKROLL);
            if (stake <= 0) continue;

            candidates.push({
              sport: sport.label,
              game,
              pick,
              odds: outcome.price,
              confidence: confidenceFromEV(ev),
              analysis:
                `${bookmaker.title} offers ${outcome.price} on ${outcome.name}. ` +
                `Consensus probability ${(avgProb * 100).toFixed(1)}% vs ` +
                `${(bookProb * 100).toFixed(1)}%.`,
              stake,
              result: 'pending',
              edge,
              ev,
            });
          }
        }
      }
    }

    // Select best pick per game
    const bestByGame = new Map<string, CandidatePick>();
    for (const candidate of candidates) {
      const current = bestByGame.get(candidate.game);
      if (!current || candidate.ev > current.ev) {
        bestByGame.set(candidate.game, candidate);
      }
    }

    const finalPicks = Array.from(bestByGame.values())
      .sort((a, b) => b.ev - a.ev)
      .slice(0, MAX_PICKS)
      .map(({ edge, ev, ...row }) => row);

    if (finalPicks.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying EV picks found today.',
      });
    }

    const { data: inserted } = await supabase
      .from('picks')
      .insert(finalPicks)
      .select();

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
