import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// ================= SETTINGS =================
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

const SPORTS = ['baseball_mlb', 'basketball_nba', 'icehockey_nhl'];

const LOOKAHEAD_HOURS = 36;
const MIN_MINUTES_TO_START = 5;

const MAX_PICKS_PER_RUN = 14;
const ONE_PICK_PER_GAME = true;
const MIN_BOOKS_PER_SIDE = 1;

const THRESHOLDS = {
  moneyline: { minEdge: 1.25, minEv: 1.25 },
  spread: { minEdge: 1.25, minEv: 1.5 },
  total: { minEdge: 1.25, minEv: 1.5 },
};

type MarketType = 'moneyline' | 'spread' | 'total';

type Candidate = {
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: string;
  analysis: string;
  stake: number;
  result: string;
  sportsbook: string;
  sportsbook_key: string | null;
  status: string;
  commence_time: string;
  market_type: MarketType;
  edge: number;
  ev: number;
  play_rating: string;
  max_play: boolean;
  is_live: boolean;
  event_id: string;
  odds_last_seen_at: string;
};

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function impliedProbability(odds: number) {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function decimalOdds(odds: number) {
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

function americanOdds(prob: number) {
  if (prob <= 0 || prob >= 1) return 0;
  return prob >= 0.5
    ? Math.round((-100 * prob) / (1 - prob))
    : Math.round((100 * (1 - prob)) / prob);
}

function expectedValue(trueProb: number, odds: number) {
  return (trueProb * decimalOdds(odds) - 1) * 100;
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function noVigTwoWay(a: number, b: number) {
  const total = a + b;
  if (!total) return { a: 0, b: 0 };
  return { a: a / total, b: b / total };
}

function isValidGameWindow(commenceTime: string) {
  const now = Date.now();
  const start = new Date(commenceTime).getTime();

  const hoursAway = (start - now) / 36e5;
  const minutesAway = (start - now) / 60000;

  return hoursAway <= LOOKAHEAD_HOURS && minutesAway >= MIN_MINUTES_TO_START;
}

function cleanSport(sportKey: string) {
  if (sportKey === 'baseball_mlb') return 'MLB';
  if (sportKey === 'basketball_nba') return 'NBA';
  if (sportKey === 'icehockey_nhl') return 'NHL';
  return sportKey.toUpperCase();
}

function formatSigned(num: number) {
  return num > 0 ? `+${num}` : `${num}`;
}

function formatPoint(point: number) {
  return point > 0 ? `+${point}` : `${point}`;
}

function getPlayRating(edge: number, ev: number, market: MarketType) {
  if (market === 'moneyline') {
    if (edge >= 5 && ev >= 8) return 'MAX';
    if (edge >= 3.25 && ev >= 5) return 'A';
    if (edge >= 2 && ev >= 3) return 'B';
    if (edge >= THRESHOLDS.moneyline.minEdge && ev >= THRESHOLDS.moneyline.minEv) return 'C';
    return null;
  }

  if (edge >= 4 && ev >= 6) return 'MAX';
  if (edge >= 2.25 && ev >= 3.25) return 'A';
  if (edge >= 1.25 && ev >= 1.75) return 'B';
  if (edge >= THRESHOLDS[market].minEdge && ev >= THRESHOLDS[market].minEv) return 'C';

  return null;
}

function stakeForRating(rating: string) {
  if (rating === 'MAX') return 2;
  if (rating === 'A') return 1.5;
  return 1;
}

function sortScore(candidate: Candidate) {
  const ratingBoost =
    candidate.play_rating === 'MAX'
      ? 100
      : candidate.play_rating === 'A'
        ? 70
        : candidate.play_rating === 'B'
          ? 40
          : 10;

  return ratingBoost + candidate.edge * 2 + candidate.ev;
}

// ================= MONEYLINE =================
function buildMoneylineCandidates(event: any, sport: string, nowIso: string): Candidate[] {
  const sides: Record<
    string,
    {
      prices: number[];
      bestPrice: number;
      bestBook: string;
      bestBookKey: string;
    }
  > = {};

  for (const book of event.bookmakers ?? []) {
    if (!ALLOWED_BOOKS.has(book.key)) continue;

    const market = book.markets?.find((m: any) => m.key === 'h2h');
    if (!market?.outcomes?.length) continue;

    for (const outcome of market.outcomes) {
      if (typeof outcome.price !== 'number') continue;

      if (!sides[outcome.name]) {
        sides[outcome.name] = {
          prices: [],
          bestPrice: outcome.price,
          bestBook: book.title ?? book.key,
          bestBookKey: book.key,
        };
      }

      sides[outcome.name].prices.push(outcome.price);

      if (outcome.price > sides[outcome.name].bestPrice) {
        sides[outcome.name].bestPrice = outcome.price;
        sides[outcome.name].bestBook = book.title ?? book.key;
        sides[outcome.name].bestBookKey = book.key;
      }
    }
  }

  const teams = Object.keys(sides);
  if (teams.length !== 2) return [];

  const teamA = teams[0];
  const teamB = teams[1];

  if (
    sides[teamA].prices.length < MIN_BOOKS_PER_SIDE ||
    sides[teamB].prices.length < MIN_BOOKS_PER_SIDE
  ) {
    return [];
  }

  const avgImpA = avg(sides[teamA].prices.map(impliedProbability));
  const avgImpB = avg(sides[teamB].prices.map(impliedProbability));
  const noVig = noVigTwoWay(avgImpA, avgImpB);

  const fairProbByTeam: Record<string, number> = {
    [teamA]: noVig.a,
    [teamB]: noVig.b,
  };

  const candidates: Candidate[] = [];

  for (const team of teams) {
    const side = sides[team];
    const trueProb = fairProbByTeam[team];
    const implied = impliedProbability(side.bestPrice);

    const edge = (trueProb - implied) * 100;
    const ev = expectedValue(trueProb, side.bestPrice);
    const rating = getPlayRating(edge, ev, 'moneyline');

    if (!rating) continue;

    const fairLine = americanOdds(trueProb);
    const favDog = side.bestPrice < 0 ? 'favorite' : 'underdog';

    candidates.push({
      sport: cleanSport(sport),
      game: `${event.away_team} at ${event.home_team}`,
      pick: `${team} ML`,
      odds: side.bestPrice,
      confidence: `${Math.round(trueProb * 100)}`,
      analysis: `${team} ML is showing value as a ${favDog}. Best price is ${formatSigned(
        side.bestPrice
      )} at ${side.bestBook}. Model probability is ${(trueProb * 100).toFixed(
        1
      )}% versus market implied probability of ${(implied * 100).toFixed(
        1
      )}%. Estimated edge is ${edge.toFixed(2)}%. Estimated EV is ${ev.toFixed(
        2
      )}%. Fair line is ${formatSigned(fairLine)}. Play rating: ${rating}.`,
      stake: stakeForRating(rating),
      result: 'pending',
      sportsbook: side.bestBook,
      sportsbook_key: side.bestBookKey,
      status: 'pregame',
      commence_time: event.commence_time,
      market_type: 'moneyline',
      edge,
      ev,
      play_rating: rating,
      max_play: rating === 'MAX',
      is_live: false,
      event_id: event.id,
      odds_last_seen_at: nowIso,
    });
  }

  return candidates;
}

// ================= SPREADS =================
function buildSpreadCandidates(event: any, sport: string, nowIso: string): Candidate[] {
  const lines: Record<
    string,
    Record<
      string,
      {
        team: string;
        point: number;
        prices: number[];
        bestPrice: number;
        bestBook: string;
        bestBookKey: string;
      }
    >
  > = {};

  for (const book of event.bookmakers ?? []) {
    if (!ALLOWED_BOOKS.has(book.key)) continue;

    const market = book.markets?.find((m: any) => m.key === 'spreads');
    if (!market?.outcomes?.length) continue;

    for (const outcome of market.outcomes) {
      if (typeof outcome.price !== 'number') continue;
      if (typeof outcome.point !== 'number') continue;

      const pointKey = String(Math.abs(outcome.point));
      const sideKey = `${outcome.name}|${outcome.point}`;

      if (!lines[pointKey]) lines[pointKey] = {};

      if (!lines[pointKey][sideKey]) {
        lines[pointKey][sideKey] = {
          team: outcome.name,
          point: outcome.point,
          prices: [],
          bestPrice: outcome.price,
          bestBook: book.title ?? book.key,
          bestBookKey: book.key,
        };
      }

      lines[pointKey][sideKey].prices.push(outcome.price);

      if (outcome.price > lines[pointKey][sideKey].bestPrice) {
        lines[pointKey][sideKey].bestPrice = outcome.price;
        lines[pointKey][sideKey].bestBook = book.title ?? book.key;
        lines[pointKey][sideKey].bestBookKey = book.key;
      }
    }
  }

  const candidates: Candidate[] = [];

  for (const pointKey of Object.keys(lines)) {
    const sides = Object.values(lines[pointKey]);

    const plusSide = sides.find((s) => s.point > 0);
    const minusSide = sides.find((s) => s.point < 0);

    if (!plusSide || !minusSide) continue;

    if (
      plusSide.prices.length < MIN_BOOKS_PER_SIDE ||
      minusSide.prices.length < MIN_BOOKS_PER_SIDE
    ) {
      continue;
    }

    const avgImpPlus = avg(plusSide.prices.map(impliedProbability));
    const avgImpMinus = avg(minusSide.prices.map(impliedProbability));
    const noVig = noVigTwoWay(avgImpPlus, avgImpMinus);

    const pair = [
      { side: plusSide, trueProb: noVig.a },
      { side: minusSide, trueProb: noVig.b },
    ];

    for (const item of pair) {
      const implied = impliedProbability(item.side.bestPrice);
      const edge = (item.trueProb - implied) * 100;
      const ev = expectedValue(item.trueProb, item.side.bestPrice);
      const rating = getPlayRating(edge, ev, 'spread');

      if (!rating) continue;

      candidates.push({
        sport: cleanSport(sport),
        game: `${event.away_team} at ${event.home_team}`,
        pick: `${item.side.team} ${formatPoint(item.side.point)}`,
        odds: item.side.bestPrice,
        confidence: `${Math.round(item.trueProb * 100)}`,
        analysis: `${item.side.team} ${formatPoint(
          item.side.point
        )} spread is showing value. Best price is ${formatSigned(
          item.side.bestPrice
        )} at ${item.side.bestBook}. Model cover probability is ${(
          item.trueProb * 100
        ).toFixed(1)}% versus market implied probability of ${(implied * 100).toFixed(
          1
        )}%. Estimated edge is ${edge.toFixed(2)}%. Estimated EV is ${ev.toFixed(
          2
        )}%. Play rating: ${rating}.`,
        stake: stakeForRating(rating),
        result: 'pending',
        sportsbook: item.side.bestBook,
        sportsbook_key: item.side.bestBookKey,
        status: 'pregame',
        commence_time: event.commence_time,
        market_type: 'spread',
        edge,
        ev,
        play_rating: rating,
        max_play: rating === 'MAX',
        is_live: false,
        event_id: event.id,
        odds_last_seen_at: nowIso,
      });
    }
  }

  return candidates;
}

// ================= TOTALS =================
function buildTotalCandidates(event: any, sport: string, nowIso: string): Candidate[] {
  const lines: Record<
    string,
    Record<
      string,
      {
        label: 'Over' | 'Under';
        point: number;
        prices: number[];
        bestPrice: number;
        bestBook: string;
        bestBookKey: string;
      }
    >
  > = {};

  for (const book of event.bookmakers ?? []) {
    if (!ALLOWED_BOOKS.has(book.key)) continue;

    const market = book.markets?.find((m: any) => m.key === 'totals');
    if (!market?.outcomes?.length) continue;

    for (const outcome of market.outcomes) {
      if (typeof outcome.price !== 'number') continue;
      if (typeof outcome.point !== 'number') continue;
      if (outcome.name !== 'Over' && outcome.name !== 'Under') continue;

      const pointKey = String(outcome.point);
      const sideKey = outcome.name;

      if (!lines[pointKey]) lines[pointKey] = {};

      if (!lines[pointKey][sideKey]) {
        lines[pointKey][sideKey] = {
          label: outcome.name,
          point: outcome.point,
          prices: [],
          bestPrice: outcome.price,
          bestBook: book.title ?? book.key,
          bestBookKey: book.key,
        };
      }

      lines[pointKey][sideKey].prices.push(outcome.price);

      if (outcome.price > lines[pointKey][sideKey].bestPrice) {
        lines[pointKey][sideKey].bestPrice = outcome.price;
        lines[pointKey][sideKey].bestBook = book.title ?? book.key;
        lines[pointKey][sideKey].bestBookKey = book.key;
      }
    }
  }

  const candidates: Candidate[] = [];

  for (const pointKey of Object.keys(lines)) {
    const over = lines[pointKey].Over;
    const under = lines[pointKey].Under;

    if (!over || !under) continue;

    if (
      over.prices.length < MIN_BOOKS_PER_SIDE ||
      under.prices.length < MIN_BOOKS_PER_SIDE
    ) {
      continue;
    }

    const avgImpOver = avg(over.prices.map(impliedProbability));
    const avgImpUnder = avg(under.prices.map(impliedProbability));
    const noVig = noVigTwoWay(avgImpOver, avgImpUnder);

    const pair = [
      { side: over, trueProb: noVig.a },
      { side: under, trueProb: noVig.b },
    ];

    for (const item of pair) {
      const implied = impliedProbability(item.side.bestPrice);
      const edge = (item.trueProb - implied) * 100;
      const ev = expectedValue(item.trueProb, item.side.bestPrice);
      const rating = getPlayRating(edge, ev, 'total');

      if (!rating) continue;

      candidates.push({
        sport: cleanSport(sport),
        game: `${event.away_team} at ${event.home_team}`,
        pick: `${item.side.label} ${item.side.point}`,
        odds: item.side.bestPrice,
        confidence: `${Math.round(item.trueProb * 100)}`,
        analysis: `${item.side.label} ${item.side.point} is showing value. Best price is ${formatSigned(
          item.side.bestPrice
        )} at ${item.side.bestBook}. Model hit probability is ${(
          item.trueProb * 100
        ).toFixed(1)}% versus market implied probability of ${(implied * 100).toFixed(
          1
        )}%. Estimated edge is ${edge.toFixed(2)}%. Estimated EV is ${ev.toFixed(
          2
        )}%. Play rating: ${rating}.`,
        stake: stakeForRating(rating),
        result: 'pending',
        sportsbook: item.side.bestBook,
        sportsbook_key: item.side.bestBookKey,
        status: 'pregame',
        commence_time: event.commence_time,
        market_type: 'total',
        edge,
        ev,
        play_rating: rating,
        max_play: rating === 'MAX',
        is_live: false,
        event_id: event.id,
        odds_last_seen_at: nowIso,
      });
    }
  }

  return candidates;
}

// ================= MAIN ROUTE =================
export async function GET() {
  try {
    if (!ODDS_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'Missing ODDS_API_KEY.',
      });
    }

    const supabase = getSupabase();
    const nowIso = new Date().toISOString();

    const debug = {
      sportsChecked: SPORTS,
      eventsChecked: 0,
      moneylineBuilt: 0,
      spreadBuilt: 0,
      totalBuilt: 0,
      candidatesFound: 0,
      finalSelected: 0,
      onePickPerGame: ONE_PICK_PER_GAME,
      lookaheadHours: LOOKAHEAD_HOURS,
    };

    const allCandidates: Candidate[] = [];

    for (const sport of SPORTS) {
      const url = `${ODDS_API_BASE}/${sport}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;

      const response = await fetch(url, { cache: 'no-store' });

      if (!response.ok) continue;

      const events = await response.json();

      if (!Array.isArray(events)) continue;

      for (const event of events) {
        if (!event?.commence_time) continue;
        if (!isValidGameWindow(event.commence_time)) continue;
        if (!event.bookmakers?.length) continue;

        debug.eventsChecked++;

        const moneylineCandidates = buildMoneylineCandidates(event, sport, nowIso);
        const spreadCandidates = buildSpreadCandidates(event, sport, nowIso);
        const totalCandidates = buildTotalCandidates(event, sport, nowIso);

        debug.moneylineBuilt += moneylineCandidates.length;
        debug.spreadBuilt += spreadCandidates.length;
        debug.totalBuilt += totalCandidates.length;

        allCandidates.push(
          ...moneylineCandidates,
          ...spreadCandidates,
          ...totalCandidates
        );
      }
    }

    debug.candidatesFound = allCandidates.length;

    if (!allCandidates.length) {
      await supabase.from('picks').delete().eq('status', 'pregame');

      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying pregame picks found.',
        debug,
      });
    }

    const sorted = allCandidates.sort((a, b) => sortScore(b) - sortScore(a));

    const selected: Candidate[] = [];
    const usedGames = new Set<string>();
    const usedGameMarkets = new Set<string>();

    for (const candidate of sorted) {
      const gameKey = candidate.event_id;
      const gameMarketKey = `${candidate.event_id}:${candidate.market_type}`;

      if (ONE_PICK_PER_GAME && usedGames.has(gameKey)) continue;
      if (usedGameMarkets.has(gameMarketKey)) continue;

      selected.push(candidate);
      usedGames.add(gameKey);
      usedGameMarkets.add(gameMarketKey);

      if (selected.length >= MAX_PICKS_PER_RUN) break;
    }

    debug.finalSelected = selected.length;

    await supabase.from('picks').delete().eq('status', 'pregame');

    const { data, error } = await supabase.from('picks').insert(selected).select();

    if (error) {
      return NextResponse.json({
        success: false,
        error: `Supabase insert failed: ${error.message}`,
        debug,
      });
    }

    return NextResponse.json({
      success: true,
      inserted: data?.length || 0,
      picks: data,
      debug,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || 'Unknown server error.',
    });
  }
}
