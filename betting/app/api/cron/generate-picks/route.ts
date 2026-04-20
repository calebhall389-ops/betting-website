import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type OddsOutcome = {
  name: string;
  price: number;
  point?: number;
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
  bookmakers?: OddsBookmaker[];
};

type PickInsert = {
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: string;
  analysis: string;
  stake: number;
  result: string;
  sportsbook: string | null;
  sportsbook_key: string | null;
  status: string;
  commence_time: string;
  market_type: string;
  edge: number;
  ev: number;
  implied_probability: number;
  model_probability: number;
  fair_odds: number | null;
  play_rating: string;
};

type Candidate = PickInsert & {
  gameKey: string;
  sortScore: number;
};

const CRON_SECRET = process.env.CRON_SECRET;
const ODDS_API_KEY = process.env.ODDS_API_KEY;
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---------- SETTINGS ----------
const MIN_EDGE = 3.0;
const MIN_EV = 2.0;
const MIN_CONFIDENCE = 52;
const MIN_BOOKS = 2;
const MAX_PICKS = 5;
const ONE_PICK_PER_GAME = true;

// only use major books
const ALLOWED_BOOKS = new Set([
  'draftkings',
  'fanduel',
  'betmgm',
  'caesars',
  'espnbet',
  'ballybet',
  'bet365',
  'betrivers',
  'pointsbetus',
  'hardrockbet',
  'williamhill_us',
]);

const SUPPORTED_SPORTS = [
  'baseball_mlb',
  'basketball_nba',
  'icehockey_nhl',
  'americanfootball_nfl',
  'basketball_ncaab',
];

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function americanToImpliedProb(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function probabilityToAmerican(prob: number): number | null {
  if (prob <= 0 || prob >= 1) return null;

  if (prob >= 0.5) {
    return Math.round((-prob / (1 - prob)) * 100);
  }

  return Math.round(((1 - prob) / prob) * 100);
}

function expectedValue(modelProb: number, americanOdds: number): number {
  const decimalOdds =
    americanOdds > 0
      ? 1 + americanOdds / 100
      : 1 + 100 / Math.abs(americanOdds);

  return modelProb * (decimalOdds - 1) - (1 - modelProb);
}

function getPlayRating(edge: number, ev: number): string {
  if (edge >= 7 && ev >= 6) return 'A+';
  if (edge >= 6 && ev >= 5) return 'A';
  if (edge >= 5 && ev >= 4) return 'B+';
  if (edge >= 4 && ev >= 3) return 'B';
  if (edge >= 3 && ev >= 2) return 'C';
  return 'LEAN';
}

function getConfidence(modelProb: number, edge: number, ev: number): number {
  const probScore = modelProb * 100;
  const edgeBoost = Math.min(edge * 1.8, 12);
  const evBoost = Math.min(ev * 1.2, 10);

  return Math.max(
    1,
    Math.min(99, Math.round(probScore + edgeBoost + evBoost))
  );
}

function isPregame(commenceTime: string): boolean {
  const start = new Date(commenceTime).getTime();
  const now = Date.now();
  return start > now + 5 * 60 * 1000;
}

function isTodayOrTomorrow(commenceTime: string): boolean {
  const gameDate = new Date(commenceTime);
  const now = new Date();

  const localToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();

  const localDayAfterTomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 2
  ).getTime();

  const gameLocalDate = new Date(
    gameDate.getFullYear(),
    gameDate.getMonth(),
    gameDate.getDate()
  ).getTime();

  return gameLocalDate >= localToday && gameLocalDate < localDayAfterTomorrow;
}

function normalizeSportLabel(sportKey: string, sportTitle: string): string {
  if (sportKey.includes('mlb')) return 'MLB';
  if (sportKey.includes('nba')) return 'NBA';
  if (sportKey.includes('nhl')) return 'NHL';
  if (sportKey.includes('nfl')) return 'NFL';
  if (sportKey.includes('ncaab')) return 'NCAAB';
  return sportTitle;
}

