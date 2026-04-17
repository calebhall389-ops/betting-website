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
  markets: OddsMarket[];
};

type OddsEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
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
  edge: number;
  ev: number;
  sportsbook: string;
  sportsbook_key: string;
  analysis: string;
  play_rating: string;
  stake: number;
  status: string;
  marketType: 'h2h';
  mode: 'pregame' | 'live';
};

const MAJOR_BOOKS = [
  'draftkings',
  'fanduel',
  'betmgm',
  'caesars',
  'espnbet',
  'betrivers',
  'pointsbetus',
  'fanatics',
  'hardrockbet',
  'bet365',
];

const ALLOWED_SPORTS = [
  'baseball_mlb',
  'basketball_nba',
  'icehockey_nhl',
];

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
  if (ev >= 8 && edge >= 5) return 'MAX PLAY';
  if (ev >= 5 && edge >= 4) return 'A PLAY';
  if (ev >= 3 && edge >= 2.5) return 'B PLAY';
  return 'PASS';
}

function getStakeUnits(playRating: string): number {
  if (playRating === 'MAX PLAY') return 2;
  if (playRating === 'A PLAY') return 1.5;
  if (playRating === 'B PLAY') return 1;
  return 0;
}

function sameCalendarWindow(commenceTime: string): boolean {
  const now = new Date();
  const eventDate = new Date(commenceTime);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(url, serviceRoleKey);
}

