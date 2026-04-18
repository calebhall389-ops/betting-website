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

type OddsBookmaker = {
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
  bookmakers?: OddsBookmaker[];
};

type SidePriceBucket = {
  prices: number[];
  byBook: {
    bookmaker: string;
    bookmakerKey: string;
    price: number;
  }[];
};

type LiveCandidate = {
  sport: string;
  game: string;
  pick: string;
  team: string;
  odds: number;
  sportsbook: string;
  sportsbook_key: string;
  confidence: number;
  edge: number;
  ev: number;
  fair_odds: number;
  implied_prob: number;
  model_prob: number;
  analysis: string;
  stake: number;
  status: string;
  market_type: string;
  commence_time: string;
};

const LIVE_CONFIG = {
  minBooks: 3,
  minEdge: 1.5,
  minEv: 1.0,
  maxOdds: 250,
  minOdds: -220,
  scanWindowMinutes: 180,
  maxPicks: 8,
  staleMinutesBuffer: 5,
};

const MAJOR_BOOKS = new Set([
  'draftkings',
  'fanduel',
  'betmgm',
  'caesars',
  'espnbet',
  'betrivers',
]);

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

function getCronSecret() {
  return process.env.CRON_SECRET || process.env.CRON_SECRET_KEY || '';
}

function americanToImpliedProbability(odds: number): number {
  if (odds > 0) {
    return 100 / (odds + 100);
  }

  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function probabilityToAmerican(probability: number): number {
  if (probability <= 0) return 99999;
  if (probability >= 1) return -99999;

  if (probability >= 0.5) {
    return Math.round((-100 * probability) / (1 - probability));
  }

  return Math.round((100 * (1 - probability)) / probability);
}

function expectedValuePercent(winProbability: number, americanOdds: number): number {
  const decimalOdds =
    americanOdds > 0
      ? 1 + americanOdds / 100
      : 1 + 100 / Math.abs(americanOdds);

  return (winProbability * decimalOdds - 1) * 100;
}

function median(numbers: number[]): number {
  if (!numbers.length) return 0;

  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

function normalizeConfidence(edge: number, ev: number): number {
  const raw = 50 + edge * 6 + ev * 1.5;
  return Math.max(52, Math.min(79, Math.round(raw)));
}

function isAllowedLiveOdds(odds: number): boolean {
  return odds >= LIVE_CONFIG.minOdds && odds <= LIVE_CONFIG.maxOdds;
}

function getStakeUnits(edge: number, ev: number): number {
  if (edge >= 4 && ev >= 5) return 1.5;
  if (edge >= 2.5 && ev >= 2.5) return 1.0;
  return 0.5;
}

function minutesSinceStart(commenceTime: string): number {
  const now = Date.now();
  const start = new Date(commenceTime).getTime();
  return (now - start) / 60000;
}

function isLiveWindow(commenceTime: string): boolean {
  const mins = minutesSinceStart(commenceTime);
  return mins >= 0 && mins <= LIVE_CONFIG.scanWindowMinutes;
}

function filterMajorBooks(bookmakers: OddsBookmaker[] = []): OddsBookmaker[] {
  return bookmakers.filter((book) => MAJOR_BOOKS.has(book.key));
}

async function fetchLiveOdds(): Promise<OddsEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    throw new Error('Missing ODDS_API_KEY');
  }

  const sportKeys = [
    'baseball_mlb',
    'basketball_nba',
    'icehockey_nhl',
    'basketball_wnba',
  ];

  const requests = sportKeys.map(async (sportKey) => {
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds`);

    url.searchParams.set('apiKey', apiKey);
    url.searchParams.set('regions', 'us');
    url.searchParams.set('markets', 'h2h');
    url.searchParams.set('oddsFormat', 'american');
    url.searchParams.set('bookmakers', Array.from(MAJOR_BOOKS).join(','));

    const res = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Odds API failed for ${sportKey}: ${text}`);
    }

    const data = (await res.json()) as OddsEvent[];
    return Array.isArray(data) ? data : [];
  });

  const results = await Promise.all(requests);
  return results.flat();
}

