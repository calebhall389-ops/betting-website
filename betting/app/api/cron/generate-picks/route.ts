import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

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
const MAX_PICKS_PER_RUN = 10;
const ONE_PICK_PER_GAME = false;

// Clean value thresholds
const MIN_C_EDGE = 0.25;
const MIN_C_EV = 1.0;

// Model leans
const MODEL_LEANS_ENABLED = true;

// Flow favorite fallback
const FLOW_FAVORITES_ENABLED = true;
const MIN_FLOW_BOOKS = 4;
const MAX_FLOW_FAVORITE_ODDS = -250;
const MIN_FLOW_FAVORITE_ODDS = -120;
const MIN_FLOW_CONFIDENCE = 58;
const MIN_FLOW_EDGE = -1.0;
const MIN_FLOW_EV = -1.0;

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

function americanOdds(probability: number) {
  if (probability <= 0 || probability >= 1) return null;

  if (probability >= 0.5) {
    return Math.round((-100 * probability) / (1 - probability));
  }

  return Math.round((100 * (1 - probability)) / probability);
}

function expectedValue(trueProb: number, odds: number) {
  return (trueProb * decimalOdds(odds) - 1) * 100;
}

function avg(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function noVigTwoWay(a: number, b: number) {
  const total = a + b;
  return total ? { a: a / total, b: b / total } : { a: 0, b: 0 };
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

function formatSigned(num: number | null) {
  if (num === null) return '—';
  return num > 0 ? `+${num}` : `${num}`;
}

function formatPoint(point: number) {
  return point > 0 ? `+${point}` : `${point}`;
}

function getFinalRating(edge: number, ev: number, odds: number, modelProb: number) {
  // Real value plays
  if (edge >= 5 && ev >= 8) return 'MAX';
  if (edge >= 3 && ev >= 5) return 'A';
  if (edge >= 1.5 && ev >= 3) return 'B';

  if (edge >= MIN_C_EDGE && ev >= MIN_C_EV) {
    if (odds >= 300 && ev < 2) return null;
    return 'C';
  }

  // Strong model leans only
  if (!MODEL_LEANS_ENABLED) return null;

  const pct = modelProb * 100;

  if (pct >= 58 && odds <= -120 && odds >= -250 && ev > -1) return 'LEAN';
  if (pct >= 55 && odds >= -110 && odds <= 150 && ev > -1) return 'LEAN';

  return null;
}

function stakeForRating(rating: string) {
  if (rating === 'MAX') return 2;
  if (rating === 'A') return 1.5;
  if (rating === 'B') return 1;
  if (rating === 'C') return 0.5;
  if (rating === 'LEAN') return 0.25;
  if (rating === 'FLOW') return 0.25;
  return 0.25;
}

function scorePick(p: Candidate) {
  const boost =
    p.play_rating === 'MAX'
      ? 100
      : p.play_rating === 'A'
        ? 75
        : p.play_rating === 'B'
          ? 50
          : p.play_rating === 'C'
            ? 25
            : p.play_rating === 'LEAN'
              ? 12
              : 8;

  const marketBoost =
    p.market_type === 'spread' ? 4 : p.market_type === 'total' ? 4 : 3;

  return boost + marketBoost + p.ev + p.edge;
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

  const avgA = avg(sides[teamA].prices.map(impliedProbability));
  const avgB = avg(sides[teamB].prices.map(impliedProbability));
  const nv = noVigTwoWay(avgA, avgB);

  const probs: Record<string, number> = {
    [teamA]: nv.a,
    [teamB]: nv.b,
  };

  const picks: Candidate[] = [];

  for (const team of teams) {
    const side = sides[team];
    const trueProb = probs[team];
    const implied = impliedProbability(side.bestPrice);
    const edge = (trueProb - implied) * 100;
    const ev = expectedValue(trueProb, side.bestPrice);
    const fairLine = americanOdds(trueProb);
    const rating = getFinalRating(edge, ev, side.bestPrice, trueProb);

    if (!rating) continue;

    const label = rating === 'LEAN' ? 'model lean' : 'value play';

    picks.push({
      sport: cleanSport(sport),
      game: `${event.away_team} at ${event.home_team}`,
      pick: `${team} ML`,
      odds: side.bestPrice,
      fair_line: fairLine,
      fair_odds: fairLine,
      confidence: `${Math.round(trueProb * 100)}`,
      analysis: `${team} ML is a ${label}. Best price is ${formatSigned(
        side.bestPrice
      )} at ${side.bestBook}. Fair odds are ${formatSigned(
        fairLine
      )}. Model probability is ${(trueProb * 100).toFixed(
        1
      )}%. Market implied probability is ${(implied * 100).toFixed(
        1
      )}%. Edge ${edge.toFixed(2)}%. EV ${ev.toFixed(
        2
      )}%. Play rating: ${rating}.`,
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

function buildFlowFavoriteCandidate(event: any, sport: string, nowIso: string): Candidate[] {
  if (!FLOW_FAVORITES_ENABLED) return [];

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

  const avgA = avg(sides[teamA].prices.map(impliedProbability));
  const avgB = avg(sides[teamB].prices.map(impliedProbability));
  const nv = noVigTwoWay(avgA, avgB);

  const probs: Record<string, number> = {
    [teamA]: nv.a,
    [teamB]: nv.b,
  };

  const favorite = teams
    .map((team) => ({
      team,
      trueProb: probs[team],
      side: sides[team],
    }))
    .sort((a, b) => b.trueProb - a.trueProb)[0];

  if (!favorite) return [];
  if (favorite.side.prices.length < MIN_FLOW_BOOKS) return [];
  if (favorite.trueProb * 100 < MIN_FLOW_CONFIDENCE) return [];
  if (favorite.side.bestPrice < MAX_FLOW_FAVORITE_ODDS) return [];
  if (favorite.side.bestPrice > MIN_FLOW_FAVORITE_ODDS) return [];

  const implied = impliedProbability(favorite.side.bestPrice);
  const edge = (favorite.trueProb - implied) * 100;
  const ev = expectedValue(favorite.trueProb, favorite.side.bestPrice);
  const fairLine = americanOdds(favorite.trueProb);

  if (edge < MIN_FLOW_EDGE || ev < MIN_FLOW_EV) return [];

  return [
    {
      sport: cleanSport(sport),
      game: `${event.away_team} at ${event.home_team}`,
      pick: `${favorite.team} ML`,
      odds: favorite.side.bestPrice,
      fair_line: fairLine,
      fair_odds: fairLine,
      confidence: `${Math.round(favorite.trueProb * 100)}`,
      analysis: `${favorite.team} ML is a flow favorite. This is a small lean, not a full edge play. Best available price is ${formatSigned(
        favorite.side.bestPrice
      )} at ${favorite.side.bestBook}. Fair odds are ${formatSigned(
        fairLine
      )}. Model probability is ${(favorite.trueProb * 100).toFixed(
        1
      )}%. Market implied probability is ${(implied * 100).toFixed(
        1
      )}%. Edge ${edge.toFixed(2)}%. EV ${ev.toFixed(
        2
      )}%. Play rating: FLOW.`,
      stake: stakeForRating('FLOW'),
      result: 'pending',
      sportsbook: favorite.side.bestBook,
      sportsbook_key: favorite.side.bestBookKey,
      status: 'pregame',
      commence_time: event.commence_time,
      market_type: 'moneyline',
      edge,
      ev,
      play_rating: 'FLOW',
      max_play: false,
      is_live: false,
      event_id: event.id,
      odds_last_seen_at: nowIso,
    },
  ];
}

function buildSpreadCandidates(event: any, sport: string, nowIso: string): Candidate[] {
  const byLine: Record<string, any[]> = {};

  for (const book of event.bookmakers ?? []) {
    if (!ALLOWED_BOOKS.has(book.key)) continue;

    const market = book.markets?.find((m: any) => m.key === 'spreads');
    if (!market?.outcomes?.length) continue;

    for (const outcome of market.outcomes) {
      if (typeof outcome.price !== 'number' || typeof outcome.point !== 'number') continue;

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

  for (const line of Object.keys(byLine)) {
    const rows = byLine[line];

    const plus = rows.filter((r) => r.point > 0);
    const minus = rows.filter((r) => r.point < 0);

    if (!plus.length || !minus.length) continue;

    const plusBest = plus.sort((a, b) => b.price - a.price)[0];
    const minusBest = minus.sort((a, b) => b.price - a.price)[0];

    const plusProb = avg(plus.map((r) => impliedProbability(r.price)));
    const minusProb = avg(minus.map((r) => impliedProbability(r.price)));
    const nv = noVigTwoWay(plusProb, minusProb);

    const pair = [
      { side: plusBest, trueProb: nv.a },
      { side: minusBest, trueProb: nv.b },
    ];

    for (const item of pair) {
      const implied = impliedProbability(item.side.price);
      const edge = (item.trueProb - implied) * 100;
      const ev = expectedValue(item.trueProb, item.side.price);
      const fairLine = americanOdds(item.trueProb);
      const rating = getFinalRating(edge, ev, item.side.price, item.trueProb);

      if (!rating) continue;

      const label = rating === 'LEAN' ? 'model lean' : 'value play';

      picks.push({
        sport: cleanSport(sport),
        game: `${event.away_team} at ${event.home_team}`,
        pick: `${item.side.team} ${formatPoint(item.side.point)}`,
        odds: item.side.price,
        fair_line: fairLine,
        fair_odds: fairLine,
        confidence: `${Math.round(item.trueProb * 100)}`,
        analysis: `${item.side.team} ${formatPoint(
          item.side.point
        )} spread is a ${label}. Best price is ${formatSigned(
          item.side.price
        )} at ${item.side.book}. Fair odds are ${formatSigned(
          fairLine
        )}. Model cover probability is ${(item.trueProb * 100).toFixed(
          1
        )}%. Market implied probability is ${(implied * 100).toFixed(
          1
        )}%. Edge ${edge.toFixed(2)}%. EV ${ev.toFixed(
          2
        )}%. Play rating: ${rating}.`,
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
      if (typeof outcome.price !== 'number' || typeof outcome.point !== 'number') continue;
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

  for (const total of Object.keys(byTotal)) {
    const rows = byTotal[total];

    const overs = rows.filter((r) => r.label === 'Over');
    const unders = rows.filter((r) => r.label === 'Under');

    if (!overs.length || !unders.length) continue;

    const overBest = overs.sort((a, b) => b.price - a.price)[0];
    const underBest = unders.sort((a, b) => b.price - a.price)[0];

    const overProb = avg(overs.map((r) => impliedProbability(r.price)));
    const underProb = avg(unders.map((r) => impliedProbability(r.price)));
    const nv = noVigTwoWay(overProb, underProb);

    const pair = [
      { side: overBest, trueProb: nv.a },
      { side: underBest, trueProb: nv.b },
    ];

    for (const item of pair) {
      const implied = impliedProbability(item.side.price);
      const edge = (item.trueProb - implied) * 100;
      const ev = expectedValue(item.trueProb, item.side.price);
      const fairLine = americanOdds(item.trueProb);
      const rating = getFinalRating(edge, ev, item.side.price, item.trueProb);

      if (!rating) continue;

      const label = rating === 'LEAN' ? 'model lean' : 'value play';

      picks.push({
        sport: cleanSport(sport),
        game: `${event.away_team} at ${event.home_team}`,
        pick: `${item.side.label} ${item.side.point}`,
        odds: item.side.price,
        fair_line: fairLine,
        fair_odds: fairLine,
        confidence: `${Math.round(item.trueProb * 100)}`,
        analysis: `${item.side.label} ${item.side.point} total is a ${label}. Best price is ${formatSigned(
          item.side.price
        )} at ${item.side.book}. Fair odds are ${formatSigned(
          fairLine
        )}. Model hit probability is ${(item.trueProb * 100).toFixed(
          1
        )}%. Market implied probability is ${(implied * 100).toFixed(
          1
        )}%. Edge ${edge.toFixed(2)}%. EV ${ev.toFixed(
          2
        )}%. Play rating: ${rating}.`,
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
  const seen = new Set<string>();

  for (const pick of sorted) {
    const key = `${pick.event_id}-${pick.market_type}-${pick.pick}`;

    if (seen.has(key)) continue;

    if (ONE_PICK_PER_GAME) {
      const alreadyGame = selected.some((p) => p.event_id === pick.event_id);
      if (alreadyGame) continue;
    }

    selected.push(pick);
    seen.add(key);

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
      flowBuilt: 0,
      candidatesFound: 0,
      finalSelected: 0,
      mode: 'clean-value-plus-strong-model-leans-with-fair-odds',
      minCEdge: MIN_C_EDGE,
      minCEv: MIN_C_EV,
      modelLeansEnabled: MODEL_LEANS_ENABLED,
      flowFavoritesEnabled: FLOW_FAVORITES_ENABLED,
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
        if (!isValidGameWindow(event.commence_time)) continue;
        if (!event.bookmakers?.length) continue;

        debug.eventsChecked++;

        const ml = buildMoneylineCandidates(event, sport, nowIso);
        const sp = buildSpreadCandidates(event, sport, nowIso);
        const to = buildTotalCandidates(event, sport, nowIso);
        const flow = buildFlowFavoriteCandidate(event, sport, nowIso);

        debug.moneylineBuilt += ml.length;
        debug.spreadBuilt += sp.length;
        debug.totalBuilt += to.length;
        debug.flowBuilt += flow.length;

        candidates.push(...ml, ...sp, ...to, ...flow);
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
          'No qualifying pregame picks found. Board scanned, but no clean value plays, strong model leans, or flow favorites passed filters.',
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
