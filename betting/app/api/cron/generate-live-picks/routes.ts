import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type BookmakerMarketOutcome = {
  name: string;
  price: number;
};

type BookmakerMarket = {
  key: string;
  outcomes: BookmakerMarketOutcome[];
};

type Bookmaker = {
  key: string;
  title: string;
  markets: BookmakerMarket[];
};

type OddsEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
};

type Candidate = {
  eventId: string;
  sport: string;
  game: string;
  pick: string;
  team: string;
  odds: number;
  previousOdds: number | null;
  lineMovement: number | null;
  confidence: number;
  edge: number;
  ev: number;
  analysis: string;
  sportsbook: string;
  marketType: string;
  commenceTime: string;
  isLive: boolean;
  stake: number;
  playRating: string;
};

const ALLOWED_BOOKS = new Set([
  'draftkings',
  'fanduel',
  'betmgm',
  'caesars',
  'espnbet',
  'betrivers',
  'fanatics',
  'hardrockbet',
  'pointsbetus',
  'betparx',
]);

const SUPPORTED_SPORTS = [
  'baseball_mlb',
  'basketball_nba',
  'icehockey_nhl',
  'americanfootball_nfl',
  'basketball_ncaab',
];

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

function getCronSecretFromReq(req: NextRequest) {
  return (
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace('Bearer ', '') ||
    ''
  );
}

