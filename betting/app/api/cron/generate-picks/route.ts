import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

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

type OddsEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
};

type CandidatePick = {
  sport: string;
  game: string;
  pick: string;
  odds: number;
  sportsbook: string;
  impliedProbability: number;
  noVigProbability: number;
  modelProbability: number;
  edge: number;
  ev: number;
  confidence: string;
  stake: number;
  analysis: string;
};

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, key);
}

function americanToImpliedProbability(odds: number): number {
  if (odds > 0) {
    return 100 / (odds + 100);
  }
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function americanToDecimal(odds: number): number {
  if (odds > 0) {
    return 1 + odds / 100;
  }
  return 1 + 100 / Math.abs(odds);
}

function calcEV(modelProbability: number, odds: number): number {
  const decimalOdds = americanToDecimal(odds);
  const profitPerUnit = decimalOdds - 1;

  return modelProbability * profitPerUnit - (1 - modelProbability);
}

function calcNoVigProbabilities(
  outcomeAOdds: number,
  outcomeBOdds: number
): { a: number; b: number } {
  const rawA = americanToImpliedProbability(outcomeAOdds);
  const rawB = americanToImpliedProbability(outcomeBOdds);
  const total = rawA + rawB;

  return {
    a: rawA / total,
    b: rawB / total,
  };
}

function normalizeSportName(sportTitle: string): string {
  return sportTitle
    .replace('American Football', 'NFL')
    .replace('Baseball', 'MLB')
    .replace('Basketball', 'NBA')
    .replace('Ice Hockey', 'NHL');
}

function getConfidence(edge: number, ev: number): string | null {
  if (edge >= 0.10 && ev >= 0.08) return '5-star';
  if (edge >= 0.08 && ev >= 0.06) return '4-star';
  if (edge >= 0.05 && ev >= 0.04) return '3-star';
  return null;
}

function getStakeUnits(confidence: string): number {
  if (confidence === '5-star') return 2;
  if (confidence === '4-star') return 1.5;
  return 1;
}

function buildAnalysis(input: {
  pick: string;
  sportsbook: string;
  odds: number;
  impliedProbability: number;
  noVigProbability: number;
  modelProbability: number;
  edge: number;
  ev: number;
}): string {
  const marketPct = (input.noVigProbability * 100).toFixed(1);
  const modelPct = (input.modelProbability * 100).toFixed(1);
  const edgePct = (input.edge * 100).toFixed(1);
  const evPct = (input.ev * 100).toFixed(1);

  return `${input.pick} stands out because the model projects it at ${modelPct}% versus a no-vig market estimate of ${marketPct}%. At ${input.odds} on ${input.sportsbook}, that creates a ${edgePct}% edge and approximately ${evPct}% expected value, which is strong enough to clear the posting threshold.`;
}

function getPreferredBookmakers() {
  return new Set([
    'draftkings',
    'fanduel',
    'betmgm',
    'caesars',
    'espnbet',
    'betrivers',
    'fanatics',
  ]);
}

async function fetchOdds(): Promise<OddsEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ODDS_API_KEY');
  }

  const sports = [
    'basketball_nba',
    'baseball_mlb',
    'americanfootball_nfl',
    'icehockey_nhl',
  ];

  const allEvents: OddsEvent[] = [];

  for (const sport of sports) {
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=american&bookmakers=draftkings,fanduel,betmgm,caesars,espnbet,betrivers,fanatics`;

    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Odds API failed for ${sport}: ${text}`);
    }

    const data = (await res.json()) as OddsEvent[];
    allEvents.push(...data);
  }

  return allEvents;
}

