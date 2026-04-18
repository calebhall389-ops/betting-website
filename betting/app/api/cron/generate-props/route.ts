import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type BookmakerMarketOutcome = {
  name: string;
  description?: string;
  price: number;
  point?: number;
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

type OddsEventListItem = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
};

type OddsEventWithOdds = OddsEventListItem & {
  bookmakers?: Bookmaker[];
};

type GroupedProp = {
  sport: string;
  game: string;
  event_date: string;
  player: string;
  market: string;
  line: number;
  overPrices: { price: number; book: string }[];
  underPrices: { price: number; book: string }[];
};

type PropCandidate = {
  sport: string;
  game: string;
  event_date: string;
  player: string;
  market: string;
  line: number;
  pick_type: 'over' | 'under';
  over_odds: number | null;
  under_odds: number | null;
  best_odds: number;
  best_book: string;
  ev: number;
  edge: number;
  confidence: number;
  implied_probability: number;
  books_compared: number;
  analysis: string;
  play_rating: 'A+' | 'A' | 'B' | 'C';
  top_play: boolean;
};

type FetchDebug = {
  sportsTried: string[];
  eventListCalls: number;
  eventListFailures: Array<{ sport: string; status: number; body: string }>;
  eventsFound: number;
  oddsCalls: number;
  oddsFailures: Array<{ sport: string; eventId: string; status: number; body: string }>;
  oddsResponsesWithBookmakers: number;
  oddsResponsesWithoutBookmakers: number;
};

const MAJOR_BOOKS = new Set([
  'draftkings',
  'fanduel',
  'betmgm',
  'caesars',
  'espnbet',
  'betrivers',
  'fanatics',
]);

const SPORTS = [
  'baseball_mlb',
  'basketball_nba',
  'icehockey_nhl',
  'americanfootball_nfl',
] as const;

const MARKET_GROUPS = [
  'player_points',
  'player_rebounds',
  'player_assists',
  'player_threes',
  'pitcher_strikeouts',
  'batter_strikeouts',
] as const;

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

