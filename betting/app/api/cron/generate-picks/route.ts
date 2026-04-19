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

type OddsBook = {
  key: string;
  title: string;
  markets?: OddsMarket[];
};

type OddsEvent = {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsBook[];
};

type MarketType = 'h2h' | 'spreads' | 'totals';

type CandidatePick = {
  sport: string;
  game: string;
  eventId: string;
  commenceTime: string;
  pick: string;
  team: string;
  odds: number;
  best_odds: number;
  implied_odds: number;
  confidence: number;
  impliedProbability: number;
  consensusProbability: number;
  edge: number;
  ev: number;
  sportsbook: string;
  sportsbook_key: string;
  analysis: string;
  play_rating: string;
  stake: number;
  status: string;
  marketType: MarketType;
  line: number | null;
  mode: 'pregame';
};

const MAJOR_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'caesars'];

const ALLOWED_SPORTS = ['baseball_mlb', 'basketball_nba', 'icehockey_nhl'];

const MAX_PICKS = 6;
const MAX_PICKS_PER_GAME = 2;
const PREGAME_BUFFER_MINUTES = 15;
const MAX_EV = 25;

function americanToImpliedProb(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function probabilityToAmerican(prob: number): number {
  if (prob <= 0 || prob >= 1) return 0;

  if (prob >= 0.5) {
    return Math.round(-(prob / (1 - prob)) * 100);
  }

  return Math.round(((1 - prob) / prob) * 100);
}

function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function formatSpreadOrTotalPoint(point: number): string {
  if (point > 0) return `+${point}`;
  return `${point}`;
}

function calcEV(winProb: number, americanOdds: number): number {
  const decimalOdds =
    americanOdds > 0
      ? 1 + americanOdds / 100
      : 1 + 100 / Math.abs(americanOdds);

  return (winProb * decimalOdds - 1) * 100;
}

function getPlayRating(ev: number, edge: number): string {
  if (ev >= 9 && edge >= 5) return 'A PLAY';
  if (ev >= 6.5 && edge >= 4) return 'B PLAY';
  if (ev >= 5 && edge >= 3.5) return 'LEAN';
  return 'PASS';
}

function getStakeUnits(playRating: string): number {
  if (playRating === 'A PLAY') return 1.5;
  if (playRating === 'B PLAY') return 1;
  if (playRating === 'LEAN') return 0.5;
  return 0;
}

function getThresholds(marketType: MarketType) {
  if (marketType === 'h2h') {
    return { minEdge: 3.5, minEv: 5 };
  }

  return { minEdge: 4, minEv: 6 };
}

function isEligiblePregameEvent(commenceTime: string): boolean {
  const now = new Date();
  const eventDate = new Date(commenceTime);

  if (Number.isNaN(eventDate.getTime())) return false;

  const cutoff = new Date(now.getTime() + PREGAME_BUFFER_MINUTES * 60 * 1000);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  return eventDate >= cutoff && eventDate < dayAfterTomorrow;
}

function buildGameLabel(event: OddsEvent): string {
  return `${event.away_team} at ${event.home_team}`;
}

function normalizeSport(sportKey: string): string {
  if (sportKey.includes('mlb')) return 'MLB';
  if (sportKey.includes('nba')) return 'NBA';
  if (sportKey.includes('nhl')) return 'NHL';
  return sportKey.toUpperCase();
}

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(url, key);
}

