import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type OddsApiOutcome = {
  name: string;
  price: number;
};

type OddsApiMarket = {
  key: string;
  outcomes: OddsApiOutcome[];
};

type OddsApiBookmaker = {
  key: string;
  title: string;
  markets: OddsApiMarket[];
};

type OddsApiEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsApiBookmaker[];
};

type CandidatePick = {
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: number;
  stake: number;
  result: string;
  sportsbook: string;
  edge: number;
  ev: number;
  analysis: string;
  game_time: string | null;
  commence_time: string | null;
  market_probability: number;
  model_probability: number;
  play_rating: string;
};

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(url, serviceRoleKey);
}

function americanToImpliedProbability(odds: number): number {
  if (odds > 0) {
    return 100 / (odds + 100);
  }
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function impliedProbabilityToAmerican(probability: number): number {
  if (probability <= 0 || probability >= 1) {
    throw new Error('Probability must be between 0 and 1.');
  }

  if (probability >= 0.5) {
    return Math.round((-probability / (1 - probability)) * 100);
  }

  return Math.round(((1 - probability) / probability) * 100);
}

function decimalFromAmerican(odds: number): number {
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

function expectedValue(modelProbability: number, americanOdds: number): number {
  const decimalOdds = decimalFromAmerican(americanOdds);
  return modelProbability * (decimalOdds - 1) - (1 - modelProbability);
}

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function normalizeSportLabel(sportTitle: string): string {
  const upper = sportTitle.toUpperCase();

  if (upper.includes('BASEBALL')) return 'MLB';
  if (upper.includes('BASKETBALL') && upper.includes('NBA')) return 'NBA';
  if (upper.includes('HOCKEY')) return 'NHL';
  if (upper.includes('FOOTBALL') && upper.includes('NFL')) return 'NFL';
  if (upper.includes('SOCCER')) return 'Soccer';

  return sportTitle;
}

function getTodayIsoDateStrings() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function isTodayGame(commenceTime: string): boolean {
  const gameDate = new Date(commenceTime);
  const { startIso, endIso } = getTodayIsoDateStrings();
  const start = new Date(startIso);
  const end = new Date(endIso);

  return gameDate >= start && gameDate <= end;
}

function getAllowedSports() {
  const sports = (
    process.env.PICKS_SPORTS ||
    'baseball_mlb,basketball_nba,icehockey_nhl,americanfootball_nfl'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return sports;
}

function getSharpBookmakerKeys() {
  return (
    process.env.PICKS_BOOKMAKERS ||
    'fanduel,draftkings,betmgm,caesars,espnbet,fliff,bovada'
  )
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function getBankroll() {
  const bankroll = Number(process.env.BANKROLL || '1000');
  return Number.isFinite(bankroll) && bankroll > 0 ? bankroll : 1000;
}

function getUnitSize() {
  const unitPercent = Number(process.env.UNIT_SIZE_PERCENT || '0.01');
  return Number.isFinite(unitPercent) && unitPercent > 0 ? unitPercent : 0.01;
}

/**
 * This is a simple market-based model.
 * It starts from consensus implied probability and slightly boosts/dings it
 * based on best-price disagreement.
 *
 * It is not a true predictive model, but it is clean and consistent.
 */
function estimateModelProbability(
  consensusProbability: number,
  bestPriceProbability: number
): number {
  const edgeSignal = consensusProbability - bestPriceProbability;

  // controlled bump instead of wild scaling
  let modelProbability = consensusProbability + edgeSignal * 0.65;

  // clamp to realistic range
  modelProbability = Math.max(0.02, Math.min(0.85, modelProbability));

  return modelProbability;
}

function getPlayRating({
  modelProbability,
  edge,
  ev,
  odds,
}: {
  modelProbability: number;
  edge: number;
  ev: number;
  odds: number;
}): string {
  if (
    modelProbability >= 0.57 &&
    edge >= 0.05 &&
    ev >= 0.10 &&
    odds >= -200 &&
    odds <= 200
  ) {
    return 'MAX PLAY';
  }

  if (
    modelProbability >= 0.52 &&
    edge >= 0.035 &&
    ev >= 0.075 &&
    odds >= -250 &&
    odds <= 250
  ) {
    return 'A PLAY';
  }

  if (
    modelProbability >= 0.48 &&
    edge >= 0.025 &&
    ev >= 0.05
  ) {
    return 'B PLAY';
  }

  return 'PASS';
}

function calculateStake({
  bankroll,
  unitPercent,
  playRating,
}: {
  bankroll: number;
  unitPercent: number;
  playRating: string;
}): number {
  const baseUnit = bankroll * unitPercent;

  if (playRating === 'MAX PLAY') return Math.round(baseUnit * 3);
  if (playRating === 'A PLAY') return Math.round(baseUnit * 2);
  if (playRating === 'B PLAY') return Math.round(baseUnit * 1);

  return Math.round(baseUnit);
}

async function fetchOddsForSport(sportKey: string): Promise<OddsApiEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;
  const regions = process.env.ODDS_API_REGIONS || 'us';
  const markets = 'h2h';
  const oddsFormat = 'american';
  const dateFormat = 'iso';

  if (!apiKey) {
    throw new Error('Missing ODDS_API_KEY');
  }

  const sharpBookmakers = getSharpBookmakerKeys().join(',');

  const url =
    `https://api.the-odds-api.com/v4/sports/${sportKey}/odds` +
    `?apiKey=${apiKey}` +
    `&regions=${regions}` +
    `&markets=${markets}` +
    `&oddsFormat=${oddsFormat}` +
    `&dateFormat=${dateFormat}` +
    `&bookmakers=${sharpBookmakers}`;

  const res = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API failed for ${sportKey}: ${text}`);
  }

  const data = (await res.json()) as OddsApiEvent[];
  return Array.isArray(data) ? data : [];
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const supabase = getSupabase();
    const sports = getAllowedSports();
    const bankroll = getBankroll();
    const unitPercent = getUnitSize();

    const allEvents: OddsApiEvent[] = [];

    for (const sport of sports) {
      const events = await fetchOddsForSport(sport);
      allEvents.push(...events);
    }

    const todayEvents = allEvents.filter(
      (event) => event.commence_time && isTodayGame(event.commence_time)
    );

    const candidates: CandidatePick[] = [];

    for (const event of todayEvents) {
      const bookmakers = (event.bookmakers || []).filter(
        (b) => Array.isArray(b.markets) && b.markets.length > 0
      );

      if (bookmakers.length < 2) continue;

      const sidePrices: Record<
        string,
        { prices: number[]; bestPrice: number; bestBook: string }
      > = {};

      for (const bookmaker of bookmakers) {
        const h2hMarket = bookmaker.markets.find((m) => m.key === 'h2h');
        if (!h2hMarket?.outcomes?.length) continue;

        for (const outcome of h2hMarket.outcomes) {
          if (!sidePrices[outcome.name]) {
            sidePrices[outcome.name] = {
              prices: [],
              bestPrice: outcome.price,
              bestBook: bookmaker.title,
            };
          }

          sidePrices[outcome.name].prices.push(outcome.price);

          if (outcome.price > sidePrices[outcome.name].bestPrice) {
            sidePrices[outcome.name].bestPrice = outcome.price;
            sidePrices[outcome.name].bestBook = bookmaker.title;
          }
        }
      }

      for (const [teamName, sideData] of Object.entries(sidePrices)) {
        if (sideData.prices.length < 2) continue;

        const consensusProbability =
          sideData.prices
            .map((price) => americanToImpliedProbability(price))
            .reduce((sum, p) => sum + p, 0) / sideData.prices.length;

        const bestPriceProbability = americanToImpliedProbability(
          sideData.bestPrice
        );

        const modelProbability = estimateModelProbability(
          consensusProbability,
          bestPriceProbability
        );

        const edge = modelProbability - bestPriceProbability;
        const ev = expectedValue(modelProbability, sideData.bestPrice);

        // HARD FILTERS FOR SHARPER PICKS
        if (modelProbability < 0.12) continue; // reject very low-probability longshots
        if (edge < 0.02) continue; // need at least 2% true edge
        if (ev < 0.05) continue; // need at least 5% EV
        if (sideData.bestPrice > 500) continue; // reject crazy longshots
        if (sideData.bestPrice < -250) continue; // reject huge favorites

        const playRating = getPlayRating({
          modelProbability,
          edge,
          ev,
          odds: sideData.bestPrice,
        });

        if (playRating === 'PASS') continue;

        const stake = calculateStake({
          bankroll,
          unitPercent,
          playRating,
        });

        const marketProbability = bestPriceProbability;
        const confidence = Math.round(modelProbability * 100);

        const analysis =
          `${teamName} moneyline shows value versus the consensus market. ` +
          `Best price found: ${formatOdds(sideData.bestPrice)} at ${sideData.bestBook}. ` +
          `Model win probability: ${(modelProbability * 100).toFixed(2)}%. ` +
          `Market implied probability: ${(marketProbability * 100).toFixed(2)}%. ` +
          `Estimated edge: ${(edge * 100).toFixed(2)}%. ` +
          `Estimated EV: ${(ev * 100).toFixed(2)}%. ` +
          `Play rating: ${playRating}.`;

        candidates.push({
          sport: normalizeSportLabel(event.sport_title),
          game: `${event.away_team} at ${event.home_team}`,
          pick: `${teamName} ML`,
          odds: sideData.bestPrice,
          confidence,
          stake,
          result: 'pending',
          sportsbook: sideData.bestBook,
          edge: Number((edge * 100).toFixed(2)),
          ev: Number((ev * 100).toFixed(2)),
          analysis,
          game_time: event.commence_time || null,
          commence_time: event.commence_time || null,
          market_probability: Number((marketProbability * 100).toFixed(2)),
          model_probability: Number((modelProbability * 100).toFixed(2)),
          play_rating: playRating,
        });
      }
    }

    // sort strongest first
    candidates.sort((a, b) => {
      if (b.ev !== a.ev) return b.ev - a.ev;
      if (b.edge !== a.edge) return b.edge - a.edge;
      return b.confidence - a.confidence;
    });

    // keep only the sharpest few per day
    const maxPicks = Number(process.env.MAX_PICKS_PER_DAY || '5');
    const finalPicks = candidates.slice(0, maxPicks);

    if (finalPicks.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying sharp picks found today.',
        debug: {
          eventsChecked: todayEvents.length,
          candidatesFound: candidates.length,
        },
      });
    }

    // optional: clear today's pending picks before inserting fresh ones
    const clearToday = process.env.CLEAR_OLD_PICKS_BEFORE_INSERT === 'true';

    if (clearToday) {
      const { startIso, endIso } = getTodayIsoDateStrings();

      const { error: deleteError } = await supabase
        .from('picks')
        .delete()
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .eq('result', 'pending');

      if (deleteError) {
        throw new Error(`Failed clearing old picks: ${deleteError.message}`);
      }
    }

    const rowsToInsert = finalPicks.map((pick) => ({
      sport: pick.sport,
      game: pick.game,
      pick: pick.pick,
      odds: pick.odds,
      confidence: pick.confidence,
      stake: pick.stake,
      result: pick.result,
      sportsbook: pick.sportsbook,
      edge: pick.edge,
      ev: pick.ev,
      analysis: pick.analysis,
      game_time: pick.game_time,
      commence_time: pick.commence_time,
      market_probability: pick.market_probability,
      model_probability: pick.model_probability,
      play_rating: pick.play_rating,
    }));

    const { data, error } = await supabase
      .from('picks')
      .insert(rowsToInsert)
      .select();

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      inserted: data?.length || 0,
      picks: data || [],
      debug: {
        eventsChecked: todayEvents.length,
        candidatesFound: candidates.length,
        finalPicks: finalPicks.length,
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