function americanToImplied(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function impliedToAmerican(prob: number): number {
  if (prob <= 0 || prob >= 1) return 0;
  if (prob >= 0.5) return Math.round(-(prob / (1 - prob)) * 100);
  return Math.round(((1 - prob) / prob) * 100);
}

function average(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function payoutMultiplierFromAmerican(odds: number): number {
  return odds > 0 ? odds / 100 : 100 / Math.abs(odds);
}

function expectedValuePercent(prob: number, odds: number): number {
  const winProfit = payoutMultiplierFromAmerican(odds);
  return ((prob * winProfit) - (1 - prob)) * 100;
}

function getPlayRating(
  ev: number,
  edge: number,
  books: number
): 'A+' | 'A' | 'B' | 'C' {
  if (ev >= 5 && edge >= 2 && books >= 3) return 'A+';
  if (ev >= 3.5 && edge >= 1.5 && books >= 3) return 'A';
  if (ev >= 2 && edge >= 1) return 'B';
  return 'C';
}

function buildAnalysis(input: {
  player: string;
  pickType: 'over' | 'under';
  line: number;
  market: string;
  bestOdds: number;
  bestBook: string;
  booksCompared: number;
  modelProbability: number;
  impliedProbability: number;
  edge: number;
  ev: number;
  fairOdds: number;
}): string {
  const side = input.pickType.toUpperCase();
  const oddsText =
    input.bestOdds > 0 ? `+${input.bestOdds}` : `${input.bestOdds}`;
  const fairOddsText =
    input.fairOdds > 0 ? `+${input.fairOdds}` : `${input.fairOdds}`;

  return `${input.player} ${side} ${input.line} ${input.market} stands out as a value prop. Best price is ${oddsText} at ${input.bestBook}, compared across ${input.booksCompared} books. Model probability is ${input.modelProbability.toFixed(2)}% versus market implied ${input.impliedProbability.toFixed(2)}%, creating a ${input.edge.toFixed(2)}% edge and ${input.ev.toFixed(2)}% EV. Fair odds project closer to ${fairOddsText}.`;
}

function normalizeSportTitle(sportTitle: string): string {
  const title = sportTitle.toLowerCase();

  if (title.includes('baseball')) return 'MLB';
  if (title.includes('basketball')) return 'NBA';
  if (title.includes('football')) return 'NFL';
  if (title.includes('hockey')) return 'NHL';

  return sportTitle;
}

function normalizeMarketName(key: string): string {
  switch (key) {
    case 'pitcher_strikeouts':
    case 'batter_strikeouts':
      return 'Strikeouts';
    case 'player_points':
      return 'Points';
    case 'player_rebounds':
      return 'Rebounds';
    case 'player_assists':
      return 'Assists';
    case 'player_threes':
      return 'Three-Pointers Made';
    default:
      return key.replace(/_/g, ' ');
  }
}

function getOutcomeSide(name: string): 'over' | 'under' | null {
  const normalized = name.trim().toLowerCase();
  if (normalized === 'over') return 'over';
  if (normalized === 'under') return 'under';
  return null;
}

function getOutcomePlayer(outcome: BookmakerMarketOutcome): string | null {
  const player = outcome.description?.trim();
  return player ? player : null;
}

function isInWindow(commenceTime: string): boolean {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  const gameTime = new Date(commenceTime);
  return gameTime >= start && gameTime < end;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

async function fetchOddsApiProps(): Promise<{
  eventsWithOdds: OddsEventWithOdds[];
  debug: FetchDebug;
}> {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    throw new Error('Missing ODDS_API_KEY');
  }

  const debug: FetchDebug = {
    sportsTried: [...SPORTS],
    eventListCalls: 0,
    eventListFailures: [],
    eventsFound: 0,
    oddsCalls: 0,
    oddsFailures: [],
    oddsResponsesWithBookmakers: 0,
    oddsResponsesWithoutBookmakers: 0,
  };

  const eventsWithOdds: OddsEventWithOdds[] = [];

  for (const sport of SPORTS) {
    debug.eventListCalls += 1;

    const eventsUrl = `https://api.the-odds-api.com/v4/sports/${sport}/events/?apiKey=${apiKey}`;
    const eventsRes = await fetch(eventsUrl, { cache: 'no-store' });

    if (!eventsRes.ok) {
      debug.eventListFailures.push({
        sport,
        status: eventsRes.status,
        body: (await safeReadText(eventsRes)).slice(0, 400),
      });
      continue;
    }

    const events = (await eventsRes.json()) as OddsEventListItem[];
    debug.eventsFound += events.length;

    for (const event of events) {
      if (!isInWindow(event.commence_time)) continue;

      debug.oddsCalls += 1;

      const propsUrl =
        `https://api.the-odds-api.com/v4/sports/${sport}/events/${event.id}/odds` +
        `?apiKey=${apiKey}` +
        `&regions=us` +
        `&markets=${MARKET_GROUPS.join(',')}` +
        `&oddsFormat=american`;

      const propsRes = await fetch(propsUrl, { cache: 'no-store' });

      if (!propsRes.ok) {
        debug.oddsFailures.push({
          sport,
          eventId: event.id,
          status: propsRes.status,
          body: (await safeReadText(propsRes)).slice(0, 400),
        });
        continue;
      }

      const eventWithOdds = (await propsRes.json()) as OddsEventWithOdds;

      if (
        eventWithOdds &&
        Array.isArray(eventWithOdds.bookmakers) &&
        eventWithOdds.bookmakers.length > 0
      ) {
        debug.oddsResponsesWithBookmakers += 1;
        eventsWithOdds.push(eventWithOdds);
      } else {
        debug.oddsResponsesWithoutBookmakers += 1;
      }
    }
  }

  return { eventsWithOdds, debug };
}

function buildCandidatesFromEvents(events: OddsEventWithOdds[]): PropCandidate[] {
  const candidates: PropCandidate[] = [];

  for (const event of events) {
    if (!isInWindow(event.commence_time)) continue;

    const game = `${event.away_team} at ${event.home_team}`;
    const sport = normalizeSportTitle(event.sport_title);
    const grouped = new Map<string, GroupedProp>();

    for (const bookmaker of event.bookmakers || []) {
      if (!MAJOR_BOOKS.has(bookmaker.key)) continue;

      for (const market of bookmaker.markets || []) {
        const marketName = normalizeMarketName(market.key);

        for (const outcome of market.outcomes || []) {
          const side = getOutcomeSide(outcome.name);
          const player = getOutcomePlayer(outcome);

          if (!side || !player) continue;
          if (typeof outcome.point !== 'number') continue;
          if (typeof outcome.price !== 'number') continue;

          const key = `${player}__${market.key}__${String(outcome.point)}`;

          if (!grouped.has(key)) {
            grouped.set(key, {
              sport,
              game,
              event_date: event.commence_time,
              player,
              market: marketName,
              line: outcome.point,
              overPrices: [],
              underPrices: [],
            });
          }

          const item = grouped.get(key);
          if (!item) continue;

          if (side === 'over') {
            item.overPrices.push({
              price: outcome.price,
              book: bookmaker.title,
            });
          } else {
            item.underPrices.push({
              price: outcome.price,
              book: bookmaker.title,
            });
          }
        }
      }
    }

    for (const item of Array.from(grouped.values())) {
      if (item.overPrices.length < 2 || item.underPrices.length < 2) continue;

      const overImplieds = item.overPrices.map((p) => americanToImplied(p.price));
      const underImplieds = item.underPrices.map((p) => americanToImplied(p.price));

      const marketOverProbRaw = average(overImplieds);
      const marketUnderProbRaw = average(underImplieds);
      const total = marketOverProbRaw + marketUnderProbRaw;

      if (total <= 0) continue;

      const marketOverProb = marketOverProbRaw / total;
      const marketUnderProb = marketUnderProbRaw / total;

      const bestOver = item.overPrices.reduce((best, curr) =>
        curr.price > best.price ? curr : best
      );

      const bestUnder = item.underPrices.reduce((best, curr) =>
        curr.price > best.price ? curr : best
      );

      const bestOverImplied = americanToImplied(bestOver.price);
      const bestUnderImplied = americanToImplied(bestUnder.price);

      const overEdge = (marketOverProb - bestOverImplied) * 100;
      const underEdge = (marketUnderProb - bestUnderImplied) * 100;

      const overEv = expectedValuePercent(marketOverProb, bestOver.price);
      const underEv = expectedValuePercent(marketUnderProb, bestUnder.price);

      const booksCompared = Math.min(
        item.overPrices.length,
        item.underPrices.length
      );

      const pickType: 'over' | 'under' = underEv > overEv ? 'under' : 'over';

      const bestOdds = pickType === 'under' ? bestUnder.price : bestOver.price;
      const bestBook = pickType === 'under' ? bestUnder.book : bestOver.book;
      const modelProbability =
        pickType === 'under' ? marketUnderProb : marketOverProb;
      const impliedProbability = americanToImplied(bestOdds);
      const edge = pickType === 'under' ? underEdge : overEdge;
      const ev = pickType === 'under' ? underEv : overEv;

      if (booksCompared < 2) continue;
      if (edge < 1) continue;
      if (ev < 1.5) continue;

      const confidence = Math.max(
        1,
        Math.min(99, Math.round(50 + edge * 8 + ev * 2))
      );

      const fairOdds = impliedToAmerican(modelProbability);
      const playRating = getPlayRating(ev, edge, booksCompared);

      candidates.push({
        sport: item.sport,
        game: item.game,
        event_date: item.event_date,
        player: item.player,
        market: item.market,
        line: item.line,
        pick_type: pickType,
        over_odds: bestOver.price,
        under_odds: bestUnder.price,
        best_odds: bestOdds,
        best_book: bestBook,
        ev,
        edge,
        confidence,
        implied_probability: impliedProbability * 100,
        books_compared: booksCompared,
        analysis: buildAnalysis({
          player: item.player,
          pickType,
          line: item.line,
          market: item.market,
          bestOdds,
          bestBook,
          booksCompared,
          modelProbability: modelProbability * 100,
          impliedProbability: impliedProbability * 100,
          edge,
          ev,
          fairOdds,
        }),
        play_rating: playRating,
        top_play: false,
      });
    }
  }

  return candidates;
}

export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('x-cron-secret');
    const userAgent = req.headers.get('user-agent') || '';
    const isVercelCron = userAgent.toLowerCase().includes('vercel');

    if (cronSecret && authHeader !== cronSecret && !isVercelCron) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    const { eventsWithOdds, debug: fetchDebug } = await fetchOddsApiProps();

    const ratingOrder: Record<'A+' | 'A' | 'B' | 'C', number> = {
      'A+': 4,
      A: 3,
      B: 2,
      C: 1,
    };

    const candidates = buildCandidatesFromEvents(eventsWithOdds)
      .sort((a, b) => {
        const ratingDiff = ratingOrder[b.play_rating] - ratingOrder[a.play_rating];
        if (ratingDiff !== 0) return ratingDiff;
        return b.ev - a.ev;
      })
      .slice(0, 18);

    const withTopPlays = candidates.map((item, index) => ({
      ...item,
      top_play: index < 3 || item.play_rating === 'A+',
    }));

    if (withTopPlays.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying props found for today or tomorrow.',
        debug: {
          eventsChecked: eventsWithOdds.length,
          candidatesFound: candidates.length,
          finalSelected: 0,
          minBooks: 2,
          minEdge: 1,
          minEv: 1.5,
          maxPropsPerRun: 18,
          fetchDebug,
        },
      });
    }

    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).toISOString();
    const end = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 2
    ).toISOString();

    await supabase
      .from('props')
      .delete()
      .gte('event_date', start)
      .lt('event_date', end)
      .eq('result', 'pending');

    const rowsToInsert = withTopPlays.map((p) => ({
      sport: p.sport,
      game: p.game,
      player: p.player,
      market: p.market,
      line: p.line,
      pick_type: p.pick_type,
      over_odds: p.over_odds,
      under_odds: p.under_odds,
      best_odds: p.best_odds,
      best_book: p.best_book,
      ev: Number(p.ev.toFixed(2)),
      edge: Number(p.edge.toFixed(2)),
      confidence: p.confidence,
      implied_probability: Number(p.implied_probability.toFixed(2)),
      books_compared: p.books_compared,
      analysis: p.analysis,
      play_rating: p.play_rating,
      top_play: p.top_play,
      stake: 1,
      result: 'pending',
      profit: null,
      event_date: p.event_date,
    }));

    const { data, error } = await supabase
      .from('props')
      .insert(rowsToInsert)
      .select();

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      inserted: data?.length || 0,
      props: data || [],
      debug: {
        eventsChecked: eventsWithOdds.length,
        candidatesFound: candidates.length,
        finalSelected: withTopPlays.length,
        minBooks: 2,
        minEdge: 1,
        minEv: 1.5,
        maxPropsPerRun: 18,
        fetchDebug,
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
