import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type OddsApiOutcome = {
  name: string;
  price: number;
};

type OddsApiMarket = {
  key: string;
  outcomes: OddsApiOutcome[];
};

type OddsApiBookmaker = {
  key: string;
  title: string;
  markets: OddsApiMarket[];
};

type OddsApiEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsApiBookmaker[];
};

type SideData = {
  team: string;
  prices: number[];
  bestPrice: number;
  bestBook: string;
};

type CandidatePick = {
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: string;
  analysis: string;
  sportsbook: string;
  edge: number;
  ev: number;
  stake: number;
  play_rating: string;
  pick_type: 'pregame';
};

const SPORTS_TO_SCAN = [
  'baseball_mlb',
  'basketball_nba',
  'icehockey_nhl',
];

const ALLOWED_BOOKS = new Set([
  'draftkings',
  'fanduel',
  'betmgm',
  'caesars',
  'espnbet',
  'betrivers',
]);

const REGULAR_SEASON_MARKETS = 'h2h';

const MIN_BOOKS = 3;
const MIN_EDGE = 2.5;
const MIN_EV = 2.0;
const MAX_PICKS_PER_RUN = 10;

function isAuthorized(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;

  const authHeader = req.headers.get('authorization');
  const cronHeader = req.headers.get('x-cron-secret');

  return authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret;
}

