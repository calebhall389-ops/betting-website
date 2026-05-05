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

const LOOKAHEAD_HOURS = 40;
const MIN_MINUTES_TO_START = 15;
const MAX_PICKS_PER_RUN = 6;
const ONE_PICK_PER_GAME = true;

const MIN_BOOKS_ML = 4;
const MIN_BOOKS_SPREAD_TOTAL = 3;

const MIN_EDGE = 1.25;
const MIN_EV = 1.5;

const MIN_A_EDGE = 3.5;
const MIN_A_EV = 5;

const MIN_B_EDGE = 2.25;
const MIN_B_EV = 3;

const MIN_C_EDGE = 1.25;
const MIN_C_EV = 1.5;

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

  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
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

function getRating(edge: number, ev: number) {
  if (edge >= 5 && ev >= 8) return 'MAX';
  if (edge >= MIN_A_EDGE && ev >= MIN_A_EV) return 'A';
  if (edge >= MIN_B_EDGE && ev >= MIN_B_EV) return 'B';
  if (edge >= MIN_C_EDGE && ev >= MIN_C_EV) return 'C';

  return null;
}

function stakeForRating(rating: string) {
  if (rating === 'MAX') return 2;
  if (rating === 'A') return 1.5;
  if (rating === 'B') return 1;
  if (rating === 'C') return 0.5;
  return 0.25;
}

function scorePick(p: Candidate) {
  const ratingScore =
    p.play_rating === 'MAX'
      ? 100
      : p.play_rating === 'A'
        ? 75
        : p.play_rating === 'B'
          ? 50
          : 25;

  const marketScore =
    p.market_type === 'spread' ? 6 : p.market_type === 'total' ? 5 : 4;

  const priceSafety =
    p.odds >= -180 && p.odds <= 180
      ? 4
      : p.odds >= -250 && p.odds <= 250
        ? 2
        : -4;

  return ratingScore + marketScore + priceSafety + p.edge * 2 + p.ev;
}