async function fetchOddsForSport(sport: string): Promise<OddsEvent[]> {
  if (!ODDS_API_KEY) {
    throw new Error('Missing ODDS_API_KEY');
  }

  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
  url.searchParams.set('apiKey', ODDS_API_KEY);
  url.searchParams.set('regions', 'us');
  url.searchParams.set('markets', 'h2h,spreads,totals');
  url.searchParams.set('oddsFormat', 'american');
  url.searchParams.set('bookmakers', Array.from(ALLOWED_BOOKS).join(','));

  const res = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API error for ${sport}: ${res.status} ${text}`);
  }

  return (await res.json()) as OddsEvent[];
}

function average(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function buildGameLabel(event: OddsEvent): string {
  return `${event.away_team} at ${event.home_team}`;
}

function marketLabel(
  type: 'h2h' | 'spreads' | 'totals',
  side: string,
  point?: number
): string {
  if (type === 'h2h') return `${side} ML`;

  if (type === 'spreads') {
    const p = typeof point === 'number' ? point : 0;
    return `${side} ${p > 0 ? '+' : ''}${p}`;
  }

  const p = typeof point === 'number' ? point : 0;
  return `${side} ${p}`;
}

function getCandidateAnalysis(input: {
  pick: string;
  sportsbook: string;
  odds: number;
  modelProb: number;
  impliedProb: number;
  edge: number;
  ev: number;
  fairOdds: number | null;
  booksUsed: number;
  marketType: string;
}): string {
  const fairOddsText =
    input.fairOdds === null
      ? 'N/A'
      : input.fairOdds > 0
      ? `+${input.fairOdds}`
      : `${input.fairOdds}`;

  const oddsText = input.odds > 0 ? `+${input.odds}` : `${input.odds}`;

  return `${input.pick} at ${input.sportsbook} is priced at ${oddsText} versus a model fair line of ${fairOddsText}. Model probability is ${(input.modelProb * 100).toFixed(1)}% compared with market implied probability of ${(input.impliedProb * 100).toFixed(1)}%. Estimated edge is ${input.edge.toFixed(2)}% and estimated EV is ${input.ev.toFixed(2)}%. Books used in consensus: ${input.booksUsed}. Market: ${input.marketType}.`;
}

function extractCandidatesFromEvent(event: OddsEvent): Candidate[] {
  const bookmakers = (event.bookmakers || []).filter((b) =>
    ALLOWED_BOOKS.has(b.key)
  );

  if (bookmakers.length < MIN_BOOKS) return [];

  const game = buildGameLabel(event);
  const sport = normalizeSportLabel(event.sport_key, event.sport_title);

  const candidates: Candidate[] = [];

  // ---------- MONEYLINE ----------
  {
    const sidePrices: Record<
      string,
      {
        prices: number[];
        bestPrice: number;
        bestBook: string;
        bestBookKey: string;
      }
    > = {};

    for (const bm of bookmakers) {
      const market = bm.markets.find((m) => m.key === 'h2h');
      if (!market) continue;

      for (const outcome of market.outcomes) {
        if (typeof outcome.price !== 'number') continue;

        if (!sidePrices[outcome.name]) {
          sidePrices[outcome.name] = {
            prices: [],
            bestPrice: outcome.price,
            bestBook: bm.title,
            bestBookKey: bm.key,
          };
        }

        sidePrices[outcome.name].prices.push(outcome.price);

        if (outcome.price > sidePrices[outcome.name].bestPrice) {
          sidePrices[outcome.name].bestPrice = outcome.price;
          sidePrices[outcome.name].bestBook = bm.title;
          sidePrices[outcome.name].bestBookKey = bm.key;
        }
      }
    }

    for (const [team, data] of Object.entries(sidePrices)) {
      if (data.prices.length < MIN_BOOKS) continue;

      const consensusProb = average(
        data.prices.map((p) => americanToImpliedProb(p))
      );

      const modelProb = Math.min(consensusProb + 0.045, 0.93);
      const bestPrice = data.bestPrice;
      const impliedProb = americanToImpliedProb(bestPrice);
      const edge = (modelProb - impliedProb) * 100;
      const ev = expectedValue(modelProb, bestPrice) * 100;
      const confidence = getConfidence(modelProb, edge, ev);
      const fairOdds = probabilityToAmerican(modelProb);
      const playRating = getPlayRating(edge, ev);

      if (
        edge >= MIN_EDGE &&
        ev >= MIN_EV &&
        confidence >= MIN_CONFIDENCE
      ) {
        const pick = marketLabel('h2h', team);
        const analysis = getCandidateAnalysis({
          pick,
          sportsbook: data.bestBook,
          odds: bestPrice,
          modelProb,
          impliedProb,
          edge,
          ev,
          fairOdds,
          booksUsed: data.prices.length,
          marketType: 'moneyline',
        });

        candidates.push({
          sport,
          game,
          pick,
          odds: bestPrice,
          confidence: String(confidence),
          analysis,
          stake: playRating === 'A+' || playRating === 'A' ? 1.5 : 1,
          result: 'pending',
          sportsbook: data.bestBook,
          sportsbook_key: data.bestBookKey,
          status: 'open',
          commence_time: event.commence_time,
          market_type: 'moneyline',
          edge: Number(edge.toFixed(2)),
          ev: Number(ev.toFixed(2)),
          implied_probability: Number((impliedProb * 100).toFixed(2)),
          model_probability: Number((modelProb * 100).toFixed(2)),
          fair_odds: fairOdds,
          play_rating: playRating,
          gameKey: event.id,
          sortScore: edge * 0.65 + ev * 0.35,
        });
      }
    }
  }

  // ---------- SPREADS ----------
  {
    const spreadMap: Record<
      string,
      {
        side: string;
        point: number;
        prices: number[];
        bestPrice: number;
        bestBook: string;
        bestBookKey: string;
      }
    > = {};

    for (const bm of bookmakers) {
      const market = bm.markets.find((m) => m.key === 'spreads');
      if (!market) continue;

      for (const outcome of market.outcomes) {
        if (
          typeof outcome.price !== 'number' ||
          typeof outcome.point !== 'number'
        ) {
          continue;
        }

        const key = `${outcome.name}__${outcome.point}`;

        if (!spreadMap[key]) {
          spreadMap[key] = {
            side: outcome.name,
            point: outcome.point,
            prices: [],
            bestPrice: outcome.price,
            bestBook: bm.title,
            bestBookKey: bm.key,
          };
        }

        spreadMap[key].prices.push(outcome.price);

        if (outcome.price > spreadMap[key].bestPrice) {
          spreadMap[key].bestPrice = outcome.price;
          spreadMap[key].bestBook = bm.title;
          spreadMap[key].bestBookKey = bm.key;
        }
      }
    }

    for (const item of Object.values(spreadMap)) {
      if (item.prices.length < MIN_BOOKS) continue;

      const consensusProb = average(
        item.prices.map((p) => americanToImpliedProb(p))
      );

      const strongerSpread = Math.abs(item.point) <= 4.5 ? 0.04 : 0.03;

      const modelProb = Math.min(consensusProb + strongerSpread, 0.9);
      const bestPrice = item.bestPrice;
      const impliedProb = americanToImpliedProb(bestPrice);
      const edge = (modelProb - impliedProb) * 100;
      const ev = expectedValue(modelProb, bestPrice) * 100;
      const confidence = getConfidence(modelProb, edge, ev);
      const fairOdds = probabilityToAmerican(modelProb);
      const playRating = getPlayRating(edge, ev);

      if (
        edge >= MIN_EDGE &&
        ev >= MIN_EV &&
        confidence >= MIN_CONFIDENCE
      ) {
        const pick = marketLabel('spreads', item.side, item.point);
        const analysis = getCandidateAnalysis({
          pick,
          sportsbook: item.bestBook,
          odds: bestPrice,
          modelProb,
          impliedProb,
          edge,
          ev,
          fairOdds,
          booksUsed: item.prices.length,
          marketType: 'spread',
        });

        candidates.push({
          sport,
          game,
          pick,
          odds: bestPrice,
          confidence: String(confidence),
          analysis,
          stake: playRating === 'A+' || playRating === 'A' ? 1.5 : 1,
          result: 'pending',
          sportsbook: item.bestBook,
          sportsbook_key: item.bestBookKey,
          status: 'open',
          commence_time: event.commence_time,
          market_type: 'spread',
          edge: Number(edge.toFixed(2)),
          ev: Number(ev.toFixed(2)),
          implied_probability: Number((impliedProb * 100).toFixed(2)),
          model_probability: Number((modelProb * 100).toFixed(2)),
          fair_odds: fairOdds,
          play_rating: playRating,
          gameKey: event.id,
          sortScore: edge * 0.65 + ev * 0.35,
        });
      }
    }
  }

  // ---------- TOTALS ----------
  {
    const totalsMap: Record<
      string,
      {
        side: string;
        point: number;
        prices: number[];
        bestPrice: number;
        bestBook: string;
        bestBookKey: string;
      }
    > = {};

    for (const bm of bookmakers) {
      const market = bm.markets.find((m) => m.key === 'totals');
      if (!market) continue;

      for (const outcome of market.outcomes) {
        if (
          typeof outcome.price !== 'number' ||
          typeof outcome.point !== 'number'
        ) {
          continue;
        }

        const key = `${outcome.name}__${outcome.point}`;

        if (!totalsMap[key]) {
          totalsMap[key] = {
            side: outcome.name,
            point: outcome.point,
            prices: [],
            bestPrice: outcome.price,
            bestBook: bm.title,
            bestBookKey: bm.key,
          };
        }

        totalsMap[key].prices.push(outcome.price);

        if (outcome.price > totalsMap[key].bestPrice) {
          totalsMap[key].bestPrice = outcome.price;
          totalsMap[key].bestBook = bm.title;
          totalsMap[key].bestBookKey = bm.key;
        }
      }
    }

    for (const item of Object.values(totalsMap)) {
      if (item.prices.length < MIN_BOOKS) continue;

      const consensusProb = average(
        item.prices.map((p) => americanToImpliedProb(p))
      );

      const modelProb = Math.min(consensusProb + 0.035, 0.9);
      const bestPrice = item.bestPrice;
      const impliedProb = americanToImpliedProb(bestPrice);
      const edge = (modelProb - impliedProb) * 100;
      const ev = expectedValue(modelProb, bestPrice) * 100;
      const confidence = getConfidence(modelProb, edge, ev);
      const fairOdds = probabilityToAmerican(modelProb);
      const playRating = getPlayRating(edge, ev);

      if (
        edge >= MIN_EDGE &&
        ev >= MIN_EV &&
        confidence >= MIN_CONFIDENCE
      ) {
        const pick = marketLabel('totals', item.side, item.point);
        const analysis = getCandidateAnalysis({
          pick,
          sportsbook: item.bestBook,
          odds: bestPrice,
          modelProb,
          impliedProb,
          edge,
          ev,
          fairOdds,
          booksUsed: item.prices.length,
          marketType: 'total',
        });

        candidates.push({
          sport,
          game,
          pick,
          odds: bestPrice,
          confidence: String(confidence),
          analysis,
          stake: playRating === 'A+' || playRating === 'A' ? 1.5 : 1,
          result: 'pending',
          sportsbook: item.bestBook,
          sportsbook_key: item.bestBookKey,
          status: 'open',
          commence_time: event.commence_time,
          market_type: 'total',
          edge: Number(edge.toFixed(2)),
          ev: Number(ev.toFixed(2)),
          implied_probability: Number((impliedProb * 100).toFixed(2)),
          model_probability: Number((modelProb * 100).toFixed(2)),
          fair_odds: fairOdds,
          play_rating: playRating,
          gameKey: event.id,
          sortScore: edge * 0.65 + ev * 0.35,
        });
      }
    }
  }

  return candidates;
}

async function clearOldOpenPregamePicks() {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('picks')
    .delete()
    .eq('status', 'open');

  if (error) {
    throw new Error(`Failed clearing old picks: ${error.message}`);
  }
}

async function insertPicks(picks: PickInsert[]) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('picks')
    .insert(picks)
    .select();

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }

  return data;
}

export async function GET(req: NextRequest) {
  try {
    if (CRON_SECRET) {
      const authHeader = req.headers.get('authorization');
      const cronHeader = req.headers.get('x-cron-secret');

      const valid =
        authHeader === `Bearer ${CRON_SECRET}` || cronHeader === CRON_SECRET;

      if (!valid) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    let allEvents: OddsEvent[] = [];

    for (const sport of SUPPORTED_SPORTS) {
      try {
        const sportEvents = await fetchOddsForSport(sport);
        allEvents = allEvents.concat(sportEvents);
      } catch (err) {
        console.error(`Error loading ${sport}:`, err);
      }
    }

    const filteredEvents = allEvents.filter(
      (event) =>
        isPregame(event.commence_time) &&
        isTodayOrTomorrow(event.commence_time)
    );

    let candidates: Candidate[] = [];

    for (const event of filteredEvents) {
      const eventCandidates = extractCandidatesFromEvent(event);
      candidates.push(...eventCandidates);
    }

    candidates.sort((a, b) => b.sortScore - a.sortScore);

    if (ONE_PICK_PER_GAME) {
      const seenGames = new Set<string>();

      candidates = candidates.filter((c) => {
        if (seenGames.has(c.gameKey)) return false;
        seenGames.add(c.gameKey);
        return true;
      });
    }

    const finalPicks: PickInsert[] = candidates
      .slice(0, MAX_PICKS)
      .map(({ gameKey, sortScore, ...pick }) => pick);

    if (!finalPicks.length) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying pregame picks found right now.',
        debug: {
          eventsChecked: filteredEvents.length,
          candidatesFound: candidates.length,
          finalSelected: 0,
          minEdge: MIN_EDGE,
          minEv: MIN_EV,
          minConfidence: MIN_CONFIDENCE,
          minBooks: MIN_BOOKS,
          maxPicks: MAX_PICKS,
          onePickPerGame: ONE_PICK_PER_GAME,
        },
      });
    }

    await clearOldOpenPregamePicks();

    const inserted = await insertPicks(finalPicks);

    return NextResponse.json({
      success: true,
      inserted: inserted?.length || finalPicks.length,
      picks: inserted || finalPicks,
      debug: {
        eventsChecked: filteredEvents.length,
        candidatesFound: candidates.length,
        finalSelected: finalPicks.length,
        minEdge: MIN_EDGE,
        minEv: MIN_EV,
        minConfidence: MIN_CONFIDENCE,
        minBooks: MIN_BOOKS,
        maxPicks: MAX_PICKS,
        onePickPerGame: ONE_PICK_PER_GAME,
      },
    });
  } catch (error) {
    console.error('generate-picks error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