function average(numbers: number[]): number {
  if (!numbers.length) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function buildCandidates(events: OddsEvent[]): CandidatePick[] {
  const preferredBooks = getPreferredBookmakers();
  const candidates: CandidatePick[] = [];

  for (const event of events) {
    const filteredBooks = (event.bookmakers || []).filter((book) =>
      preferredBooks.has(book.key)
    );

    if (filteredBooks.length < 2) continue;

    const game = `${event.away_team} at ${event.home_team}`;
    const sport = normalizeSportName(event.sport_title);

    type SideData = {
      name: string;
      prices: number[];
      books: string[];
      oppositePrices: number[];
      noVigProbs: number[];
    };

    const sideMap = new Map<string, SideData>();

    for (const book of filteredBooks) {
      const h2hMarket = book.markets?.find((m) => m.key === 'h2h');
      if (!h2hMarket || h2hMarket.outcomes.length !== 2) continue;

      const [outcomeA, outcomeB] = h2hMarket.outcomes;

      if (
        typeof outcomeA?.price !== 'number' ||
        typeof outcomeB?.price !== 'number'
      ) {
        continue;
      }

      const noVig = calcNoVigProbabilities(outcomeA.price, outcomeB.price);

      const existingA = sideMap.get(outcomeA.name) ?? {
        name: outcomeA.name,
        prices: [],
        books: [],
        oppositePrices: [],
        noVigProbs: [],
      };

      existingA.prices.push(outcomeA.price);
      existingA.books.push(book.title);
      existingA.oppositePrices.push(outcomeB.price);
      existingA.noVigProbs.push(noVig.a);
      sideMap.set(outcomeA.name, existingA);

      const existingB = sideMap.get(outcomeB.name) ?? {
        name: outcomeB.name,
        prices: [],
        books: [],
        oppositePrices: [],
        noVigProbs: [],
      };

      existingB.prices.push(outcomeB.price);
      existingB.books.push(book.title);
      existingB.oppositePrices.push(outcomeA.price);
      existingB.noVigProbs.push(noVig.b);
      sideMap.set(outcomeB.name, existingB);
    }

    for (const [, side] of sideMap) {
      if (side.prices.length < 2) continue;

      const bestLine = side.prices.reduce((best, current) => {
        const bestDecimal = americanToDecimal(best);
        const currentDecimal = americanToDecimal(current);
        return currentDecimal > bestDecimal ? current : best;
      });

      const bestIndex = side.prices.findIndex((p) => p === bestLine);
      const bestBook = side.books[bestIndex] ?? 'Best Available';

      const impliedProbability = americanToImpliedProbability(bestLine);
      const avgNoVigProbability = average(side.noVigProbs);

      // Model probability:
      // start from no-vig market baseline, then only add a small controlled edge
      // based on price improvement versus consensus.
      const consensusImplied = average(
        side.prices.map((price) => americanToImpliedProbability(price))
      );

      const priceEdge = Math.max(0, consensusImplied - impliedProbability);

      // Controlled bump so the model is selective and does not spam weak picks.
      const modelProbability = Math.min(
        avgNoVigProbability + priceEdge * 1.35 + 0.015,
        0.80
      );

      const edge = modelProbability - avgNoVigProbability;
      const ev = calcEV(modelProbability, bestLine);
      const confidence = getConfidence(edge, ev);

      // Hard filters to make picks sharper
      const enoughBooks = side.prices.length >= 3;
      const lineSpread =
        Math.max(...side.prices.map(americanToDecimal)) -
        Math.min(...side.prices.map(americanToDecimal));
      const marketIsReasonable = lineSpread <= 0.18;

      if (!enoughBooks) continue;
      if (!marketIsReasonable) continue;
      if (edge < 0.05) continue;
      if (ev < 0.04) continue;
      if (!confidence) continue;

      const pickLabel =
        side.name === event.home_team || side.name === event.away_team
          ? `${side.name} ML`
          : side.name;

      candidates.push({
        sport,
        game,
        pick: pickLabel,
        odds: bestLine,
        sportsbook: bestBook,
        impliedProbability,
        noVigProbability: avgNoVigProbability,
        modelProbability,
        edge,
        ev,
        confidence,
        stake: getStakeUnits(confidence),
        analysis: buildAnalysis({
          pick: pickLabel,
          sportsbook: bestBook,
          odds: bestLine,
          impliedProbability,
          noVigProbability: avgNoVigProbability,
          modelProbability,
          edge,
          ev,
        }),
      });
    }
  }

  return candidates;
}

export async function GET() {
  try {
    const supabase = getSupabase();

    const events = await fetchOdds();
    const candidates = buildCandidates(events);

    const finalPicks = candidates
      .sort((a, b) => {
        if (b.ev !== a.ev) return b.ev - a.ev;
        return b.edge - a.edge;
      })
      .slice(0, 5);

    if (!finalPicks.length) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying sharp picks found today.',
        picks: [],
      });
    }

    const rowsToInsert = finalPicks.map((pick) => ({
      sport: pick.sport,
      game: pick.game,
      pick: pick.pick,
      odds: pick.odds,
      confidence: pick.confidence,
      stake: pick.stake,
      result: 'pending',
      analysis: pick.analysis,
      edge: Number((pick.edge * 100).toFixed(2)),
      ev: Number((pick.ev * 100).toFixed(2)),
      sportsbook: pick.sportsbook,
      model_probability: Number((pick.modelProbability * 100).toFixed(2)),
      market_probability: Number((pick.noVigProbability * 100).toFixed(2)),
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
      inserted: data?.length ?? 0,
      picks: data ?? rowsToInsert,
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
