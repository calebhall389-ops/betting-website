import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/* ================================
   Types
================================ */
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

/* ================================
   Supabase Client
================================ */
function getSupabase() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(url, key);
}

/* ================================
   Odds + Math Utilities
================================ */
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
  oddsA: number,
  oddsB: number
): { a: number; b: number } {
  const pA = americanToImpliedProbability(oddsA);
  const pB = americanToImpliedProbability(oddsB);
  const total = pA + pB;

  return {
    a: pA / total,
    b: pB / total,
  };
}

function average(numbers: number[]): number {
  if (!numbers.length) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function normalizeSportName(sportTitle: string): string {
  return sportTitle
    .replace('American Football', 'NFL')
    .replace('Baseball', 'MLB')
    .replace('Basketball', 'NBA')
    .replace('Ice Hockey', 'NHL');
}

/* ================================
   Pick Logic
================================ */
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
  noVigProbability: number;
  modelProbability: number;
  edge: number;
  ev: number;
}): string {
  const marketPct = (input.noVigProbability * 100).toFixed(1);
  const modelPct = (input.modelProbability * 100).toFixed(1);
  const edgePct = (input.edge * 100).toFixed(1);
  const evPct = (input.ev * 100).toFixed(1);

  return `${input.pick} is priced at ${input.odds} on ${input.sportsbook}. The model projects a ${modelPct}% win probability versus a no-vig market estimate of ${marketPct}%, creating a ${edgePct}% edge and ${evPct}% expected value.`;
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

/* ================================
   Fetch Odds
================================ */
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

/* ================================
   Build Candidates
================================ */
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
      noVigProbs: number[];
    };

    const sideMap = new Map<string, SideData>();

    for (const book of filteredBooks) {
      const market = book.markets?.find((m) => m.key === 'h2h');
      if (!market || market.outcomes.length !== 2) continue;

      const [a, b] = market.outcomes;
      const noVig = calcNoVigProbabilities(a.price, b.price);

      const sideA = sideMap.get(a.name) || {
        name: a.name,
        prices: [],
        books: [],
        noVigProbs: [],
      };

      sideA.prices.push(a.price);
      sideA.books.push(book.title);
      sideA.noVigProbs.push(noVig.a);
      sideMap.set(a.name, sideA);

      const sideB = sideMap.get(b.name) || {
        name: b.name,
        prices: [],
        books: [],
        noVigProbs: [],
      };

      sideB.prices.push(b.price);
      sideB.books.push(book.title);
      sideB.noVigProbs.push(noVig.b);
      sideMap.set(b.name, sideB);
    }

    // ✅ QUICK FIX: Avoid Map iteration error
    for (const side of Array.from(sideMap.values())) {
      if (side.prices.length < 2) continue;

      const bestLine = side.prices.reduce((best, current) => {
        const bestDecimal = americanToDecimal(best);
        const currentDecimal = americanToDecimal(current);
        return currentDecimal > bestDecimal ? current : best;
      });

      const bestIndex = side.prices.indexOf(bestLine);
      const bestBook = side.books[bestIndex] ?? 'Best Available';

      const impliedProbability =
        americanToImpliedProbability(bestLine);

      const avgNoVigProbability = average(side.noVigProbs);

      const consensusImplied = average(
        side.prices.map((price) =>
          americanToImpliedProbability(price)
        )
      );

      const priceEdge = Math.max(
        0,
        consensusImplied - impliedProbability
      );

      const modelProbability = Math.min(
        avgNoVigProbability + priceEdge * 1.35 + 0.015,
        0.8
      );

      const edge = modelProbability - avgNoVigProbability;
      const ev = calcEV(modelProbability, bestLine);
      const confidence = getConfidence(edge, ev);

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

      const pickLabel = `${side.name} ML`;

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

/* ================================
   API Route
================================ */
export async function GET() {
  try {
    const supabase = getSupabase();
    const events = await fetchOdds();
    const candidates = buildCandidates(events);

    const finalPicks = candidates
      .sort((a, b) => b.ev - a.ev)
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
      model_probability: Number(
        (pick.modelProbability * 100).toFixed(2)
      ),
      market_probability: Number(
        (pick.noVigProbability * 100).toFixed(2)
      ),
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
      picks: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