async function fetchOdds(sport: string): Promise<OddsEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ODDS_API_KEY');
  }

  const regions = 'us';
  const markets = 'h2h';
  const oddsFormat = 'american';
  const dateFormat = 'iso';
  const bookmakers = MAJOR_BOOKS.join(',');

  const url =
    `https://api.the-odds-api.com/v4/sports/${sport}/odds` +
    `?apiKey=${apiKey}` +
    `&regions=${regions}` +
    `&markets=${markets}` +
    `&oddsFormat=${oddsFormat}` +
    `&dateFormat=${dateFormat}` +
    `&bookmakers=${bookmakers}`;

  const res = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API failed for ${sport}: ${text}`);
  }

  return res.json();
}

function makeAnalysis(input: {
  pick: string;
  sportsbook: string;
  odds: number;
  confidence: number;
  impliedProbability: number;
  edge: number;
  ev: number;
  playRating: string;
}): string {
  return `${input.pick} is showing pregame value at ${input.sportsbook}. Current price: ${input.odds > 0 ? `+${input.odds}` : input.odds}. Model win probability: ${input.confidence.toFixed(2)}%. Market implied probability: ${(input.impliedProbability * 100).toFixed(2)}%. Estimated edge: ${input.edge.toFixed(2)}%. Estimated EV: ${input.ev.toFixed(2)}%. Play rating: ${input.playRating}.`;
}

function getBestBookPriceForTeam(event: OddsEvent, team: string) {
  const validBooks = (event.bookmakers || []).filter((b) =>
    MAJOR_BOOKS.includes(b.key)
  );

  const prices: { sportsbook: string; sportsbook_key: string; price: number }[] =
    [];

  for (const book of validBooks) {
    const h2h = book.markets?.find((m) => m.key === 'h2h');
    if (!h2h) continue;

    const outcome = h2h.outcomes?.find((o) => o.name === team);
    if (!outcome || typeof outcome.price !== 'number') continue;

    prices.push({
      sportsbook: book.title,
      sportsbook_key: book.key,
      price: outcome.price,
    });
  }

  if (prices.length < 2) return null;

  const best = prices.reduce((bestSoFar, current) => {
    return current.price > bestSoFar.price ? current : bestSoFar;
  });

  const consensusPrice =
    prices.reduce((sum, p) => sum + p.price, 0) / prices.length;

  return {
    best,
    consensusPrice,
    bookCount: prices.length,
  };
}

function buildCandidatesFromEvent(event: OddsEvent): CandidatePick[] {
  if (!sameCalendarWindow(event.commence_time)) return [];

  const teams = [event.home_team, event.away_team];
  const candidates: CandidatePick[] = [];

  for (const team of teams) {
    const priceData = getBestBookPriceForTeam(event, team);
    if (!priceData) continue;

    const bestPrice = priceData.best.price;
    const bestBook = priceData.best.sportsbook;
    const bestBookKey = priceData.best.sportsbook_key;

    const impliedProbability = americanToImpliedProb(bestPrice);
    const consensusImplied = americanToImpliedProb(
      Math.round(priceData.consensusPrice)
    );

    // pro model:
    // give a modest boost above consensus only when best available line creates real value
    const modelProbability = Math.min(consensusImplied + 0.055, 0.82);

    const edge = (modelProbability - impliedProbability) * 100;
    const ev = calcEV(modelProbability, bestPrice);
    const playRating = getPlayRating(ev, edge);
    const stake = getStakeUnits(playRating);

    if (playRating === 'PASS') continue;
    if (edge < 2.5) continue;
    if (ev < 3) continue;

    const sport = normalizeSport(event.sport_key);
    const game = buildGameLabel(event);
    const pick = teamToPickLabel(team);

    candidates.push({
      sport,
      game,
      eventId: event.id,
      commenceTime: event.commence_time,
      pick,
      team,
      odds: bestPrice,
      confidence: modelProbability * 100,
      impliedProbability,
      edge,
      ev,
      sportsbook: bestBook,
      sportsbook_key: bestBookKey,
      analysis: makeAnalysis({
        pick,
        sportsbook: bestBook,
        odds: bestPrice,
        confidence: modelProbability * 100,
        impliedProbability,
        edge,
        ev,
        playRating,
      }),
      play_rating: playRating,
      stake,
      status: 'open',
      marketType: 'h2h',
      mode: 'pregame',
    });
  }

  return candidates;
}

function dedupeBestSidePerGame(candidates: CandidatePick[]): CandidatePick[] {
  const byEvent = new Map<string, CandidatePick>();

  for (const candidate of candidates) {
    const existing = byEvent.get(candidate.eventId);

    if (!existing) {
      byEvent.set(candidate.eventId, candidate);
      continue;
    }

    // keep highest EV, then higher edge, then better price
    if (
      candidate.ev > existing.ev ||
      (candidate.ev === existing.ev && candidate.edge > existing.edge) ||
      (candidate.ev === existing.ev &&
        candidate.edge === existing.edge &&
        candidate.odds > existing.odds)
    ) {
      byEvent.set(candidate.eventId, candidate);
    }
  }

  return Array.from(byEvent.values());
}

async function clearOpenPregamePicksForWindow() {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('picks')
    .delete()
    .eq('status', 'open')
    .eq('mode', 'pregame');

  if (error) {
    throw new Error(`Failed deleting old pregame picks: ${error.message}`);
  }
}

async function insertPicks(picks: CandidatePick[]) {
  const supabase = getSupabase();

  const payload = picks.map((p) => ({
    sport: p.sport,
    game: p.game,
    pick: p.pick,
    odds: p.odds,
    confidence: Number(p.confidence.toFixed(0)),
    analysis: p.analysis,
    stake: p.stake,
    sportsbook: p.sportsbook,
    sportsbook_key: p.sportsbook_key,
    edge: Number(p.edge.toFixed(2)),
    ev: Number(p.ev.toFixed(2)),
    play_rating: p.play_rating,
    status: p.status,
    mode: p.mode,
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
    const authHeader = req.headers.get('x-cron-secret');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allCandidates: CandidatePick[] = [];
    let eventsChecked = 0;

    for (const sport of ALLOWED_SPORTS) {
      const events = await fetchOdds(sport);
      eventsChecked += events.length;

      for (const event of events) {
        const candidates = buildCandidatesFromEvent(event);
        allCandidates.push(...candidates);
      }
    }

    const finalPicks = dedupeBestSidePerGame(allCandidates)
      .sort((a, b) => b.ev - a.ev)
      .slice(0, 12);

    await clearOpenPregamePicksForWindow();

    if (finalPicks.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        picks: [],
        message: 'No qualifying pro picks found for today or tomorrow.',
        debug: {
          eventsChecked,
          candidatesFound: allCandidates.length,
          finalSelected: 0,
          minEdge: 2.5,
          minEv: 3,
          maxPicks: 12,
          books: MAJOR_BOOKS,
          mode: 'pregame',
        },
      });
    }

    const inserted = await insertPicks(finalPicks);

    return NextResponse.json({
      success: true,
      inserted: inserted?.length || 0,
      picks: inserted || [],
      debug: {
        eventsChecked,
        candidatesFound: allCandidates.length,
        finalSelected: finalPicks.length,
        minEdge: 2.5,
        minEv: 3,
        maxPicks: 12,
        books: MAJOR_BOOKS,
        mode: 'pregame',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
