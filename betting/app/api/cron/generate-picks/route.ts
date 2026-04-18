import { NextRequest, NextResponse } from 'next/server';
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
  marketType: 'h2h';
  mode: 'pregame';
};

const MAJOR_BOOKS = ['draftkings', 'fanduel', 'betmgm', 'caesars'];
const ALLOWED_SPORTS = ['baseball_mlb', 'basketball_nba', 'icehockey_nhl'];

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

function isEligiblePregameEvent(commenceTime: string): boolean {
  const now = new Date();
  const eventDate = new Date(commenceTime);

  if (Number.isNaN(eventDate.getTime())) return false;

  const pregameBufferMinutes = 15;
  const cutoff = new Date(now.getTime() + pregameBufferMinutes * 60 * 1000);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  return eventDate >= cutoff && eventDate < dayAfterTomorrow;
}

function buildGameLabel(event: OddsEvent): string {
  return `${event.away_team} at ${event.home_team}`;
}

function teamToPickLabel(team: string): string {
  return `${team} ML`;
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
    `&markets=h2h` +
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
  consensusProbability: number;
  edge: number;
  ev: number;
  playRating: string;
}): string {
  return `${input.pick} shows value at ${input.sportsbook}. Best price available is ${formatAmericanOdds(
    input.bestOdds
  )}, while the model fair line is ${formatAmericanOdds(
    input.impliedOdds
  )}. Model win probability is ${input.confidence.toFixed(
    2
  )}%, compared with market implied probability of ${(
    input.impliedProbability * 100
  ).toFixed(2)}% and consensus probability of ${(
    input.consensusProbability * 100
  ).toFixed(2)}%. Estimated edge is ${input.edge.toFixed(
    2
  )}% with projected EV of ${input.ev.toFixed(2)}%. Rating: ${
    input.playRating
  }.`;
}

function getBestBookPriceForTeam(event: OddsEvent, team: string) {
  const books = (event.bookmakers || []).filter((book) =>
    MAJOR_BOOKS.includes(book.key)
  );

  const prices: {
    sportsbook: string;
    sportsbook_key: string;
    price: number;
  }[] = [];

  for (const book of books) {
    const h2h = book.markets?.find((market) => market.key === 'h2h');
    const outcome = h2h?.outcomes?.find((o) => o.name === team);

    if (!outcome || typeof outcome.price !== 'number') continue;

    prices.push({
      sportsbook: book.title,
      sportsbook_key: book.key,
      price: outcome.price,
    });
  }

  if (prices.length < 2) return null;

  const best = prices.reduce((a, b) => (b.price > a.price ? b : a));
  const consensus =
    prices.reduce((sum, priceObj) => sum + priceObj.price, 0) / prices.length;

  return { best, consensus };
}

function buildCandidatesFromEvent(event: OddsEvent): CandidatePick[] {
  if (!isEligiblePregameEvent(event.commence_time)) return [];

  const teams = [event.home_team, event.away_team];
  const results: CandidatePick[] = [];

  for (const team of teams) {
    const data = getBestBookPriceForTeam(event, team);
    if (!data) continue;

    const implied = americanToImpliedProb(data.best.price);
    const consensus = americanToImpliedProb(Math.round(data.consensus));

    let model = consensus;

    if (data.best.price > -200 && data.best.price < 200) {
      model += 0.025;
    } else if (data.best.price < 500) {
      model += 0.015;
    } else {
      model += 0.005;
    }

    if (data.best.price > 500) {
      model = Math.min(model, implied + 0.02);
    }

    model = Math.min(model, 0.75);

    const edge = (model - implied) * 100;
    const ev = calcEV(model, data.best.price);
    const rating = getPlayRating(ev, edge);
    const stake = getStakeUnits(rating);
    const impliedOdds = probabilityToAmerican(model);

    if (edge < 3.5) continue;
    if (ev < 5) continue;
    if (ev > 25) continue;
    if (rating === 'PASS') continue;

    results.push({
      sport: normalizeSport(event.sport_key),
      game: buildGameLabel(event),
      eventId: event.id,
      commenceTime: event.commence_time,
      pick: teamToPickLabel(team),
      team,
      odds: data.best.price,
      best_odds: data.best.price,
      implied_odds: impliedOdds,
      confidence: model * 100,
      impliedProbability: implied,
      consensusProbability: consensus,
      edge,
      ev,
      sportsbook: data.best.sportsbook,
      sportsbook_key: data.best.sportsbook_key,
      analysis: makeAnalysis({
        pick: teamToPickLabel(team),
        sportsbook: data.best.sportsbook,
        bestOdds: data.best.price,
        impliedOdds,
        confidence: model * 100,
        impliedProbability: implied,
        consensusProbability: consensus,
        edge,
        ev,
        playRating: rating,
      }),
      play_rating: rating,
      stake,
      status: 'open',
      marketType: 'h2h',
      mode: 'pregame',
    });
  }

  return results;
}

function dedupeBest(candidates: CandidatePick[]) {
  const map = new Map<string, CandidatePick>();

  for (const candidate of candidates) {
    const existing = map.get(candidate.eventId);
    if (!existing || candidate.ev > existing.ev) {
      map.set(candidate.eventId, candidate);
    }
  }

  return Array.from(map.values());
}

async function clearPregamePicks() {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('picks')
    .delete()
    .eq('mode', 'pregame');

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
    market_type: 'h2h',
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

    const final = dedupeBest(all)
      .sort((a, b) => b.ev - a.ev)
      .slice(0, 6);

    await clearPregamePicks();

    if (!final.length) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        picks: [],
        debug: {
          eventsChecked,
          candidatesFound: all.length,
          finalSelected: 0,
          minEdge: 3.5,
          minEv: 5,
          maxEv: 25,
          maxPicks: 6,
          books: MAJOR_BOOKS,
          mode: 'pregame',
          pregameBufferMinutes: 15,
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
        finalSelected: final.length,
        minEdge: 3.5,
        minEv: 5,
        maxEv: 25,
        maxPicks: 6,
        books: MAJOR_BOOKS,
        mode: 'pregame',
        pregameBufferMinutes: 15,
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