function pickIsSafeEnough(edge: number, ev: number, odds: number) {
  if (edge < MIN_EDGE || ev < MIN_EV) return false;

  // Avoid huge long-shot traps unless edge is real.
  if (odds >= 250 && edge < 3.5) return false;

  // Avoid massive favorites unless edge is strong.
  if (odds <= -250 && edge < 3.5) return false;

  return true;
}

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

  const [teamA, teamB] = teams;

  if (sides[teamA].prices.length < MIN_BOOKS_ML) return [];
  if (sides[teamB].prices.length < MIN_BOOKS_ML) return [];

  const probA = median(sides[teamA].prices.map(impliedProbability));
  const probB = median(sides[teamB].prices.map(impliedProbability));
  const nv = noVigTwoWay(probA, probB);

  const trueProbs: Record<string, number> = {
    [teamA]: nv.a,
    [teamB]: nv.b,
  };

  const picks: Candidate[] = [];

  for (const team of teams) {
    const side = sides[team];
    const trueProb = trueProbs[team];
    const implied = impliedProbability(side.bestPrice);
    const edge = (trueProb - implied) * 100;
    const ev = expectedValue(trueProb, side.bestPrice);
    const fair = americanOdds(trueProb);

    if (!pickIsSafeEnough(edge, ev, side.bestPrice)) continue;

    const rating = getRating(edge, ev);
    if (!rating) continue;

    picks.push({
      sport: cleanSport(sport),
      game: `${event.away_team} at ${event.home_team}`,
      pick: `${team} ML`,
      odds: side.bestPrice,
      fair_line: fair,
      fair_odds: fair,
      confidence: `${Math.round(trueProb * 100)}`,
      analysis: `${team} ML shows real value versus the no-vig market consensus. Best available price is ${formatSigned(
        side.bestPrice
      )} at ${side.bestBook}. Fair odds are ${formatSigned(
        fair
      )}. Model probability is ${(trueProb * 100).toFixed(
        1
      )}%. Market implied probability is ${(implied * 100).toFixed(
        1
      )}%. Edge: ${edge.toFixed(2)}%. EV: ${ev.toFixed(
        2
      )}%. Rating: ${rating}.`,
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

  return picks;
}

function buildSpreadCandidates(event: any, sport: string, nowIso: string): Candidate[] {
  const byLine: Record<string, any[]> = {};

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

    const plusRows = rows.filter((r) => r.point > 0);
    const minusRows = rows.filter((r) => r.point < 0);

    if (plusRows.length < MIN_BOOKS_SPREAD_TOTAL) continue;
    if (minusRows.length < MIN_BOOKS_SPREAD_TOTAL) continue;

    const plusBest = [...plusRows].sort((a, b) => b.price - a.price)[0];
    const minusBest = [...minusRows].sort((a, b) => b.price - a.price)[0];

    const plusProb = median(plusRows.map((r) => impliedProbability(r.price)));
    const minusProb = median(minusRows.map((r) => impliedProbability(r.price)));
    const nv = noVigTwoWay(plusProb, minusProb);

    const pair = [
      { side: plusBest, trueProb: nv.a },
      { side: minusBest, trueProb: nv.b },
    ];

    for (const item of pair) {
      const implied = impliedProbability(item.side.price);
      const edge = (item.trueProb - implied) * 100;
      const ev = expectedValue(item.trueProb, item.side.price);
      const fair = americanOdds(item.trueProb);

      if (!pickIsSafeEnough(edge, ev, item.side.price)) continue;

      const rating = getRating(edge, ev);
      if (!rating) continue;

      picks.push({
        sport: cleanSport(sport),
        game: `${event.away_team} at ${event.home_team}`,
        pick: `${item.side.team} ${formatPoint(item.side.point)}`,
        odds: item.side.price,
        fair_line: fair,
        fair_odds: fair,
        confidence: `${Math.round(item.trueProb * 100)}`,
        analysis: `${item.side.team} ${formatPoint(
          item.side.point
        )} is showing spread value versus the no-vig consensus. Best available price is ${formatSigned(
          item.side.price
        )} at ${item.side.book}. Fair odds are ${formatSigned(
          fair
        )}. Model cover probability is ${(item.trueProb * 100).toFixed(
          1
        )}%. Market implied probability is ${(implied * 100).toFixed(
          1
        )}%. Edge: ${edge.toFixed(2)}%. EV: ${ev.toFixed(
          2
        )}%. Rating: ${rating}.`,
        stake: stakeForRating(rating),
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

function buildTotalCandidates(event: any, sport: string, nowIso: string): Candidate[] {
  const byTotal: Record<string, any[]> = {};

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
      { side: overBest, trueProb: nv.a },
      { side: underBest, trueProb: nv.b },
    ];

    for (const item of pair) {
      const implied = impliedProbability(item.side.price);
      const edge = (item.trueProb - implied) * 100;
      const ev = expectedValue(item.trueProb, item.side.price);
      const fair = americanOdds(item.trueProb);

      if (!pickIsSafeEnough(edge, ev, item.side.price)) continue;

      const rating = getRating(edge, ev);
      if (!rating) continue;

      picks.push({
        sport: cleanSport(sport),
        game: `${event.away_team} at ${event.home_team}`,
        pick: `${item.side.label} ${item.side.point}`,
        odds: item.side.price,
        fair_line: fair,
        fair_odds: fair,
        confidence: `${Math.round(item.trueProb * 100)}`,
        analysis: `${item.side.label} ${item.side.point} is showing total value versus the no-vig consensus. Best available price is ${formatSigned(
          item.side.price
        )} at ${item.side.book}. Fair odds are ${formatSigned(
          fair
        )}. Model hit probability is ${(item.trueProb * 100).toFixed(
          1
        )}%. Market implied probability is ${(implied * 100).toFixed(
          1
        )}%. Edge: ${edge.toFixed(2)}%. EV: ${ev.toFixed(
          2
        )}%. Rating: ${rating}.`,
        stake: stakeForRating(rating),
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
      mode: 'sharp-no-vig-consensus-best-price-only',
      minEdge: MIN_EDGE,
      minEv: MIN_EV,
      maxPicksPerRun: MAX_PICKS_PER_RUN,
      onePickPerGame: ONE_PICK_PER_GAME,
      lookaheadHours: LOOKAHEAD_HOURS,
    };

    const candidates: Candidate[] = [];

    for (const sport of SPORTS) {
      const url = `${ODDS_API_BASE}/${sport}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;

      const res = await fetch(url, {
        cache: 'no-store',
      });

      if (!res.ok) continue;

      const events = await res.json();

      if (!Array.isArray(events)) continue;

      for (const event of events) {
        if (!event?.id) continue;
        if (!event?.commence_time) continue;
        if (!event?.bookmakers?.length) continue;
        if (!isValidGameWindow(event.commence_time)) continue;

        debug.eventsChecked++;

        const moneyline = buildMoneylineCandidates(event, sport, nowIso);
        const spread = buildSpreadCandidates(event, sport, nowIso);
        const total = buildTotalCandidates(event, sport, nowIso);

        debug.moneylineBuilt += moneyline.length;
        debug.spreadBuilt += spread.length;
        debug.totalBuilt += total.length;

        candidates.push(...moneyline, ...spread, ...total);
      }
    }

    debug.candidatesFound = candidates.length;

    const final = selectPicks(candidates, MAX_PICKS_PER_RUN);
    debug.finalSelected = final.length;

    await supabase.from('picks').delete().eq('status', 'pregame');

    if (!final.length) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message:
          'No qualifying pregame picks found. Board scanned, but no sharp +EV plays passed the filters.',
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