function americanToImpliedProb(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function probToAmerican(prob: number): number {
  if (prob <= 0 || prob >= 1) return 0;
  if (prob >= 0.5) {
    return Math.round(-(prob / (1 - prob)) * 100);
  }
  return Math.round(((1 - prob) / prob) * 100);
}

function calcEv(modelProb: number, odds: number): number {
  const decimalOdds = odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
  return (modelProb * decimalOdds - 1) * 100;
}

function getKellyFraction(modelProb: number, odds: number): number {
  const b = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  const q = 1 - modelProb;
  const rawKelly = (b * modelProb - q) / b;
  return Math.max(0, rawKelly);
}

function getStakeUnits(edge: number, ev: number): number {
  if (edge >= 7 && ev >= 9) return 2;
  if (edge >= 5 && ev >= 6) return 1.5;
  return 1;
}

function getPlayRating(edge: number, ev: number, lineMovement: number | null): string {
  const steam = lineMovement !== null && lineMovement >= 10;

  if (edge >= 8 && ev >= 10 && steam) return 'MAX PLAY';
  if (edge >= 7 && ev >= 8) return 'A PLAY';
  if (edge >= 5 && ev >= 5) return 'B PLAY';
  return 'LEAN';
}

function buildAnalysis(params: {
  pick: string;
  sportsbook: string;
  odds: number;
  previousOdds: number | null;
  modelProb: number;
  marketProb: number;
  edge: number;
  ev: number;
  lineMovement: number | null;
  playRating: string;
}) {
  const {
    pick,
    sportsbook,
    odds,
    previousOdds,
    modelProb,
    marketProb,
    edge,
    ev,
    lineMovement,
    playRating,
  } = params;

  const moveText =
    previousOdds !== null && lineMovement !== null
      ? ` Previous scan: ${previousOdds > 0 ? `+${previousOdds}` : previousOdds}. Line movement: ${lineMovement > 0 ? '+' : ''}${lineMovement}.`
      : '';

  return `${pick} is showing live value at ${sportsbook}. Current price: ${
    odds > 0 ? `+${odds}` : odds
  }. Model win probability: ${(modelProb * 100).toFixed(
    2
  )}%. Market implied probability: ${(marketProb * 100).toFixed(
    2
  )}%. Estimated edge: ${edge.toFixed(2)}%. Estimated EV: ${ev.toFixed(
    2
  )}%.${moveText} Play rating: ${playRating}.`;
}

async function fetchOddsForSport(sport: string): Promise<OddsEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ODDS_API_KEY');
  }

  const params = new URLSearchParams({
    apiKey,
    regions: 'us',
    markets: 'h2h',
    oddsFormat: 'american',
    dateFormat: 'iso',
  });

  const res = await fetch(
    `https://api.the-odds-api.com/v4/sports/${sport}/odds?${params.toString()}`,
    { cache: 'no-store' }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API failed for ${sport}: ${text}`);
  }

  return res.json();
}

async function fetchAllOdds(): Promise<OddsEvent[]> {
  const settled = await Promise.allSettled(
    SUPPORTED_SPORTS.map((sport) => fetchOddsForSport(sport))
  );

  const all: OddsEvent[] = [];

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      all.push(...result.value);
    }
  }

  return all;
}

function normalizeBooks(event: OddsEvent): OddsEvent {
  return {
    ...event,
    bookmakers: (event.bookmakers || []).filter((b) => ALLOWED_BOOKS.has(b.key)),
  };
}

function eventStartsSoon(commenceTime: string, minMinutes = 5, maxMinutes = 180): boolean {
  const now = Date.now();
  const start = new Date(commenceTime).getTime();
  const diffMinutes = (start - now) / 1000 / 60;
  return diffMinutes >= minMinutes && diffMinutes <= maxMinutes;
}

async function getRecentPickMap(supabase: ReturnType<typeof getSupabase>) {
  const sinceIso = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('picks')
    .select('game,pick,odds,created_at,is_live')
    .gte('created_at', sinceIso);

  if (error) {
    throw new Error(`Failed to read recent picks: ${error.message}`);
  }

  const map = new Map<string, { odds: number; created_at: string; is_live: boolean }>();

  for (const row of data || []) {
    const key = `${row.game}__${row.pick}`;
    const existing = map.get(key);
    if (!existing || new Date(row.created_at).getTime() > new Date(existing.created_at).getTime()) {
      map.set(key, {
        odds: Number(row.odds),
        created_at: row.created_at,
        is_live: Boolean(row.is_live),
      });
    }
  }

  return map;
}

function makeCandidate(event: OddsEvent, recentPickMap: Map<string, { odds: number }>): Candidate[] {
  const candidates: Candidate[] = [];

  for (const bookmaker of event.bookmakers || []) {
    const h2h = bookmaker.markets?.find((m) => m.key === 'h2h');
    if (!h2h || !h2h.outcomes || h2h.outcomes.length < 2) continue;

    for (const outcome of h2h.outcomes) {
      const odds = Number(outcome.price);
      if (!Number.isFinite(odds)) continue;

      const implied = americanToImpliedProb(odds);

      // Small built-in model edge for live scanner.
      // You can replace this later with your own sharper model.
      let modelProb = implied + 0.035;

      // Extra bump if the favorite is modest, smaller bump for big dogs.
      if (odds >= -140 && odds <= 130) modelProb += 0.01;
      if (Math.abs(odds) >= 180) modelProb -= 0.005;

      modelProb = Math.min(0.80, Math.max(0.20, modelProb));

      const edge = (modelProb - implied) * 100;
      const ev = calcEv(modelProb, odds);

      const game = `${event.away_team} at ${event.home_team}`;
      const pick = `${outcome.name} ML`;

      const recentKey = `${game}__${pick}`;
      const previous = recentPickMap.get(recentKey);
      const previousOdds = previous ? Number(previous.odds) : null;
      const lineMovement =
        previousOdds !== null ? odds - previousOdds : null;

      const strongerBecauseSteam =
        lineMovement !== null && previousOdds !== null && odds > previousOdds;

      const minEdge = strongerBecauseSteam ? 4.5 : 5.5;
      const minEv = strongerBecauseSteam ? 4.5 : 6.0;

      if (edge < minEdge || ev < minEv) continue;

      const stake = getStakeUnits(edge, ev);
      const playRating = getPlayRating(edge, ev, lineMovement);

      const analysis = buildAnalysis({
        pick,
        sportsbook: bookmaker.title,
        odds,
        previousOdds,
        modelProb,
        marketProb: implied,
        edge,
        ev,
        lineMovement,
        playRating,
      });

      candidates.push({
        eventId: event.id,
        sport: event.sport_title,
        game,
        pick,
        team: outcome.name,
        odds,
        previousOdds,
        lineMovement,
        confidence: Math.round(modelProb * 100),
        edge,
        ev,
        analysis,
        sportsbook: bookmaker.title,
        marketType: 'moneyline',
        commenceTime: event.commence_time,
        isLive: true,
        stake,
        playRating,
      });
    }
  }

  candidates.sort((a, b) => {
    if (b.ev !== a.ev) return b.ev - a.ev;
    return b.edge - a.edge;
  });

  return candidates;
}

async function insertCandidates(
  supabase: ReturnType<typeof getSupabase>,
  candidates: Candidate[]
) {
  if (!candidates.length) {
    return { inserted: 0, rows: [] as Candidate[] };
  }

  const rows = candidates.map((c) => ({
    sport: c.sport,
    game: c.game,
    pick: c.pick,
    odds: c.odds,
    confidence: String(c.confidence),
    stake: c.stake,
    result: 'pending',
    analysis: c.analysis,
    sportsbook: c.sportsbook,
    status: 'active',
    play_rating: c.playRating,
    is_live: c.isLive,
    market_type: c.marketType,
    commence_time: c.commenceTime,
    line_movement: c.lineMovement,
    previous_odds: c.previousOdds,
    odds_last_seen_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('picks')
    .insert(rows)
    .select();

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }

  return { inserted: data?.length || 0, rows: candidates };
}

export async function GET(req: NextRequest) {
  try {
    const expectedSecret = process.env.CRON_SECRET;

    if (expectedSecret) {
      const incoming = getCronSecretFromReq(req);
      if (incoming !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const supabase = getSupabase();
    const recentPickMap = await getRecentPickMap(supabase);

    const allEvents = (await fetchAllOdds())
      .map(normalizeBooks)
      .filter((event) => event.bookmakers && event.bookmakers.length > 0)
      .filter((event) => eventStartsSoon(event.commence_time, 5, 180));

    let candidates: Candidate[] = [];

    for (const event of allEvents) {
      candidates.push(...makeCandidate(event, recentPickMap));
    }

    // De-dupe by game + pick, keep best EV only
    const dedupedMap = new Map<string, Candidate>();
    for (const candidate of candidates) {
      const key = `${candidate.game}__${candidate.pick}`;
      const existing = dedupedMap.get(key);
      if (!existing || candidate.ev > existing.ev) {
        dedupedMap.set(key, candidate);
      }
    }

    candidates = Array.from(dedupedMap.values());

    // Only keep improved prices vs recent scan if already seen
    candidates = candidates.filter((c) => {
      const previousKey = `${c.game}__${c.pick}`;
      const previous = recentPickMap.get(previousKey);
      if (!previous) return true;
      return c.odds !== previous.odds;
    });

    // Keep live board tight
    candidates.sort((a, b) => {
      if (b.ev !== a.ev) return b.ev - a.ev;
      return b.edge - a.edge;
    });

    const finalSelected = candidates.slice(0, 8);

    const result = await insertCandidates(supabase, finalSelected);

    return NextResponse.json({
      success: true,
      inserted: result.inserted,
      picks: finalSelected,
      debug: {
        eventsChecked: allEvents.length,
        candidatesFound: candidates.length,
        finalSelected: finalSelected.length,
        scanWindowMinutes: 180,
        mode: 'live',
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
