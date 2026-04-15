import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  americanToImpliedProbability,
  expectedValue,
} from '@/lib/ev';

export const dynamic = 'force-dynamic';

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
  point?: number;
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

type SportDebug = {
  sport: string;
  status: 'ok' | 'error';
  events: number;
  candidates: number;
  insertedCandidates: number;
  message?: string;
};

const MIN_EDGE_STRONG = 0.01;
const MIN_EV_STRONG = 0.02;
const MIN_EDGE_OK = 0.005;
const MIN_EV_OK = 0.01;
const MAX_FAVORITE_PRICE = -300;
const MAX_UNDERDOG_PRICE = 500;
const MAX_PICKS = 25;
const BANKROLL = Number(process.env.BANKROLL ?? 1000);

function confidenceFromEV(ev: number): number {
  if (ev >= 0.12) return 5;
  if (ev >= 0.08) return 4;
  if (ev >= 0.05) return 3;
  if (ev >= 0.02) return 2;
  return 1;
}

function kellyStake(
  probability: number,
  odds: number,
  bankroll: number
): number {
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

function buildPickLabel(marketKey: string, outcome: OddsOutcome) {
  if (marketKey === 'h2h') {
    return `${outcome.name} ML`;
  }

  if (marketKey === 'spreads') {
    const point =
      typeof outcome.point === 'number'
        ? `${outcome.point > 0 ? '+' : ''}${outcome.point}`
        : '';
    return point ? `${outcome.name} ${point}` : outcome.name;
  }

  if (marketKey === 'totals') {
    const point =
      typeof outcome.point === 'number' ? `${outcome.point}` : '';
    return point ? `${outcome.name} ${point}` : outcome.name;
  }

  return outcome.name;
}

function marketDisplayName(marketKey: string) {
  switch (marketKey) {
    case 'h2h':
      return 'moneyline';
    case 'spreads':
      return 'spread';
    case 'totals':
      return 'total';
    default:
      return marketKey;
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

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

    const { data: existingRows, error: existingError } = await supabase
      .from('picks')
      .select('game,pick,created_at')
      .gte('created_at', startOfUtcDay);

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      );
    }

    const existingSet = new Set(
      (existingRows ?? []).map((row) => `${row.game}__${row.pick}`)
    );

    const candidates: CandidatePick[] = [];
    const debug: SportDebug[] = [];

    for (const sport of SPORTS) {
      const sportStartCount = candidates.length;

      try {
        const url =
          `https://api.the-odds-api.com/v4/sports/${sport.key}/odds` +
          `?apiKey=${apiKey}` +
          `&regions=us` +
          `&markets=h2h,spreads,totals` +
          `&oddsFormat=american`;

        const oddsRes = await fetch(url, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });

        if (!oddsRes.ok) {
          const text = await oddsRes.text();
          debug.push({
            sport: sport.label,
            status: 'error',
            events: 0,
            candidates: 0,
            insertedCandidates: 0,
            message: text.slice(0, 300),
          });
          continue;
        }

        const events = (await oddsRes.json()) as OddsEvent[];

        for (const event of events) {
          const game = `${event.away_team} at ${event.home_team}`;
          const marketPriceMap = new Map<string, number[]>();

          for (const bookmaker of event.bookmakers ?? []) {
            for (const market of bookmaker.markets ?? []) {
              if (!['h2h', 'spreads', 'totals'].includes(market.key)) continue;

              for (const outcome of market.outcomes ?? []) {
                const pointKey =
                  typeof outcome.point === 'number'
                    ? `${outcome.point}`
                    : 'none';

                const marketOutcomeKey = `${market.key}__${outcome.name}__${pointKey}`;
                const arr = marketPriceMap.get(marketOutcomeKey) ?? [];
                arr.push(outcome.price);
                marketPriceMap.set(marketOutcomeKey, arr);
              }
            }
          }

          for (const bookmaker of event.bookmakers ?? []) {
            for (const market of bookmaker.markets ?? []) {
              if (!['h2h', 'spreads', 'totals'].includes(market.key)) continue;

              for (const outcome of market.outcomes ?? []) {
                const pointKey =
                  typeof outcome.point === 'number'
                    ? `${outcome.point}`
                    : 'none';

                const marketOutcomeKey = `${market.key}__${outcome.name}__${pointKey}`;
                const allPrices = marketPriceMap.get(marketOutcomeKey) ?? [];

                if (allPrices.length < 2) continue;

                const priceIndex = allPrices.indexOf(outcome.price);
                const pricesForConsensus =
                  priceIndex >= 0
                    ? allPrices.filter((_, i) => i !== priceIndex)
                    : allPrices;

                if (pricesForConsensus.length === 0) continue;

                const implieds = pricesForConsensus.map(
                  americanToImpliedProbability
                );

                const consensusProbability =
                  implieds.reduce((sum, n) => sum + n, 0) / implieds.length;

                const bookProbability = americanToImpliedProbability(outcome.price);
                const edge = consensusProbability - bookProbability;
                const ev = expectedValue(consensusProbability, outcome.price, 1);

                const isTooExpensiveFavorite =
                  outcome.price < 0 && outcome.price < MAX_FAVORITE_PRICE;

                const isTooLargeUnderdog =
                  outcome.price > 0 && outcome.price > MAX_UNDERDOG_PRICE;

                const passesStrong =
                  edge >= MIN_EDGE_STRONG && ev >= MIN_EV_STRONG;

                const passesOkay =
                  edge >= MIN_EDGE_OK && ev >= MIN_EV_OK;

                if (isTooExpensiveFavorite || isTooLargeUnderdog) continue;
                if (!passesStrong && !passesOkay) continue;

                const pick = buildPickLabel(market.key, outcome);
                const dedupeKey = `${game}__${pick}`;

                if (existingSet.has(dedupeKey)) continue;

                const stake = kellyStake(
                  consensusProbability,
                  outcome.price,
                  BANKROLL
                );

                if (stake <= 0) continue;

                candidates.push({
                  sport: sport.label,
                  game,
                  pick,
                  odds: outcome.price,
                  confidence: confidenceFromEV(ev),
                  analysis:
                    `${bookmaker.title} is offering ${outcome.price} on ${pick}. ` +
                    `Consensus implied probability is ${(consensusProbability * 100).toFixed(1)}% ` +
                    `vs this book at ${(bookProbability * 100).toFixed(1)}%. ` +
                    `Market: ${marketDisplayName(market.key)}. ` +
                    `Edge: ${(edge * 100).toFixed(1)}%. EV: ${ev.toFixed(3)}u.`,
                  stake,
                  result: 'pending',
                  edge,
                  ev,
                });
              }
            }
          }
        }

        debug.push({
          sport: sport.label,
          status: 'ok',
          events: events.length,
          candidates: candidates.length - sportStartCount,
          insertedCandidates: 0,
        });
      } catch (error) {
        debug.push({
          sport: sport.label,
          status: 'error',
          events: 0,
          candidates: 0,
          insertedCandidates: 0,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const bestByGame = new Map<string, CandidatePick>();

    for (const candidate of candidates) {
      const current = bestByGame.get(candidate.game);

      if (!current || candidate.ev > current.ev) {
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

    for (const item of debug) {
      item.insertedCandidates = finalPicks.filter(
        (pick) => pick.sport === item.sport
      ).length;
    }

    if (finalPicks.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying EV picks found today.',
        debug,
      });
    }

    const { data: inserted, error: insertError } = await supabase
      .from('picks')
      .insert(finalPicks)
      .select();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message, debug },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      inserted: inserted?.length ?? 0,
      picks: inserted ?? [],
      debug,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