function buildMoneylineCandidates(event: OddsEvent): LiveCandidate[] {
  const sides: Record<string, SidePriceBucket> = {
    [event.home_team]: { prices: [], byBook: [] },
    [event.away_team]: { prices: [], byBook: [] },
  };

  const majorBooks = filterMajorBooks(event.bookmakers);

  for (const bookmaker of majorBooks) {
    const h2h = bookmaker.markets?.find((market) => market.key === 'h2h');
    if (!h2h?.outcomes?.length) continue;

    for (const outcome of h2h.outcomes) {
      if (!(outcome.name in sides)) continue;
      if (typeof outcome.price !== 'number') continue;
      if (!isAllowedLiveOdds(outcome.price)) continue;

      sides[outcome.name].prices.push(outcome.price);
      sides[outcome.name].byBook.push({
        bookmaker: bookmaker.title,
        bookmakerKey: bookmaker.key,
        price: outcome.price,
      });
    }
  }

  const candidates: LiveCandidate[] = [];

  for (const [team, data] of Object.entries(sides)) {
    if (data.prices.length < LIVE_CONFIG.minBooks) continue;

    const bestPriceEntry = data.byBook.reduce((best, current) =>
      current.price > best.price ? current : best
    );

    const marketProbabilities = data.prices.map((price) =>
      americanToImpliedProbability(price)
    );

    const consensusProbability = median(marketProbabilities);
    const bestPriceProbability = americanToImpliedProbability(bestPriceEntry.price);

    const bestVsConsensusEdge = (consensusProbability - bestPriceProbability) * 100;
    const booksCountBoost = Math.min(0.01, data.prices.length * 0.0015);

    let modelProbability =
      consensusProbability +
      Math.max(0, bestVsConsensusEdge / 100) * 0.45 +
      booksCountBoost;

    modelProbability = Math.min(0.80, Math.max(0.20, modelProbability));

    const edge = (modelProbability - bestPriceProbability) * 100;
    const ev = expectedValuePercent(modelProbability, bestPriceEntry.price);

    if (edge < LIVE_CONFIG.minEdge) continue;
    if (ev < LIVE_CONFIG.minEv) continue;

    const fairOdds = probabilityToAmerican(modelProbability);
    const confidence = normalizeConfidence(edge, ev);
    const stake = getStakeUnits(edge, ev);

    const analysis =
      `${team} live moneyline is showing value versus the current market. ` +
      `Best price found: ${bestPriceEntry.price > 0 ? '+' : ''}${bestPriceEntry.price} at ${bestPriceEntry.bookmaker}. ` +
      `Books used: ${data.prices.length}. ` +
      `Model win probability: ${(modelProbability * 100).toFixed(2)}%. ` +
      `Market implied probability: ${(bestPriceProbability * 100).toFixed(2)}%. ` +
      `Consensus implied probability: ${(consensusProbability * 100).toFixed(2)}%. ` +
      `Estimated edge: ${edge.toFixed(2)}%. ` +
      `Estimated EV: ${ev.toFixed(2)}%. ` +
      `Fair odds: ${fairOdds > 0 ? '+' : ''}${fairOdds}.`;

    candidates.push({
      sport: event.sport_title,
      game: `${event.away_team} at ${event.home_team}`,
      pick: `${team} ML`,
      team,
      odds: bestPriceEntry.price,
      sportsbook: bestPriceEntry.bookmaker,
      sportsbook_key: bestPriceEntry.bookmakerKey,
      confidence,
      edge,
      ev,
      fair_odds: fairOdds,
      implied_prob: Number((bestPriceProbability * 100).toFixed(2)),
      model_prob: Number((modelProbability * 100).toFixed(2)),
      analysis,
      stake,
      status: 'live',
      market_type: 'moneyline',
      commence_time: event.commence_time,
    });
  }

  return candidates;
}

function dedupeCandidates(candidates: LiveCandidate[]): LiveCandidate[] {
  const bestByGame = new Map<string, LiveCandidate>();

  for (const candidate of candidates) {
    const existing = bestByGame.get(candidate.game);

    if (!existing) {
      bestByGame.set(candidate.game, candidate);
      continue;
    }

    const candidateScore =
      candidate.ev * 100 + candidate.edge * 10 + candidate.confidence;
    const existingScore =
      existing.ev * 100 + existing.edge * 10 + existing.confidence;

    if (candidateScore > existingScore) {
      bestByGame.set(candidate.game, candidate);
    }
  }

  return Array.from(bestByGame.values());
}