async function fetchOdds(sport: string): Promise<OddsEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    throw new Error('Missing ODDS_API_KEY');
  }

  const url =
    `https://api.the-odds-api.com/v4/sports/${sport}/odds` +
    `?apiKey=${apiKey}` +
    `&regions=us` +
    `&markets=h2h,spreads,totals` +
    `&oddsFormat=american` +
    `&dateFormat=iso` +
    `&bookmakers=${MAJOR_BOOKS.join(',')}`;

  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API failed for ${sport}: ${text}`);
  }

  return res.json();
}

function makeAnalysis(input: {
  pick: string;
  sportsbook: string;
  bestOdds: number;
  impliedOdds: number;
  confidence: number;
  impliedProbability: number;
  edge: number;
  ev: number;
  playRating: string;
}): string {
  return `${input.pick} at ${input.sportsbook} is priced at ${formatAmericanOdds(
    input.bestOdds
  )} versus a model fair line of ${formatAmericanOdds(
    input.impliedOdds
  )}. Model win probability is ${input.confidence.toFixed(
    1
  )}% compared with market implied probability of ${(
    input.impliedProbability * 100
  ).toFixed(1)}%. Estimated edge is ${input.edge.toFixed(
    2
  )}% with projected EV of ${input.ev.toFixed(2)}%. ${input.playRating}.`;
}

function buildCandidateKey(marketType: MarketType, outcomeName: string, point?: number) {
  if (marketType === 'h2h') return `h2h:${outcomeName}`;
  return `${marketType}:${outcomeName}:${point ?? 'na'}`;
}

function buildPickLabel(marketType: MarketType, outcomeName: string, point?: number) {
  if (marketType === 'h2h') {
    return `${outcomeName} ML`;
  }

  if (marketType === 'spreads') {
    if (typeof point !== 'number') return null;
    return `${outcomeName} ${formatSpreadOrTotalPoint(point)}`;
  }

  if (typeof point !== 'number') return null;
  return `${outcomeName} ${point}`;
}

function buildCandidatesFromEvent(event: OddsEvent): CandidatePick[] {
  if (!isEligiblePregameEvent(event.commence_time)) return [];

  const books = (event.bookmakers || []).filter((book) =>
    MAJOR_BOOKS.includes(book.key)
  );

  if (books.length < 2) return [];

  const grouped = new Map<
    string,
    {
      marketType: MarketType;
      pick: string;
      team: string;
      line: number | null;
      prices: {
        sportsbook: string;
        sportsbook_key: string;
        price: number;
      }[];
    }
  >();

  for (const book of books) {
    for (const market of book.markets || []) {
      if (
        market.key !== 'h2h' &&
        market.key !== 'spreads' &&
        market.key !== 'totals'
      ) {
        continue;
      }

      const marketType = market.key as MarketType;

      for (const outcome of market.outcomes || []) {
        if (typeof outcome.price !== 'number') continue;

        if (marketType !== 'h2h' && typeof outcome.point !== 'number') {
          continue;
        }

        const key = buildCandidateKey(marketType, outcome.name, outcome.point);
        const pick = buildPickLabel(marketType, outcome.name, outcome.point);

        if (!pick) continue;

        if (!grouped.has(key)) {
          grouped.set(key, {
            marketType,
            pick,
            team: outcome.name,
            line: typeof outcome.point === 'number' ? outcome.point : null,
            prices: [],
          });
        }

        grouped.get(key)!.prices.push({
          sportsbook: book.title,
          sportsbook_key: book.key,
          price: outcome.price,
        });
      }
    }
  }

  const results: CandidatePick[] = [];

  for (const [, entry] of grouped) {
    if (entry.prices.length < 2) continue;

    const best = entry.prices.reduce((a, b) => (b.price > a.price ? b : a));
    const consensusAmerican = Math.round(
      entry.prices.reduce((sum, item) => sum + item.price, 0) /
        entry.prices.length
    );

    const implied = americanToImpliedProb(best.price);
    const consensus = americanToImpliedProb(consensusAmerican);

    let model = consensus;

    if (entry.marketType === 'h2h') {
      if (best.price > -200 && best.price < 200) {
        model += 0.025;
      } else if (best.price < 500) {
        model += 0.015;
      } else {
        model += 0.005;
      }

      if (best.price > 500) {
        model = Math.min(model, implied + 0.02);
      }
    } else {
      if (best.price > -140 && best.price < 140) {
        model += 0.02;
      } else {
        model += 0.0125;
      }
    }

    model = Math.min(model, 0.75);

    const edge = (model - implied) * 100;
    const ev = calcEV(model, best.price);
    const rating = getPlayRating(ev, edge);
    const stake = getStakeUnits(rating);
    const impliedOdds = probabilityToAmerican(model);
    const { minEdge, minEv } = getThresholds(entry.marketType);

    if (edge < minEdge) continue;
    if (ev < minEv) continue;
    if (ev > MAX_EV) continue;
    if (rating === 'PASS') continue;

    results.push({
      sport: normalizeSport(event.sport_key),
      game: buildGameLabel(event),
      eventId: event.id,
      commenceTime: event.commence_time,
      pick: entry.pick,
      team: entry.team,
      odds: best.price,
      best_odds: best.price,
      implied_odds: impliedOdds,
      confidence: model * 100,
      impliedProbability: implied,
      consensusProbability: consensus,
      edge,
      ev,
      sportsbook: best.sportsbook,
      sportsbook_key: best.sportsbook_key,
      analysis: makeAnalysis({
        pick: entry.pick,
        sportsbook: best.sportsbook,
        bestOdds: best.price,
        impliedOdds,
        confidence: model * 100,
        impliedProbability: implied,
        edge,
        ev,
        playRating: rating,
      }),
      play_rating: rating,
      stake,
      status: 'open',
      marketType: entry.marketType,
      line: entry.line,
      mode: 'pregame',
    });
  }

  return results;
}

function dedupeBest(candidates: CandidatePick[]) {
  const map = new Map<string, CandidatePick>();

  for (const candidate of candidates) {
    const key =
      candidate.marketType === 'h2h'
        ? `${candidate.eventId}-${candidate.marketType}-${candidate.team}`
        : `${candidate.eventId}-${candidate.marketType}-${candidate.pick}`;

    const existing = map.get(key);

    if (!existing || candidate.ev > existing.ev) {
      map.set(key, candidate);
    }
  }

  return Array.from(map.values());
}

function limitPicksPerGame(candidates: CandidatePick[]) {
  const sorted = [...candidates].sort((a, b) => {
    if (b.ev !== a.ev) return b.ev - a.ev;
    if (b.edge !== a.edge) return b.edge - a.edge;
    return b.confidence - a.confidence;
  });

  const perGameCount = new Map<string, number>();
  const final: CandidatePick[] = [];

  for (const candidate of sorted) {
    const count = perGameCount.get(candidate.eventId) || 0;
    if (count >= MAX_PICKS_PER_GAME) continue;

    final.push(candidate);
    perGameCount.set(candidate.eventId, count + 1);

    if (final.length >= MAX_PICKS) break;
  }

  return final;
}

async function clearPregamePicks() {
  const supabase = getSupabase();

  const { error } = await supabase.from('picks').delete().eq('mode', 'pregame');

  if (error) {
    throw new Error(`Failed deleting old pregame picks: ${error.message}`);
  }
}

async function insertPicks(final: CandidatePick[]) {
  const supabase = getSupabase();

  const payload = final.map((p) => ({
    sport: p.sport,
    game: p.game,
    pick: p.pick,
    odds: p.odds,
    best_odds: p.best_odds,
    implied_odds: p.implied_odds,
    confidence: Number(p.confidence.toFixed(0)),
    analysis: p.analysis,
    stake: p.stake,
    sportsbook: p.sportsbook,
    sportsbook_key: p.sportsbook_key,
    edge: Number(p.edge.toFixed(2)),
    ev: Number(p.ev.toFixed(2)),
    play_rating: p.play_rating,
    status: 'open',
    mode: 'pregame',
    market_type: p.marketType,
    event_id: p.eventId,
    commence_time: p.commenceTime,
    result: 'pending',
  }));

  const { data, error } = await supabase
    .from('picks')
    .insert(payload)
    .select();

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }

  return data;
}

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('x-cron-secret');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && auth !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let all: CandidatePick[] = [];
    let eventsChecked = 0;

    for (const sport of ALLOWED_SPORTS) {
      const events = await fetchOdds(sport);
      eventsChecked += events.length;

      for (const event of events) {
        all.push(...buildCandidatesFromEvent(event));
      }
    }

    const deduped = dedupeBest(all);
    const final = limitPicksPerGame(deduped);

    await clearPregamePicks();

    if (!final.length) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        picks: [],
        debug: {
          eventsChecked,
          candidatesFound: all.length,
          dedupedCandidates: deduped.length,
          finalSelected: 0,
          maxPicks: MAX_PICKS,
          maxPicksPerGame: MAX_PICKS_PER_GAME,
          maxEv: MAX_EV,
          books: MAJOR_BOOKS,
          mode: 'pregame',
          pregameBufferMinutes: PREGAME_BUFFER_MINUTES,
          thresholds: {
            h2h: getThresholds('h2h'),
            spreads: getThresholds('spreads'),
            totals: getThresholds('totals'),
          },
        },
      });
    }

    const data = await insertPicks(final);

    return NextResponse.json({
      success: true,
      inserted: data?.length || 0,
      picks: data || [],
      debug: {
        eventsChecked,
        candidatesFound: all.length,
        dedupedCandidates: deduped.length,
        finalSelected: final.length,
        maxPicks: MAX_PICKS,
        maxPicksPerGame: MAX_PICKS_PER_GAME,
        maxEv: MAX_EV,
        books: MAJOR_BOOKS,
        mode: 'pregame',
        pregameBufferMinutes: PREGAME_BUFFER_MINUTES,
        thresholds: {
          h2h: getThresholds('h2h'),
          spreads: getThresholds('spreads'),
          totals: getThresholds('totals'),
        },
      },
    });
  } catch (error) {
    console.error('CRON ERROR:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
