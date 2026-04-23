import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// ===============================
// SETTINGS
// ===============================
const ODDS_API_KEY = process.env.ODDS_API_KEY!;
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4/sports';

const ALLOWED_BOOKS = new Set([
  'fanduel',
  'draftkings',
  'betmgm',
  'caesars',
  'espnbet',
  'betrivers',
  'fanatics',
  'thescorebet',
]);

const SPORTS = [
  'baseball_mlb',
  'basketball_nba',
  'icehockey_nhl',
];

const MIN_BOOKS = 2;
const MIN_EDGE = 2.25;
const MIN_EV = 3.0;
const MAX_PICKS_PER_RUN = 8;
const ONE_PICK_PER_GAME = true;

// only current day + next day
const LOOKAHEAD_HOURS = 36;

// ignore games starting too soon
const MIN_MINUTES_TO_START = 20;

// ===============================
// TYPES
// ===============================
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

type Candidate = {
  sport: string;
  game: string;
  pick: string;
  market_type: 'moneyline' | 'spread' | 'total';
  market_key: string;
  selection_name: string;
  odds: number;
  sportsbook: string;
  sportsbook_key: string;
  confidence: number;
  analysis: string;
  stake: number;
  fair_line: number | null;
  model_probability: number;
  implied_probability: number;
  edge: number;
  ev: number;
  play_rating: 'A' | 'B' | 'C';
  status: 'pregame';
  commence_time: string;
};

type SideAggregate = {
  prices: Array<{
    bookKey: string;
    bookTitle: string;
    price: number;
  }>;
};

type SpreadAggregate = {
  prices: Array<{
    bookKey: string;
    bookTitle: string;
    price: number;
    point: number;
  }>;
};

type TotalAggregate = {
  prices: Array<{
    bookKey: string;
    bookTitle: string;
    price: number;
    point: number;
  }>;
};

type InsertRow = {
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: string;
  analysis: string;
  stake: number;
  result: string;
  sportsbook: string;
  sportsbook_key: string;
  status: string;
  commence_time: string;
  market_type: string;
  market_key: string;
  selection_name: string;
  fair_line: number | null;
  model_probability: number;
  implied_probability: number;
  edge: number;
  ev: number;
  play_rating: string;
};

// ===============================
// HELPERS
// ===============================
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