async function clearOldLivePicks(supabase: ReturnType<typeof getSupabase>) {
  const staleBefore = new Date(
    Date.now() - LIVE_CONFIG.staleMinutesBuffer * 60 * 1000
  ).toISOString();

  await supabase
    .from('picks')
    .delete()
    .eq('status', 'live')
    .lt('created_at', staleBefore);
}

export async function GET(req: NextRequest) {
  try {
    const cronSecret = getCronSecret();

    if (cronSecret) {
      const headerSecret =
        req.headers.get('x-cron-secret') ||
        req.headers.get('authorization')?.replace('Bearer ', '');

      if (headerSecret !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const supabase = getSupabase();

    const allEvents = await fetchLiveOdds();

    const liveEvents = allEvents.filter(
      (event) =>
        isLiveWindow(event.commence_time) &&
        Array.isArray(event.bookmakers) &&
        event.bookmakers.length > 0
    );

    const rawCandidates = liveEvents.flatMap((event) => buildMoneylineCandidates(event));
    const deduped = dedupeCandidates(rawCandidates);

    const sorted = deduped
      .sort((a, b) => {
        if (b.ev !== a.ev) return b.ev - a.ev;
        if (b.edge !== a.edge) return b.edge - a.edge;
        return b.confidence - a.confidence;
      })
      .slice(0, LIVE_CONFIG.maxPicks);

    await clearOldLivePicks(supabase);

    let insertedRows: unknown[] = [];

    if (sorted.length > 0) {
      const rowsToInsert = sorted.map((pick) => ({
        sport: pick.sport,
        game: pick.game,
        pick: pick.pick,
        odds: pick.odds,
        confidence: String(pick.confidence),
        analysis: pick.analysis,
        stake: pick.stake,
        result: 'pending',
        sportsbook: pick.sportsbook,
        sportsbook_key: pick.sportsbook_key,
        status: pick.status,
        market_type: pick.market_type,
        edge: Number(pick.edge.toFixed(2)),
        ev: Number(pick.ev.toFixed(2)),
        implied_odds: Number(pick.implied_prob.toFixed(2)),
        best_odds: pick.odds,
        fair_odds: pick.fair_odds,
        commence_time: pick.commence_time,
      }));

      const { data, error } = await supabase
        .from('picks')
        .insert(rowsToInsert)
        .select();

      if (error) {
        throw new Error(`Supabase insert failed: ${error.message}`);
      }

      insertedRows = data ?? [];
    }

    return NextResponse.json({
      success: true,
      inserted: Array.isArray(insertedRows) ? insertedRows.length : 0,
      picks: sorted.map((pick) => ({
        sport: pick.sport,
        game: pick.game,
        pick: pick.pick,
        odds: pick.odds,
        confidence: pick.confidence,
        sportsbook: pick.sportsbook,
        edge: Number(pick.edge.toFixed(2)),
        ev: Number(pick.ev.toFixed(2)),
        impliedOdds: pick.implied_prob,
        fairOdds: pick.fair_odds,
        analysis: pick.analysis,
        status: pick.status,
        commence_time: pick.commence_time,
      })),
      debug: {
        eventsChecked: allEvents.length,
        liveEventsFound: liveEvents.length,
        candidatesFound: rawCandidates.length,
        afterGameDedupe: deduped.length,
        finalSelected: sorted.length,
        scanWindowMinutes: LIVE_CONFIG.scanWindowMinutes,
        mode: 'live',
        thresholds: {
          minBooks: LIVE_CONFIG.minBooks,
          minEdge: LIVE_CONFIG.minEdge,
          minEv: LIVE_CONFIG.minEv,
          minOdds: LIVE_CONFIG.minOdds,
          maxOdds: LIVE_CONFIG.maxOdds,
        },
        booksUsed: Array.from(MAJOR_BOOKS),
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
