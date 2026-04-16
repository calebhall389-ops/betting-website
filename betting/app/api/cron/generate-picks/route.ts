import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchAvailableSports,
  fetchOddsForSport,
  MAJOR_BOOKMAKERS,
  ALLOWED_SPORT_KEYS,
} from '@/lib/odds-api';

export const dynamic = 'force-dynamic';

const MAJOR_BOOK_SET = new Set(MAJOR_BOOKMAKERS);
const MAJOR_SPORTS_SET = new Set(ALLOWED_SPORT_KEYS);

type OddsOutcome = {
  name: string;
  price: number;
};

type OddsMarket = {
  key: string;
  outcomes: OddsOutcome[];
};

type OddsBookmaker = {
  key: string;
  title: string;
  markets: OddsMarket[];
};

type OddsGame = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
};

function americanToImpliedProbability(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function decimalFromAmerican(odds: number): number {
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

function average(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function normalizeProbabilities(probA: number, probB: number) {
  const total = probA + probB;
  if (total <= 0) return { a: 0.5, b: 0.5 };

  return {
    a: probA / total,
    b: probB / total,
  };
}

function calcEV(winProb: number, americanOdds: number): number {
  const decimalOdds = decimalFromAmerican(americanOdds);
  return winProb * (decimalOdds - 1) - (1 - winProb);
}

function getEdge(winProb: number, odds: number): number {
  const implied = americanToImpliedProbability(odds);
  return winProb - implied;
}

function getConfidenceFromEV(ev: number): number {
  if (ev >= 0.08) return 5;
  if (ev >= 0.065) return 4;
  if (ev >= 0.05) return 3;
  if (ev >= 0.04) return 2;
  return 1;
}

function getSharpConsensus(game: OddsGame) {
  const majorBooks = (game.bookmakers || []).filter((book) =>
    MAJOR_BOOK_SET.has(book.key)
  );

  const h2hPrices: Record<string, number[]> = {};

  for (const book of majorBooks) {
    const h2hMarket = book.markets?.find((m) => m.key === 'h2h');
    if (!h2hMarket) continue;

    for (const outcome of h2hMarket.outcomes || []) {
      if (typeof outcome.price !== 'number') continue;
      if (!h2hPrices[outcome.name]) h2hPrices[outcome.name] = [];
      h2hPrices[outcome.name].push(outcome.price);
    }
  }

  const homePrices = h2hPrices[game.home_team] || [];
  const awayPrices = h2hPrices[game.away_team] || [];

  // Require at least 3 books on each side before trusting consensus
  if (homePrices.length < 3 || awayPrices.length < 3) return null;

  const avgHomeOdds = average(homePrices);
  const avgAwayOdds = average(awayPrices);

  const rawHomeProb = americanToImpliedProbability(avgHomeOdds);
  const rawAwayProb = americanToImpliedProbability(avgAwayOdds);
  const normalized = normalizeProbabilities(rawHomeProb, rawAwayProb);

  return {
    homeWinProb: normalized.a,
    awayWinProb: normalized.b,
  };
}

function findBestLine(game: OddsGame) {
  let bestPick:
    | {
        side: string;
        book: string;
        bookKey: string;
        odds: number;
        winProb: number;
        ev: number;
        edge: number;
      }
    | null = null;

  const consensus = getSharpConsensus(game);
  if (!consensus) return null;

  for (const book of game.bookmakers || []) {
    if (!MAJOR_BOOK_SET.has(book.key)) continue;

    const h2hMarket = book.markets?.find((m) => m.key === 'h2h');
    if (!h2hMarket) continue;

    for (const outcome of h2hMarket.outcomes || []) {
      const isHome = outcome.name === game.home_team;
      const isAway = outcome.name === game.away_team;

      if (!isHome && !isAway) continue;
      if (typeof outcome.price !== 'number') continue;

      const winProb = isHome
        ? consensus.homeWinProb
        : consensus.awayWinProb;

      const ev = calcEV(winProb, outcome.price);
      const edge = getEdge(winProb, outcome.price);

      // Tighten pick quality
      if (edge < 0.035) continue;
      if (ev < 0.05) continue;

      if (!bestPick || ev > bestPick.ev) {
        bestPick = {
          side: outcome.name,
          book: book.title,
          bookKey: book.key,
          odds: outcome.price,
          winProb,
          ev,
          edge,
        };
      }
    }
  }

  return bestPick;
}

function buildStake(ev: number, bankroll: number) {
  if (ev >= 0.08) return Math.max(5, Math.round(bankroll * 0.025));
  if (ev >= 0.065) return Math.max(5, Math.round(bankroll * 0.02));
  if (ev >= 0.05) return Math.max(5, Math.round(bankroll * 0.015));
  return Math.max(5, Math.round(bankroll * 0.01));
}

function isAuthorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;

  const authHeader = req.headers.get('authorization');
  return authHeader === `Bearer ${cronSecret}`;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase environment variables.');
  }

  return createClient(url, serviceRole);
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Default is now tighter than before
    const bankroll = Number(process.env.BANKROLL || 1000);
    const minEV = Number(process.env.MIN_EV_THRESHOLD || 0.05);

    const availableSports = await fetchAvailableSports();
    const targetSports = availableSports.filter((sport: { key: string }) =>
      MAJOR_SPORTS_SET.has(sport.key)
    );

    const supabase = getSupabase();
    const insertedPicks: any[] = [];
    const debug: any[] = [];

    for (const sport of targetSports) {
      let games: OddsGame[] = [];

      try {
        games = await fetchOddsForSport(sport.key);
      } catch (error) {
        debug.push({
          sport: sport.key,
          error: error instanceof Error ? error.message : 'Failed to fetch odds',
        });
        continue;
      }

      for (const game of games) {
        const best = findBestLine(game);
        if (!best) continue;
        if (best.ev < minEV) continue;

        const gameLabel = `${game.away_team} at ${game.home_team}`;
        const pickText =
          best.side === game.home_team
            ? `${game.home_team} ML`
            : `${game.away_team} ML`;

        const stake = buildStake(best.ev, bankroll);

        const toWin =
          best.odds > 0
            ? Number(((stake * best.odds) / 100).toFixed(2))
            : Number(((stake * 100) / Math.abs(best.odds)).toFixed(2));

        const impliedProb = americanToImpliedProbability(best.odds);
        const evPercent = Number((best.ev * 100).toFixed(2));
        const modelProbPercent = Number((best.winProb * 100).toFixed(2));
        const impliedProbPercent = Number((impliedProb * 100).toFixed(2));
        const edgePercent = Number((best.edge * 100).toFixed(2));
        const confidence = getConfidenceFromEV(best.ev);

        const analysis = `Positive EV of ${evPercent}%. Model win probability is ${modelProbPercent}% versus market implied probability of ${impliedProbPercent}%, giving a ${edgePercent}% edge. Best available price is at ${best.book}.`;

        const { data: existing } = await supabase
          .from('picks')
          .select('id')
          .eq('game', gameLabel)
          .eq('pick', pickText)
          .eq('status', 'pending')
          .maybeSingle();

        if (existing) continue;

        const row = {
          sport: game.sport_title,
          game: gameLabel,
          pick: pickText,
          odds: best.odds,
          sportsbook: best.book,
          sportsbook_key: best.bookKey,
          confidence,
          analysis,
          stake,
          to_win: toWin,
          status: 'pending',
          ev: evPercent,
          model_prob: modelProbPercent,
          commence_time: game.commence_time,
        };

        const { data, error } = await supabase
          .from('picks')
          .insert(row)
          .select()
          .single();

        if (error) {
          debug.push({
            sport: sport.key,
            game: gameLabel,
            error: error.message,
          });
          continue;
        }

        insertedPicks.push(data);
      }
    }

    return NextResponse.json({
      success: true,
      inserted: insertedPicks.length,
      picks: insertedPicks,
      debug,
      message:
        insertedPicks.length > 0
          ? `Inserted ${insertedPicks.length} sharper pick(s).`
          : 'No qualifying sharp EV picks found today.',
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