function americanToImpliedProb(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function impliedProbToAmerican(prob: number): number {
  if (prob <= 0 || prob >= 1) {
    throw new Error(`Invalid probability for odds conversion: ${prob}`);
  }

  if (prob >= 0.5) {
    return Math.round((-100 * prob) / (1 - prob));
  }

  return Math.round((100 * (1 - prob)) / prob);
}

function decimalFromAmerican(odds: number): number {
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

function expectedValuePercent(winProb: number, americanOdds: number): number {
  const decimalOdds = decimalFromAmerican(americanOdds);
  const ev = winProb * (decimalOdds - 1) - (1 - winProb);
  return ev * 100;
}

function getPlayRating(edge: number, ev: number): string {
  if (edge >= 6 && ev >= 8) return 'MAX PLAY';
  if (edge >= 5 && ev >= 6) return 'A PLAY';
  if (edge >= 3.5 && ev >= 4) return 'B PLAY';
  return 'C PLAY';
}

function getStakeUnits(edge: number, ev: number): number {
  if (edge >= 6 && ev >= 8) return 2;
  if (edge >= 5 && ev >= 6) return 1.5;
  return 1;
}

function getConfidence(winProb: number): string {
  return Math.round(winProb * 100).toString();
}

function mean(nums: number[]): number {
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function normalizeSportTitle(sportTitle: string): string {
  if (sportTitle.toLowerCase().includes('major league baseball')) return 'MLB';
  if (sportTitle.toLowerCase().includes('national basketball association')) return 'NBA';
  if (sportTitle.toLowerCase().includes('national hockey league')) return 'NHL';
  return sportTitle;
}

function isTodayOrTomorrow(commenceTime: string): boolean {
  const eventDate = new Date(commenceTime);
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const dayAfterTomorrowStart = new Date(todayStart);
  dayAfterTomorrowStart.setDate(dayAfterTomorrowStart.getDate() + 2);

  return eventDate >= todayStart && eventDate < dayAfterTomorrowStart;
}

function buildGameLabel(event: OddsApiEvent): string {
  return `${event.away_team} at ${event.home_team}`;
}

async function fetchOddsForSport(sportKey: string): Promise<OddsApiEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ODDS_API_KEY');
  }

  const regions = 'us';
  const bookmakers = Array.from(ALLOWED_BOOKS).join(',');
  const url =
    `https://api.the-odds-api.com/v4/sports/${sportKey}/odds` +
    `?apiKey=${apiKey}` +
    `&regions=${regions}` +
    `&markets=${REGULAR_SEASON_MARKETS}` +
    `&oddsFormat=american` +
    `&bookmakers=${bookmakers}`;

  const res = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API failed: ${text}`);
  }

  return (await res.json()) as OddsApiEvent[];
}

function extractSides(event: OddsApiEvent): Record<string, SideData> {
  const sides: Record<string, SideData> = {};

  for (const bookmaker of event.bookmakers ?? []) {
    if (!ALLOWED_BOOKS.has(bookmaker.key)) continue;

    const h2h = bookmaker.markets.find((m) => m.key === 'h2h');
    if (!h2h) continue;

    for (const outcome of h2h.outcomes ?? []) {
      if (!Number.isFinite(outcome.price)) continue;

      if (!sides[outcome.name]) {
        sides[outcome.name] = {
          team: outcome.name,
          prices: [],
          bestPrice: outcome.price,
          bestBook: bookmaker.title,
        };
      }

      sides[outcome.name].prices.push(outcome.price);

      if (outcome.price > sides[outcome.name].bestPrice) {
        sides[outcome.name].bestPrice = outcome.price;
        sides[outcome.name].bestBook = bookmaker.title;
      }
    }
  }

  return sides;
}

function buildCandidatesFromEvent(event: OddsApiEvent): CandidatePick[] {
  const sides = extractSides(event);
  const candidates: CandidatePick[] = [];

  for (const [team, data] of Object.entries(sides)) {
    if (data.prices.length < MIN_BOOKS) continue;

    const consensusImpliedProb = mean(
      data.prices.map((price) => americanToImpliedProb(price))
    );

    const fairOdds = impliedProbToAmerican(consensusImpliedProb);
    const bestPrice = data.bestPrice;
    const bestImpliedProb = americanToImpliedProb(bestPrice);

    const edge = (consensusImpliedProb - bestImpliedProb) * 100;
    const ev = expectedValuePercent(consensusImpliedProb, bestPrice);

    if (edge < MIN_EDGE || ev < MIN_EV) continue;

    const sport = normalizeSportTitle(event.sport_title);
    const game = buildGameLabel(event);
    const pick = `${team} ML`;
    const confidence = getConfidence(consensusImpliedProb);
    const playRating = getPlayRating(edge, ev);
    const stake = getStakeUnits(edge, ev);

    const analysis =
      `${pick} is showing +EV against market consensus. ` +
      `Best price found: ${bestPrice > 0 ? `+${bestPrice}` : bestPrice} at ${data.bestBook}. ` +
      `Books used: ${data.prices.length}. ` +
      `Model win probability: ${(consensusImpliedProb * 100).toFixed(2)}%. ` +
      `Market implied probability at best price: ${(bestImpliedProb * 100).toFixed(2)}%. ` +
      `Estimated edge: ${edge.toFixed(2)}%. ` +
      `Estimated EV: ${ev.toFixed(2)}%. ` +
      `Fair odds: ${fairOdds > 0 ? `+${fairOdds}` : fairOdds}. ` +
      `Play rating: ${playRating}.`;

    candidates.push({
      sport,
      game,
      pick,
      odds: bestPrice,
      confidence,
      analysis,
      sportsbook: data.bestBook,
      edge: Number(edge.toFixed(2)),
      ev: Number(ev.toFixed(2)),
      stake,
      play_rating: playRating,
      pick_type: 'pregame',
    });
  }

  return candidates;
}

function dedupeCandidates(candidates: CandidatePick[]): CandidatePick[] {
  const seen = new Set<string>();
  const deduped: CandidatePick[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.game}__${candidate.pick}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

async function clearRecentPregamePendingPicks() {
  const supabase = getSupabaseAdmin();

  const lookback = new Date();
  lookback.setDate(lookback.getDate() - 2);

  const { error } = await supabase
    .from('picks')
    .delete()
    .eq('pick_type', 'pregame')
    .eq('result', 'pending')
    .gte('created_at', lookback.toISOString());

  if (error) {
    throw new Error(`Failed clearing old pregame picks: ${error.message}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    let allEvents: OddsApiEvent[] = [];
    for (const sportKey of SPORTS_TO_SCAN) {
      const events = await fetchOddsForSport(sportKey);
      allEvents = allEvents.concat(events);
    }

    const filteredEvents = allEvents.filter(
      (event) =>
        isTodayOrTomorrow(event.commence_time) &&
        Array.isArray(event.bookmakers) &&
        event.bookmakers.length > 0
    );

    let candidates: CandidatePick[] = [];
    for (const event of filteredEvents) {
      candidates.push(...buildCandidatesFromEvent(event));
    }

    candidates = dedupeCandidates(candidates)
      .sort((a, b) => {
        if (b.ev !== a.ev) return b.ev - a.ev;
        return b.edge - a.edge;
      })
      .slice(0, MAX_PICKS_PER_RUN);

    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying EV picks found for today or tomorrow.',
        debug: {
          eventsChecked: filteredEvents.length,
          candidatesFound: 0,
          finalSelected: 0,
          minBooks: MIN_BOOKS,
          minEdge: MIN_EDGE,
          minEv: MIN_EV,
          maxPicksPerRun: MAX_PICKS_PER_RUN,
          mode: 'pregame',
        },
      });
    }

    await clearRecentPregamePendingPicks();

    const rowsToInsert = candidates.map((c) => ({
      sport: c.sport,
      game: c.game,
      pick: c.pick,
      odds: c.odds,
      confidence: c.confidence,
      analysis: c.analysis,
      sportsbook: c.sportsbook,
      edge: c.edge,
      ev: c.ev,
      stake: c.stake,
      play_rating: c.play_rating,
      result: 'pending',
      pick_type: 'pregame' as const,
      status: 'open',
    }));

    const { data, error } = await supabase
      .from('picks')
      .insert(rowsToInsert)
      .select();

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      inserted: data?.length ?? 0,
      picks: data ?? [],
      debug: {
        eventsChecked: filteredEvents.length,
        candidatesFound: candidates.length,
        finalSelected: data?.length ?? 0,
        minBooks: MIN_BOOKS,
        minEdge: MIN_EDGE,
        minEv: MIN_EV,
        maxPicksPerRun: MAX_PICKS_PER_RUN,
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
