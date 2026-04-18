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

function sameCalendarWindow(commenceTime: string): boolean {
  const now = new Date();
  const eventDate = new Date(commenceTime);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  return eventDate >= today && eventDate < dayAfterTomorrow;
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
    throw new Error('Missing Supabase env vars');
  }

  return createClient(url, key);
}

async function fetchOdds(sport: string): Promise<OddsEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;

  const url =
    `https://api.the-odds-api.com/v4/sports/${sport}/odds` +
    `?apiKey=${apiKey}` +
    `&regions=us` +
    `&markets=h2h` +
    `&oddsFormat=american` +
    `&dateFormat=iso` +
    `&bookmakers=${MAJOR_BOOKS.join(',')}`;

  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) throw new Error(await res.text());

  return res.json();
}

function makeAnalysis(input: {
  pick: string;
  sportsbook: string;
  odds: number;
  confidence: number;
  impliedProbability: number;
  consensusProbability: number;
  edge: number;
  ev: number;
  playRating: string;
}): string {
  return `${input.pick} at ${input.sportsbook}. Price ${
    input.odds > 0 ? `+${input.odds}` : input.odds
  }. Model: ${input.confidence.toFixed(
    2
  )}% vs Market: ${(input.impliedProbability * 100).toFixed(
    2
  )}%. Edge: ${input.edge.toFixed(2)}%. EV: ${input.ev.toFixed(
    2
  )}%. Rating: ${input.playRating}.`;
}

function getBestBookPriceForTeam(event: OddsEvent, team: string) {
  const books = (event.bookmakers || []).filter((b) =>
    MAJOR_BOOKS.includes(b.key)
  );

  const prices: any[] = [];

  for (const book of books) {
    const h2h = book.markets?.find((m) => m.key === 'h2h');
    const outcome = h2h?.outcomes?.find((o) => o.name === team);
    if (!outcome) continue;

    prices.push({
      sportsbook: book.title,
      sportsbook_key: book.key,
      price: outcome.price,
    });
  }

  if (prices.length < 2) return null;

  const best = prices.reduce((a, b) => (b.price > a.price ? b : a));
  const consensus =
    prices.reduce((sum, p) => sum + p.price, 0) / prices.length;

  return { best, consensus };
}

function buildCandidatesFromEvent(event: OddsEvent): CandidatePick[] {
  if (!sameCalendarWindow(event.commence_time)) return [];

  const teams = [event.home_team, event.away_team];
  const results: CandidatePick[] = [];

  for (const team of teams) {
    const data = getBestBookPriceForTeam(event, team);
    if (!data) continue;

    const implied = americanToImpliedProb(data.best.price);
    const consensus = americanToImpliedProb(Math.round(data.consensus));

    let model = consensus;

    if (data.best.price > -200 && data.best.price < 200) model += 0.025;
    else if (data.best.price < 500) model += 0.015;
    else model += 0.005;

    if (data.best.price > 500) {
      model = Math.min(model, implied + 0.02);
    }

    model = Math.min(model, 0.75);

    const edge = (model - implied) * 100;
    const ev = calcEV(model, data.best.price);
    const rating = getPlayRating(ev, edge);
    const stake = getStakeUnits(rating);

    // 🔥 tightened filters
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
      confidence: model * 100,
      impliedProbability: implied,
      consensusProbability: consensus,
      edge,
      ev,
      sportsbook: data.best.sportsbook,
      sportsbook_key: data.best.sportsbook_key,
      analysis: makeAnalysis({
        pick: team,
        sportsbook: data.best.sportsbook,
        odds: data.best.price,
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

  for (const c of candidates) {
    const existing = map.get(c.eventId);
    if (!existing || c.ev > existing.ev) map.set(c.eventId, c);
  }

  return Array.from(map.values());
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && auth !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let all: CandidatePick[] = [];

  for (const sport of ALLOWED_SPORTS) {
    const events = await fetchOdds(sport);
    for (const e of events) {
      all.push(...buildCandidatesFromEvent(e));
    }
  }

  const final = dedupeBest(all)
    .sort((a, b) => b.ev - a.ev)
    .slice(0, 6); // 🔥 tighter board

  const supabase = getSupabase();

  await supabase.from('picks').delete().eq('mode', 'pregame');

  if (!final.length) {
    return NextResponse.json({ success: true, inserted: 0, picks: [] });
  }

  const { data, error } = await supabase
    .from('picks')
    .insert(final.map((p) => ({ ...p, result: 'pending' })))
    .select();

  if (error) throw error;

  return NextResponse.json({
    success: true,
    inserted: data.length,
    picks: data,
  });
}