function americanToImpliedProb(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function probToAmerican(prob: number): number {
  if (prob <= 0 || prob >= 1) return 0;
  if (prob >= 0.5) {
    return Math.round((-100 * prob) / (1 - prob));
  }
  return Math.round((100 * (1 - prob)) / prob);
}

function decimalFromAmerican(odds: number): number {
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

function expectedValuePercent(prob: number, odds: number): number {
  const dec = decimalFromAmerican(odds);
  return (prob * dec - 1) * 100;
}

function removeVigTwoWay(probA: number, probB: number) {
  const total = probA + probB;
  if (total <= 0) return { a: 0.5, b: 0.5 };
  return {
    a: probA / total,
    b: probB / total,
  };
}

function average(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getPlayRating(edge: number, ev: number): 'A' | 'B' | 'C' | null {
  if (edge >= 5 && ev >= 8) return 'A';
  if (edge >= 3 && ev >= 5) return 'B';
  if (edge >= 2.25 && ev >= 3) return 'C';
  return null;
}

function getStakeUnits(rating: 'A' | 'B' | 'C'): number {
  if (rating === 'A') return 1.5;
  if (rating === 'B') return 1.0;
  return 1.0;
}

function sportLabel(sportKey: string): string {
  if (sportKey.includes('mlb')) return 'MLB';
  if (sportKey.includes('nba')) return 'NBA';
  if (sportKey.includes('nhl')) return 'NHL';
  return sportKey.toUpperCase();
}

function normalizeGameKey(event: OddsEvent): string {
  return `${event.away_team} at ${event.home_team}`;
}

function isWithinWindow(commenceTime: string): boolean {
  const now = Date.now();
  const start = new Date(commenceTime).getTime();
  const diffMs = start - now;
  const diffHours = diffMs / 1000 / 60 / 60;
  const diffMinutes = diffMs / 1000 / 60;
  return diffHours <= LOOKAHEAD_HOURS && diffMinutes >= MIN_MINUTES_TO_START;
}

function getAnalysis(candidate: Candidate): string {
  const fairLineText =
    candidate.fair_line !== null
      ? `${candidate.fair_line > 0 ? '+' : ''}${candidate.fair_line}`
      : 'N/A';

  const oddsText = `${candidate.odds > 0 ? '+' : ''}${candidate.odds}`;

  return `${candidate.pick} at ${candidate.sportsbook} is priced at ${oddsText} versus a model fair line of ${fairLineText}. Model probability is ${round2(
    candidate.model_probability * 100
  )}% compared with market implied probability of ${round2(
    candidate.implied_probability * 100
  )}%. Estimated edge is ${round2(candidate.edge)}% and expected value is ${round2(
    candidate.ev
  )}%. Play rating: ${candidate.play_rating} PLAY.`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}

async function fetchEventsForSport(sport: string): Promise<OddsEvent[]> {
  const url =
    `${ODDS_API_BASE}/${sport}/odds` +
    `?apiKey=${ODDS_API_KEY}` +
    `&regions=us` +
    `&markets=h2h,spreads,totals` +
    `&oddsFormat=american` +
    `&bookmakers=${Array.from(ALLOWED_BOOKS).join(',')}`;

  const data = await fetchJson<OddsEvent[]>(url);
  return Array.isArray(data) ? data : [];
}

// ===============================
// MARKET BUILDERS
// ===============================
function buildMoneylineCandidates(event: OddsEvent): Candidate[] {
  if (!event.bookmakers?.length) return [];

  const sides: Record<string, SideAggregate> = {};

  for (const book of event.bookmakers) {
    if (!ALLOWED_BOOKS.has(book.key)) continue;

    const market = book.markets?.find((m) => m.key === 'h2h');
    if (!market?.outcomes?.length) continue;

    for (const outcome of market.outcomes) {
      if (typeof outcome.price !== 'number') continue;

      if (!sides[outcome.name]) {
        sides[outcome.name] = { prices: [] };
      }

      sides[outcome.name].prices.push({
        bookKey: book.key,
        bookTitle: book.title,
        price: outcome.price,
      });
    }
  }

  const home = event.home_team;
  const away = event.away_team;

  if (!sides[home] || !sides[away]) return [];

  const homePrices = sides[home].prices.map((x) => x.price);
  const awayPrices = sides[away].prices.map((x) => x.price);

  if (homePrices.length < MIN_BOOKS || awayPrices.length < MIN_BOOKS) return [];

  const avgHomeProb = average(homePrices.map(americanToImpliedProb));
  const avgAwayProb = average(awayPrices.map(americanToImpliedProb));

  const noVig = removeVigTwoWay(avgHomeProb, avgAwayProb);

  const candidates: Candidate[] = [];

  for (const team of [home, away]) {
    const modelProb = team === home ? noVig.a : noVig.b;
    const entries = sides[team].prices;

    if (entries.length < MIN_BOOKS) continue;

    const best = [...entries].sort((a, b) => b.price - a.price)[0];
    const implied = americanToImpliedProb(best.price);
    const edge = (modelProb - implied) * 100;
    const ev = expectedValuePercent(modelProb, best.price);
    const fairLine = probToAmerican(modelProb);
    const rating = getPlayRating(edge, ev);

    if (!rating) continue;
    if (edge < MIN_EDGE || ev < MIN_EV) continue;

    const pickLabel = `${team} ML`;

    candidates.push({
      sport: sportLabel(event.sport_key),
      game: normalizeGameKey(event),
      pick: pickLabel,
      market_type: 'moneyline',
      market_key: 'h2h',
      selection_name: team,
      odds: best.price,
      sportsbook: best.bookTitle,
      sportsbook_key: best.bookKey,
      confidence: Math.round(modelProb * 100),
      analysis: '',
      stake: getStakeUnits(rating),
      fair_line: fairLine,
      model_probability: modelProb,
      implied_probability: implied,
      edge: round2(edge),
      ev: round2(ev),
      play_rating: rating,
      status: 'pregame',
      commence_time: event.commence_time,
    });
  }

  return candidates;
}

function buildSpreadCandidates(event: OddsEvent): Candidate[] {
  if (!event.bookmakers?.length) return [];

  const spreads: Record<string, SpreadAggregate> = {};

  for (const book of event.bookmakers) {
    if (!ALLOWED_BOOKS.has(book.key)) continue;

    const market = book.markets?.find((m) => m.key === 'spreads');
    if (!market?.outcomes?.length || market.outcomes.length < 2) continue;

    for (const outcome of market.outcomes) {
      if (typeof outcome.price !== 'number' || typeof outcome.point !== 'number') {
        continue;
      }

      const key = `${outcome.name}|${outcome.point}`;

      if (!spreads[key]) {
        spreads[key] = { prices: [] };
      }

      spreads[key].prices.push({
        bookKey: book.key,
        bookTitle: book.title,
        price: outcome.price,
        point: outcome.point,
      });
    }
  }

  const candidates: Candidate[] = [];

  for (const [selectionKey, aggregate] of Object.entries(spreads)) {
    const [team, pointStr] = selectionKey.split('|');
    const point = Number(pointStr);

    if (aggregate.prices.length < MIN_BOOKS) continue;

    const oppositeKey = `${team === event.home_team ? event.away_team : event.home_team}|${-point}`;
    const opposite = spreads[oppositeKey];
    if (!opposite || opposite.prices.length < MIN_BOOKS) continue;

    const avgProbA = average(aggregate.prices.map((x) => americanToImpliedProb(x.price)));
    const avgProbB = average(opposite.prices.map((x) => americanToImpliedProb(x.price)));
    const noVig = removeVigTwoWay(avgProbA, avgProbB);

    const modelProb = noVig.a;
    const best = [...aggregate.prices].sort((a, b) => b.price - a.price)[0];
    const implied = americanToImpliedProb(best.price);
    const edge = (modelProb - implied) * 100;
    const ev = expectedValuePercent(modelProb, best.price);
    const fairLine = probToAmerican(modelProb);
    const rating = getPlayRating(edge, ev);

    if (!rating) continue;
    if (edge < MIN_EDGE || ev < MIN_EV) continue;

    const pointText = point > 0 ? `+${point}` : `${point}`;

    candidates.push({
      sport: sportLabel(event.sport_key),
      game: normalizeGameKey(event),
      pick: `${team} ${pointText}`,
      market_type: 'spread',
      market_key: 'spreads',
      selection_name: team,
      odds: best.price,
      sportsbook: best.bookTitle,
      sportsbook_key: best.bookKey,
      confidence: Math.round(modelProb * 100),
      analysis: '',
      stake: getStakeUnits(rating),
      fair_line: fairLine,
      model_probability: modelProb,
      implied_probability: implied,
      edge: round2(edge),
      ev: round2(ev),
      play_rating: rating,
      status: 'pregame',
      commence_time: event.commence_time,
    });
  }

  return candidates;
}

function buildTotalCandidates(event: OddsEvent): Candidate[] {
  if (!event.bookmakers?.length) return [];

  const totals: Record<string, TotalAggregate> = {};

  for (const book of event.bookmakers) {
    if (!ALLOWED_BOOKS.has(book.key)) continue;

    const market = book.markets?.find((m) => m.key === 'totals');
    if (!market?.outcomes?.length || market.outcomes.length < 2) continue;

    for (const outcome of market.outcomes) {
      if (typeof outcome.price !== 'number' || typeof outcome.point !== 'number') {
        continue;
      }

      const key = `${outcome.name}|${outcome.point}`;

      if (!totals[key]) {
        totals[key] = { prices: [] };
      }

      totals[key].prices.push({
        bookKey: book.key,
        bookTitle: book.title,
        price: outcome.price,
        point: outcome.point,
      });
    }
  }

  const candidates: Candidate[] = [];

  const seenPoints = new Set<number>();
  for (const key of Object.keys(totals)) {
    const [, pointStr] = key.split('|');
    seenPoints.add(Number(pointStr));
  }

  for (const point of seenPoints) {
    const overKey = `Over|${point}`;
    const underKey = `Under|${point}`;

    const over = totals[overKey];
    const under = totals[underKey];

    if (!over || !under) continue;
    if (over.prices.length < MIN_BOOKS || under.prices.length < MIN_BOOKS) continue;

    const avgOverProb = average(over.prices.map((x) => americanToImpliedProb(x.price)));
    const avgUnderProb = average(under.prices.map((x) => americanToImpliedProb(x.price)));
    const noVig = removeVigTwoWay(avgOverProb, avgUnderProb);

    for (const side of ['Over', 'Under'] as const) {
      const aggregate = side === 'Over' ? over : under;
      const modelProb = side === 'Over' ? noVig.a : noVig.b;

      const best = [...aggregate.prices].sort((a, b) => b.price - a.price)[0];
      const implied = americanToImpliedProb(best.price);
      const edge = (modelProb - implied) * 100;
      const ev = expectedValuePercent(modelProb, best.price);
      const fairLine = probToAmerican(modelProb);
      const rating = getPlayRating(edge, ev);

      if (!rating) continue;
      if (edge < MIN_EDGE || ev < MIN_EV) continue;

      candidates.push({
        sport: sportLabel(event.sport_key),
        game: normalizeGameKey(event),
        pick: `${side} ${point}`,
        market_type: 'total',
        market_key: 'totals',
        selection_name: side,
        odds: best.price,
        sportsbook: best.bookTitle,
        sportsbook_key: best.bookKey,
        confidence: Math.round(modelProb * 100),
        analysis: '',
        stake: getStakeUnits(rating),
        fair_line: fairLine,
        model_probability: modelProb,
        implied_probability: implied,
        edge: round2(edge),
        ev: round2(ev),
        play_rating: rating,
        status: 'pregame',
        commence_time: event.commence_time,
      });
    }
  }

  return candidates;
}

// ===============================
// MAIN
// ===============================
export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    const bearer = authHeader?.replace('Bearer ', '');
    const xCron = req.headers.get('x-cron-secret');

    if (cronSecret && bearer !== cronSecret && xCron !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ODDS_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Missing ODDS_API_KEY' },
        { status: 500 }
      );
    }

    const supabase = getSupabase();

    let eventsChecked = 0;
    let candidatesFound = 0;

    const allCandidates: Candidate[] = [];

    for (const sport of SPORTS) {
      const events = await fetchEventsForSport(sport);

      for (const event of events) {
        if (!isWithinWindow(event.commence_time)) continue;
        if (!event.bookmakers?.length) continue;

        eventsChecked++;

        const moneyline = buildMoneylineCandidates(event);
        const spreads = buildSpreadCandidates(event);
        const totals = buildTotalCandidates(event);

        const eventCandidates = [...moneyline, ...spreads, ...totals].map((c) => {
          const withAnalysis = { ...c };
          withAnalysis.analysis = getAnalysis(withAnalysis);
          return withAnalysis;
        });

        candidatesFound += eventCandidates.length;
        allCandidates.push(...eventCandidates);
      }
    }

    // sort strongest first
    allCandidates.sort((a, b) => {
      if (b.play_rating !== a.play_rating) {
        const rank = { A: 3, B: 2, C: 1 };
        return rank[b.play_rating] - rank[a.play_rating];
      }
      if (b.ev !== a.ev) return b.ev - a.ev;
      return b.edge - a.edge;
    });

    let finalCandidates = allCandidates;

    if (ONE_PICK_PER_GAME) {
      const bestByGame = new Map<string, Candidate>();

      for (const c of allCandidates) {
        const existing = bestByGame.get(c.game);
        if (!existing) {
          bestByGame.set(c.game, c);
          continue;
        }

        const rank = { A: 3, B: 2, C: 1 };
        const currentRank = rank[c.play_rating];
        const existingRank = rank[existing.play_rating];

        if (
          currentRank > existingRank ||
          (currentRank === existingRank && c.ev > existing.ev) ||
          (currentRank === existingRank && c.ev === existing.ev && c.edge > existing.edge)
        ) {
          bestByGame.set(c.game, c);
        }
      }

      finalCandidates = Array.from(bestByGame.values()).sort((a, b) => {
        const rank = { A: 3, B: 2, C: 1 };
        if (rank[b.play_rating] !== rank[a.play_rating]) {
          return rank[b.play_rating] - rank[a.play_rating];
        }
        if (b.ev !== a.ev) return b.ev - a.ev;
        return b.edge - a.edge;
      });
    }

    finalCandidates = finalCandidates.slice(0, MAX_PICKS_PER_RUN);

    if (!finalCandidates.length) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying pregame picks found.',
        debug: {
          eventsChecked,
          candidatesFound,
          finalSelected: 0,
          minBooks: MIN_BOOKS,
          minEdge: MIN_EDGE,
          minEv: MIN_EV,
          maxPicksPerRun: MAX_PICKS_PER_RUN,
        },
      });
    }

    // remove old pending pregame picks first so board stays fresh
    const { error: deleteError } = await supabase
      .from('picks')
      .delete()
      .eq('status', 'pregame')
      .eq('result', 'pending');

    if (deleteError) {
      return NextResponse.json(
        { success: false, error: `Failed clearing old picks: ${deleteError.message}` },
        { status: 500 }
      );
    }

    const rows: InsertRow[] = finalCandidates.map((c) => ({
      sport: c.sport,
      game: c.game,
      pick: c.pick,
      odds: c.odds,
      confidence: String(c.confidence),
      analysis: c.analysis,
      stake: c.stake,
      result: 'pending',
      sportsbook: c.sportsbook,
      sportsbook_key: c.sportsbook_key,
      status: c.status,
      commence_time: c.commence_time,
      market_type: c.market_type,
      market_key: c.market_key,
      selection_name: c.selection_name,
      fair_line: c.fair_line,
      model_probability: round2(c.model_probability * 100),
      implied_probability: round2(c.implied_probability * 100),
      edge: c.edge,
      ev: c.ev,
      play_rating: c.play_rating,
    }));

    const { data, error } = await supabase
      .from('picks')
      .insert(rows)
      .select();

    if (error) {
      return NextResponse.json(
        { success: false, error: `Supabase insert failed: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      inserted: data?.length || 0,
      picks: data || [],
      debug: {
        eventsChecked,
        candidatesFound,
        finalSelected: finalCandidates.length,
        minBooks: MIN_BOOKS,
        minEdge: MIN_EDGE,
        minEv: MIN_EV,
        maxPicksPerRun: MAX_PICKS_PER_RUN,
        onePickPerGame: ONE_PICK_PER_GAME,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown server error';

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
