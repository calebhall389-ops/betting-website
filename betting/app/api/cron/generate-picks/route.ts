import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ODDS_API_KEY = process.env.ODDS_API_KEY!;
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4/sports';

const SPORTS = ['baseball_mlb', 'basketball_nba', 'icehockey_nhl'];

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

const LOOKAHEAD_HOURS = 44;
const MIN_MINUTES_TO_START = 10;
const MAX_PICKS_PER_RUN = 5;
const ONE_PICK_PER_GAME = true;

const MIN_BOOKS_ML = 3;
const MIN_BOOKS_SPREAD_TOTAL = 3;

const MIN_EDGE = 1.15;
const MIN_EV = 2.25;

const FALLBACK_MIN_EDGE = 0.85;
const FALLBACK_MIN_EV = 1.5;
const ENABLE_BEST_AVAILABLE_FALLBACK = true;

type MarketType = 'moneyline' | 'spread' | 'total';

type Candidate = {
  sport: string;
  game: string;
  pick: string;
  odds: number;
  fair_line: number | null;
  fair_odds: number | null;
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

type PriceRow = {
  team?: string;
  label?: string;
  point?: number;
  price: number;
  book: string;
  bookKey: string;
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

function expectedValue(trueProb: number, odds: number) {
  return (trueProb * decimalOdds(odds) - 1) * 100;
}

function americanOdds(probability: number) {
  if (probability <= 0 || probability >= 1) return null;

  if (probability >= 0.5) {
    return Math.round((-100 * probability) / (1 - probability));
  }

  return Math.round((100 * (1 - probability)) / probability);
}

function avg(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function median(nums: number[]) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function clamp(num: number, min: number, max: number) {
  return Math.min(max, Math.max(min, num));
}

function standardDeviation(nums: number[]) {
  if (nums.length < 2) return 0;
  const mean = avg(nums);
  const variance = avg(nums.map((n) => Math.pow(n - mean, 2)));
  return Math.sqrt(variance);
}

function noVigTwoWay(a: number, b: number) {
  const total = a + b;
  if (!total) return { a: 0, b: 0 };

  return {
    a: a / total,
    b: b / total,
  };
}

function cleanSport(sportKey: string) {
  if (sportKey === 'baseball_mlb') return 'MLB';
  if (sportKey === 'basketball_nba') return 'NBA';
  if (sportKey === 'icehockey_nhl') return 'NHL';
  return sportKey.toUpperCase();
}

function formatSigned(num: number | null) {
  if (num === null) return '—';
  return num > 0 ? `+${num}` : `${num}`;
}

function formatPoint(point: number) {
  return point > 0 ? `+${point}` : `${point}`;
}

function isValidGameWindow(commenceTime: string) {
  const now = Date.now();
  const start = new Date(commenceTime).getTime();

  if (Number.isNaN(start)) return false;

  const hoursAway = (start - now) / 36e5;
  const minutesAway = (start - now) / 60000;

  return hoursAway <= LOOKAHEAD_HOURS && minutesAway >= MIN_MINUTES_TO_START;
}

function bookWeight(bookKey: string | null) {
  if (!bookKey) return 1;

  if (bookKey === 'draftkings') return 1.08;
  if (bookKey === 'fanduel') return 1.08;
  if (bookKey === 'betmgm') return 1.03;
  if (bookKey === 'caesars') return 1.02;
  if (bookKey === 'betrivers') return 1.0;
  if (bookKey === 'fanatics') return 0.98;
  if (bookKey === 'espnbet') return 0.97;
  if (bookKey === 'thescorebet') return 0.96;

  return 1;
}

function getMarketSignals(prices: number[], bestOdds: number, bestBookKey: string | null) {
  const implieds = prices.map(impliedProbability);
  const avgImp = avg(implieds);
  const medImp = median(implieds);
  const bestImp = impliedProbability(bestOdds);
  const disagreement = standardDeviation(implieds);
  const priceGap = avgImp - bestImp;
  const bestBookBoost = bookWeight(bestBookKey);

  return {
    avgImp,
    medImp,
    disagreement,
    priceGap,
    bestBookBoost,
  };
}

function getRating(edge: number, ev: number, score: number) {
  if (edge >= 4.5 && ev >= 7 && score >= 80) return 'MAX';
  if (edge >= 3 && ev >= 5 && score >= 68) return 'A';
  if (edge >= 1.75 && ev >= 3 && score >= 54) return 'B';
  if (edge >= 1.05 && ev >= 2) return 'C';
  return null;
}

function stakeForRating(rating: string) {
  if (rating === 'MAX') return 2;
  if (rating === 'A') return 1.5;
  if (rating === 'B') return 1;
  return 0.5;
}

function adjustedProbability(params: {
  consensusProb: number;
  bestOdds: number;
  allPrices: number[];
  bestBookKey: string | null;
  marketType: MarketType;
}) {
  const { consensusProb, bestOdds, allPrices, bestBookKey, marketType } = params;

  const signals = getMarketSignals(allPrices, bestOdds, bestBookKey);

  let adjustment = 0;

  adjustment += clamp(signals.priceGap * 0.55, -0.018, 0.035);

  if (signals.disagreement >= 0.018) adjustment += 0.006;
  if (signals.disagreement >= 0.028) adjustment += 0.006;

  if (signals.bestBookBoost >= 1.05) adjustment += 0.004;

  if (marketType === 'spread') adjustment += 0.004;
  if (marketType === 'total') adjustment += 0.003;

  if (bestOdds >= 220) adjustment -= 0.008;
  if (bestOdds >= 300) adjustment -= 0.012;
  if (bestOdds <= -240) adjustment -= 0.01;

  if (bestOdds >= -160 && bestOdds <= 160) adjustment += 0.005;

  return clamp(consensusProb + adjustment, 0.03, 0.97);
}

function qualityScore(params: {
  edge: number;
  ev: number;
  odds: number;
  marketType: MarketType;
  prices: number[];
  bestBookKey: string | null;
  sport: string;
}) {
  const { edge, ev, odds, marketType, prices, bestBookKey, sport } = params;
  const signals = getMarketSignals(prices, odds, bestBookKey);

  let score = 0;

  score += edge * 12;
  score += ev * 6;
  score += clamp(signals.priceGap * 100, 0, 5) * 4;
  score += clamp(signals.disagreement * 100, 0, 4) * 3;
  score += (bookWeight(bestBookKey) - 1) * 40;

  if (marketType === 'spread') score += 5;
  if (marketType === 'total') score += 4;
  if (marketType === 'moneyline') score += 3;

  if ((sport === 'MLB' || sport === 'NHL') && marketType === 'spread') score -= 6;

  if (odds >= -155 && odds <= 155) score += 8;
  else if (odds >= -200 && odds <= 200) score += 3;
  else score -= 8;

  if (odds >= 220 && edge < 2.25) score -= 10;
  if (odds <= -240 && edge < 2.25) score -= 10;

  return score;
}

function pickIsSafeEnough(params: {
  edge: number;
  ev: number;
  odds: number;
  sport: string;
  marketType: MarketType;
  score: number;
  fallback?: boolean;
}) {
  const { edge, ev, odds, sport, marketType, score, fallback } = params;

  const minEdge = fallback ? FALLBACK_MIN_EDGE : MIN_EDGE;
  const minEv = fallback ? FALLBACK_MIN_EV : MIN_EV;

  if (edge < minEdge || ev < minEv) return false;

  if (score < (fallback ? 36 : 44)) return false;

  if ((sport === 'MLB' || sport === 'NHL') && marketType === 'spread' && odds > 120 && edge < 2.25) {
    return false;
  }

  if (odds >= 250 && edge < 1.8) return false;
  if (odds <= -260 && edge < 1.8) return false;

  return true;
}

function makeAnalysis(params: {
  pick: string;
  marketLabel: string;
  bestOdds: number;
  bestBook: string;
  fair: number | null;
  trueProb: number;
  implied: number;
  edge: number;
  ev: number;
  rating: string;
  score: number;
  fallback?: boolean;
}) {
  const {
    pick,
    marketLabel,
    bestOdds,
    bestBook,
    fair,
    trueProb,
    implied,
    edge,
    ev,
    rating,
    score,
    fallback,
  } = params;

  const intro = fallback
    ? `${pick} is today's best available value spot. It is not a max-strength play, but it passed the fallback quality screen.`
    : `${pick} is a qualified adjusted EV ${marketLabel} play.`;

  return `${intro} Best price is ${formatSigned(bestOdds)} at ${bestBook}. Fair odds are ${formatSigned(
    fair
  )}. Model probability is ${(trueProb * 100).toFixed(1)}%. Market implied probability is ${(
    implied * 100
  ).toFixed(1)}%. Edge: ${edge.toFixed(2)}%. EV: ${ev.toFixed(
    2
  )}%. Quality score: ${score.toFixed(1)}. Rating: ${rating}.`;
}

function buildMoneylineCandidates(event: any, sport: string, nowIso: string, fallback = false): Candidate[] {
  const sportLabel = cleanSport(sport);

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

  const [teamA, teamB] = teams;

  if (sides[teamA].prices.length < MIN_BOOKS_ML) return [];
  if (sides[teamB].prices.length < MIN_BOOKS_ML) return [];

  const probA = median(sides[teamA].prices.map(impliedProbability));
  const probB = median(sides[teamB].prices.map(impliedProbability));
  const nv = noVigTwoWay(probA, probB);

  const baseProbs: Record<string, number> = {
    [teamA]: nv.a,
    [teamB]: nv.b,
  };

  const picks: Candidate[] = [];

  for (const team of teams) {
    const side = sides[team];

    const trueProb = adjustedProbability({
      consensusProb: baseProbs[team],
      bestOdds: side.bestPrice,
      allPrices: side.prices,
      bestBookKey: side.bestBookKey,
      marketType: 'moneyline',
    });

    const implied = impliedProbability(side.bestPrice);
    const edge = (trueProb - implied) * 100;
    const ev = expectedValue(trueProb, side.bestPrice);
    const fair = americanOdds(trueProb);

    const score = qualityScore({
      edge,
      ev,
      odds: side.bestPrice,
      marketType: 'moneyline',
      prices: side.prices,
      bestBookKey: side.bestBookKey,
      sport: sportLabel,
    });

    if (!pickIsSafeEnough({ edge, ev, odds: side.bestPrice, sport: sportLabel, marketType: 'moneyline', score, fallback })) {
      continue;
    }

    const rating = getRating(edge, ev, score) ?? 'C';

    picks.push({
      sport: sportLabel,
      game: `${event.away_team} at ${event.home_team}`,
      pick: `${team} ML`,
      odds: side.bestPrice,
      fair_line: fair,
      fair_odds: fair,
      confidence: `${Math.round(trueProb * 100)}`,
      analysis: makeAnalysis({
        pick: `${team} ML`,
        marketLabel: 'moneyline',
        bestOdds: side.bestPrice,
        bestBook: side.bestBook,
        fair,
        trueProb,
        implied,
        edge,
        ev,
        rating,
        score,
        fallback,
      }),
      stake: fallback ? 0.25 : stakeForRating(rating),
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

  return picks;
}

function buildSpreadCandidates(event: any, sport: string, nowIso: string, fallback = false): Candidate[] {
  const sportLabel = cleanSport(sport);
  const byLine: Record<string, PriceRow[]> = {};

  for (const book of event.bookmakers ?? []) {
    if (!ALLOWED_BOOKS.has(book.key)) continue;

    const market = book.markets?.find((m: any) => m.key === 'spreads');
    if (!market?.outcomes?.length) continue;

    for (const outcome of market.outcomes) {
      if (typeof outcome.price !== 'number') continue;
      if (typeof outcome.point !== 'number') continue;

      const key = String(Math.abs(outcome.point));
      if (!byLine[key]) byLine[key] = [];

      byLine[key].push({
        team: outcome.name,
        point: outcome.point,
        price: outcome.price,
        book: book.title ?? book.key,
        bookKey: book.key,
      });
    }
  }

  const picks: Candidate[] = [];

  for (const key of Object.keys(byLine)) {
    const rows = byLine[key];

    const plusRows = rows.filter((r) => typeof r.point === 'number' && r.point > 0);
    const minusRows = rows.filter((r) => typeof r.point === 'number' && r.point < 0);

    if (plusRows.length < MIN_BOOKS_SPREAD_TOTAL) continue;
    if (minusRows.length < MIN_BOOKS_SPREAD_TOTAL) continue;

    const plusBest = [...plusRows].sort((a, b) => b.price - a.price)[0];
    const minusBest = [...minusRows].sort((a, b) => b.price - a.price)[0];

    const plusProb = median(plusRows.map((r) => impliedProbability(r.price)));
    const minusProb = median(minusRows.map((r) => impliedProbability(r.price)));
    const nv = noVigTwoWay(plusProb, minusProb);

    const pair = [
      { side: plusBest, consensusProb: nv.a, allPrices: plusRows.map((r) => r.price) },
      { side: minusBest, consensusProb: nv.b, allPrices: minusRows.map((r) => r.price) },
    ];

    for (const item of pair) {
      const trueProb = adjustedProbability({
        consensusProb: item.consensusProb,
        bestOdds: item.side.price,
        allPrices: item.allPrices,
        bestBookKey: item.side.bookKey,
        marketType: 'spread',
      });

      const implied = impliedProbability(item.side.price);
      const edge = (trueProb - implied) * 100;
      const ev = expectedValue(trueProb, item.side.price);
      const fair = americanOdds(trueProb);

      const score = qualityScore({
        edge,
        ev,
        odds: item.side.price,
        marketType: 'spread',
        prices: item.allPrices,
        bestBookKey: item.side.bookKey,
        sport: sportLabel,
      });

      if (!pickIsSafeEnough({ edge, ev, odds: item.side.price, sport: sportLabel, marketType: 'spread', score, fallback })) {
        continue;
      }

      const rating = getRating(edge, ev, score) ?? 'C';
      const pickName = `${item.side.team} ${formatPoint(item.side.point ?? 0)}`;

      picks.push({
        sport: sportLabel,
        game: `${event.away_team} at ${event.home_team}`,
        pick: pickName,
        odds: item.side.price,
        fair_line: fair,
        fair_odds: fair,
        confidence: `${Math.round(trueProb * 100)}`,
        analysis: makeAnalysis({
          pick: pickName,
          marketLabel: 'spread',
          bestOdds: item.side.price,
          bestBook: item.side.book,
          fair,
          trueProb,
          implied,
          edge,
          ev,
          rating,
          score,
          fallback,
        }),
        stake: fallback ? 0.25 : stakeForRating(rating),
        result: 'pending',
        sportsbook: item.side.book,
        sportsbook_key: item.side.bookKey,
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

  return picks;
}

function buildTotalCandidates(event: any, sport: string, nowIso: string, fallback = false): Candidate[] {
  const sportLabel = cleanSport(sport);
  const byTotal: Record<string, PriceRow[]> = {};

  for (const book of event.bookmakers ?? []) {
    if (!ALLOWED_BOOKS.has(book.key)) continue;

    const market = book.markets?.find((m: any) => m.key === 'totals');
    if (!market?.outcomes?.length) continue;

    for (const outcome of market.outcomes) {
      if (typeof outcome.price !== 'number') continue;
      if (typeof outcome.point !== 'number') continue;
      if (outcome.name !== 'Over' && outcome.name !== 'Under') continue;

      const key = String(outcome.point);
      if (!byTotal[key]) byTotal[key] = [];

      byTotal[key].push({
        label: outcome.name,
        point: outcome.point,
        price: outcome.price,
        book: book.title ?? book.key,
        bookKey: book.key,
      });
    }
  }

  const picks: Candidate[] = [];

  for (const key of Object.keys(byTotal)) {
    const rows = byTotal[key];

    const overRows = rows.filter((r) => r.label === 'Over');
    const underRows = rows.filter((r) => r.label === 'Under');

    if (overRows.length < MIN_BOOKS_SPREAD_TOTAL) continue;
    if (underRows.length < MIN_BOOKS_SPREAD_TOTAL) continue;

    const overBest = [...overRows].sort((a, b) => b.price - a.price)[0];
    const underBest = [...underRows].sort((a, b) => b.price - a.price)[0];

    const overProb = median(overRows.map((r) => impliedProbability(r.price)));
    const underProb = median(underRows.map((r) => impliedProbability(r.price)));
    const nv = noVigTwoWay(overProb, underProb);

    const pair = [
      { side: overBest, consensusProb: nv.a, allPrices: overRows.map((r) => r.price) },
      { side: underBest, consensusProb: nv.b, allPrices: underRows.map((r) => r.price) },
    ];

    for (const item of pair) {
      const trueProb = adjustedProbability({
        consensusProb: item.consensusProb,
        bestOdds: item.side.price,
        allPrices: item.allPrices,
        bestBookKey: item.side.bookKey,
        marketType: 'total',
      });

      const implied = impliedProbability(item.side.price);
      const edge = (trueProb - implied) * 100;
      const ev = expectedValue(trueProb, item.side.price);
      const fair = americanOdds(trueProb);

      const score = qualityScore({
        edge,
        ev,
        odds: item.side.price,
        marketType: 'total',
        prices: item.allPrices,
        bestBookKey: item.side.bookKey,
        sport: sportLabel,
      });

      if (!pickIsSafeEnough({ edge, ev, odds: item.side.price, sport: sportLabel, marketType: 'total', score, fallback })) {
        continue;
      }

      const rating = getRating(edge, ev, score) ?? 'C';
      const pickName = `${item.side.label} ${item.side.point}`;

      picks.push({
        sport: sportLabel,
        game: `${event.away_team} at ${event.home_team}`,
        pick: pickName,
        odds: item.side.price,
        fair_line: fair,
        fair_odds: fair,
        confidence: `${Math.round(trueProb * 100)}`,
        analysis: makeAnalysis({
          pick: pickName,
          marketLabel: 'total',
          bestOdds: item.side.price,
          bestBook: item.side.book,
          fair,
          trueProb,
          implied,
          edge,
          ev,
          rating,
          score,
          fallback,
        }),
        stake: fallback ? 0.25 : stakeForRating(rating),
        result: 'pending',
        sportsbook: item.side.book,
        sportsbook_key: item.side.bookKey,
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

  return picks;
}

function scorePick(p: Candidate) {
  let ratingScore = 0;

  if (p.play_rating === 'MAX') ratingScore = 100;
  else if (p.play_rating === 'A') ratingScore = 78;
  else if (p.play_rating === 'B') ratingScore = 56;
  else ratingScore = 36;

  let marketScore = 0;
  if (p.market_type === 'spread') marketScore = 7;
  if (p.market_type === 'total') marketScore = 6;
  if (p.market_type === 'moneyline') marketScore = 5;

  if ((p.sport === 'MLB' || p.sport === 'NHL') && p.market_type === 'spread') {
    marketScore -= 6;
  }

  const priceSafety =
    p.odds >= -155 && p.odds <= 155
      ? 10
      : p.odds >= -200 && p.odds <= 200
        ? 4
        : -8;

  const bookScore = (bookWeight(p.sportsbook_key) - 1) * 30;

  return ratingScore + marketScore + priceSafety + bookScore + p.edge * 4 + p.ev * 2;
}

function selectPicks(candidates: Candidate[], limit: number) {
  const sorted = [...candidates].sort((a, b) => scorePick(b) - scorePick(a));
  const selected: Candidate[] = [];
  const seenExact = new Set<string>();
  const seenGames = new Set<string>();

  for (const pick of sorted) {
    const exactKey = `${pick.event_id}-${pick.market_type}-${pick.pick}`;

    if (seenExact.has(exactKey)) continue;
    if (ONE_PICK_PER_GAME && seenGames.has(pick.event_id)) continue;

    selected.push(pick);
    seenExact.add(exactKey);
    seenGames.add(pick.event_id);

    if (selected.length >= limit) break;
  }

  return selected;
}

async function fetchEventsForSport(sport: string) {
  const url = `${ODDS_API_BASE}/${sport}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;

  const res = await fetch(url, {
    cache: 'no-store',
  });

  if (!res.ok) return [];

  const events = await res.json();
  return Array.isArray(events) ? events : [];
}

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
      fallbackCandidatesFound: 0,
      finalSelected: 0,
      fallbackUsed: false,
      mode: 'sharp-weighted-ev-with-best-available-fallback',
      minEdge: MIN_EDGE,
      minEv: MIN_EV,
      fallbackMinEdge: FALLBACK_MIN_EDGE,
      fallbackMinEv: FALLBACK_MIN_EV,
      maxPicksPerRun: MAX_PICKS_PER_RUN,
      onePickPerGame: ONE_PICK_PER_GAME,
      lookaheadHours: LOOKAHEAD_HOURS,
      minMinutesToStart: MIN_MINUTES_TO_START,
    };

    const eventsBySport: { sport: string; events: any[] }[] = [];

    for (const sport of SPORTS) {
      const events = await fetchEventsForSport(sport);
      eventsBySport.push({ sport, events });

      for (const event of events) {
        if (!event?.id) continue;
        if (!event?.commence_time) continue;
        if (!event?.bookmakers?.length) continue;
        if (!isValidGameWindow(event.commence_time)) continue;

        debug.eventsChecked++;
      }
    }

    const candidates: Candidate[] = [];

    for (const { sport, events } of eventsBySport) {
      for (const event of events) {
        if (!event?.id) continue;
        if (!event?.commence_time) continue;
        if (!event?.bookmakers?.length) continue;
        if (!isValidGameWindow(event.commence_time)) continue;

        const ml = buildMoneylineCandidates(event, sport, nowIso, false);
        const sp = buildSpreadCandidates(event, sport, nowIso, false);
        const to = buildTotalCandidates(event, sport, nowIso, false);

        debug.moneylineBuilt += ml.length;
        debug.spreadBuilt += sp.length;
        debug.totalBuilt += to.length;

        candidates.push(...ml, ...sp, ...to);
      }
    }

    debug.candidatesFound = candidates.length;

    let final = selectPicks(candidates, MAX_PICKS_PER_RUN);

    if (!final.length && ENABLE_BEST_AVAILABLE_FALLBACK) {
      const fallbackCandidates: Candidate[] = [];

      for (const { sport, events } of eventsBySport) {
        for (const event of events) {
          if (!event?.id) continue;
          if (!event?.commence_time) continue;
          if (!event?.bookmakers?.length) continue;
          if (!isValidGameWindow(event.commence_time)) continue;

          fallbackCandidates.push(...buildMoneylineCandidates(event, sport, nowIso, true));
          fallbackCandidates.push(...buildSpreadCandidates(event, sport, nowIso, true));
          fallbackCandidates.push(...buildTotalCandidates(event, sport, nowIso, true));
        }
      }

      debug.fallbackCandidatesFound = fallbackCandidates.length;

      final = selectPicks(fallbackCandidates, 1);
      debug.fallbackUsed = final.length > 0;
    }

    debug.finalSelected = final.length;

    await supabase.from('picks').delete().eq('status', 'pregame');

    if (!final.length) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message:
          'No playable pregame picks found. Board scanned, including fallback mode, but no value spots passed minimum safety checks.',
        debug,
      });
    }

    const { data, error } = await supabase.from('picks').insert(final).select();

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
