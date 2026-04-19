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

type SportInfo = {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights?: boolean;
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

type ExistingLivePickRow = {
  id: string;
  game: string;
  pick: string;
  odds: number | null;
  edge: number | null;
  ev: number | null;
  market_type: string | null;
  status: string | null;
  created_at: string;
};

const LIVE_CONFIG = {
  minBooks: 3,
  minEdge: 3.0,
  minEv: 2.5,
  maxOdds: 225,
  minOdds: -220,
  scanWindowMinutes: 90,
  maxPicks: 6,

  staleMinutes: 8,
  minOddsImprovementCents: 10,
  minEdgeImprovement: 0.5,
  minEvImprovement: 0.75,
};

const MAJOR_BOOKS = new Set([
  'draftkings',
  'fanduel',
  'betmgm',
  'caesars',
  'espnbet',
  'betrivers',
]);

const ALLOWED_LIVE_SPORTS = new Set([
  'baseball_mlb',
  'basketball_nba',
  'icehockey_nhl',
  'basketball_wnba',
  'americanfootball_nfl',
  'americanfootball_ncaaf',
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
  if (odds > 0) return 100 / (odds + 100);
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

function expectedValuePercent(
  winProbability: number,
  americanOdds: number
): number {
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
  return Math.max(55, Math.min(82, Math.round(raw)));
}

function isAllowedLiveOdds(odds: number): boolean {
  return odds >= LIVE_CONFIG.minOdds && odds <= LIVE_CONFIG.maxOdds;
}

function getStakeUnits(edge: number, ev: number): number {
  if (edge >= 5 && ev >= 6) return 1.5;
  if (edge >= 3.5 && ev >= 3.5) return 1.0;
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

function buildPickKey(input: {
  game: string;
  pick: string;
  market_type: string;
}): string {
  return `${input.game}__${input.pick}__${input.market_type}`;
}

function isMeaningfullyBetter(
  newPick: LiveCandidate,
  oldPick: ExistingLivePickRow
): boolean {
  const oldOdds = Number(oldPick.odds ?? 0);
  const oldEdge = Number(oldPick.edge ?? 0);
  const oldEv = Number(oldPick.ev ?? 0);

  const oddsImprovedEnough =
    newPick.odds >= oldOdds + LIVE_CONFIG.minOddsImprovementCents;

  const edgeImprovedEnough =
    newPick.edge - oldEdge >= LIVE_CONFIG.minEdgeImprovement;

  const evImprovedEnough =
    newPick.ev - oldEv >= LIVE_CONFIG.minEvImprovement;

  return oddsImprovedEnough || edgeImprovedEnough || evImprovedEnough;
}

async function fetchActiveSports(): Promise<string[]> {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    throw new Error('Missing ODDS_API_KEY');
  }

  const url = new URL('https://api.the-odds-api.com/v4/sports');
  url.searchParams.set('apiKey', apiKey);

  const res = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API sports lookup failed: ${text}`);
  }

  const sports = (await res.json()) as SportInfo[];

  return sports
    .filter((sport) => sport.active && ALLOWED_LIVE_SPORTS.has(sport.key))
    .map((sport) => sport.key);
}

async function fetchLiveOddsForSports(sportKeys: string[]): Promise<OddsEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    throw new Error('Missing ODDS_API_KEY');
  }

  if (!sportKeys.length) {
    return [];
  }

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

    modelProbability = Math.min(0.8, Math.max(0.2, modelProbability));

    const edge = (modelProbability - bestPriceProbability) * 100;
    const ev = expectedValuePercent(modelProbability, bestPriceEntry.price);

    if (edge < LIVE_CONFIG.minEdge) continue;
    if (ev < LIVE_CONFIG.minEv) continue;

    const fairOdds = probabilityToAmerican(modelProbability);
    const confidence = normalizeConfidence(edge, ev);
    const stake = getStakeUnits(edge, ev);

    const analysis =
      `${team} live moneyline is showing stronger value than the current market consensus. ` +
      `Best number available is ${bestPriceEntry.price > 0 ? '+' : ''}${bestPriceEntry.price} at ${bestPriceEntry.bookmaker}. ` +
      `This play cleared ${data.prices.length} major books. ` +
      `Model win probability is ${(modelProbability * 100).toFixed(2)}% versus market implied probability of ${(bestPriceProbability * 100).toFixed(2)}%. ` +
      `Consensus implied probability across books is ${(consensusProbability * 100).toFixed(2)}%. ` +
      `Estimated edge is ${edge.toFixed(2)}% with projected EV of ${ev.toFixed(2)}%. ` +
      `Fair odds come out to ${fairOdds > 0 ? '+' : ''}${fairOdds}.`;

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

function mapCandidateToRow(pick: LiveCandidate) {
  return {
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
  };
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

    const activeSportKeys = await fetchActiveSports();
    const allEvents = await fetchLiveOddsForSports(activeSportKeys);

    const liveEvents = allEvents.filter(
      (event) =>
        isLiveWindow(event.commence_time) &&
        Array.isArray(event.bookmakers) &&
        event.bookmakers.length > 0
    );

    const rawCandidates = liveEvents.flatMap((event) =>
      buildMoneylineCandidates(event)
    );

    const deduped = dedupeCandidates(rawCandidates);

    const sorted = deduped
      .sort((a, b) => {
        if (b.ev !== a.ev) return b.ev - a.ev;
        if (b.edge !== a.edge) return b.edge - a.edge;
        return b.confidence - a.confidence;
      })
      .slice(0, LIVE_CONFIG.maxPicks);

    const staleCutoff = new Date(
      Date.now() - LIVE_CONFIG.staleMinutes * 60 * 1000
    ).toISOString();

    const { error: staleDeleteError } = await supabase
      .from('picks')
      .delete()
      .eq('status', 'live')
      .lt('created_at', staleCutoff);

    if (staleDeleteError) {
      throw new Error(`Supabase stale delete failed: ${staleDeleteError.message}`);
    }

    const { data: existingLivePicks, error: existingError } = await supabase
      .from('picks')
      .select('id, game, pick, odds, edge, ev, market_type, status, created_at')
      .eq('status', 'live');

    if (existingError) {
      throw new Error(
        `Supabase existing live picks lookup failed: ${existingError.message}`
      );
    }

    const existingMap = new Map<string, ExistingLivePickRow>();

    for (const row of (existingLivePicks ?? []) as ExistingLivePickRow[]) {
      const key = buildPickKey({
        game: row.game,
        pick: row.pick,
        market_type: row.market_type || 'moneyline',
      });

      existingMap.set(key, row);
    }

    const inserted: LiveCandidate[] = [];
    const updated: LiveCandidate[] = [];
    const skipped: LiveCandidate[] = [];

    for (const candidate of sorted) {
      const key = buildPickKey({
        game: candidate.game,
        pick: candidate.pick,
        market_type: candidate.market_type,
      });

      const existing = existingMap.get(key);
      const rowPayload = mapCandidateToRow(candidate);

      if (!existing) {
        const { error: insertError } = await supabase
          .from('picks')
          .insert(rowPayload);

        if (insertError) {
          throw new Error(`Supabase insert failed: ${insertError.message}`);
        }

        inserted.push(candidate);
        continue;
      }

      if (!isMeaningfullyBetter(candidate, existing)) {
        skipped.push(candidate);
        continue;
      }

      const { error: updateError } = await supabase
        .from('picks')
        .update(rowPayload)
        .eq('id', existing.id);

      if (updateError) {
        throw new Error(`Supabase update failed: ${updateError.message}`);
      }

      updated.push(candidate);
    }

    const bestLivePlayKey =
      sorted.length > 0
        ? buildPickKey({
            game: sorted[0].game,
            pick: sorted[0].pick,
            market_type: sorted[0].market_type,
          })
        : null;

    return NextResponse.json({
      success: true,
      inserted: inserted.length,
      updated: updated.length,
      skipped: skipped.length,
      picks: sorted.map((pick) => {
        const pickKey = buildPickKey({
          game: pick.game,
          pick: pick.pick,
          market_type: pick.market_type,
        });

        return {
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
          isTopLivePlay: pickKey === bestLivePlayKey,
        };
      }),
      debug: {
        activeSportsQueried: activeSportKeys,
        eventsChecked: allEvents.length,
        liveEventsFound: liveEvents.length,
        candidatesFound: rawCandidates.length,
        afterGameDedupe: deduped.length,
        finalSelected: sorted.length,
        inserted: inserted.length,
        updated: updated.length,
        skipped: skipped.length,
        staleMinutes: LIVE_CONFIG.staleMinutes,
        scanWindowMinutes: LIVE_CONFIG.scanWindowMinutes,
        mode: 'live',
        thresholds: {
          minBooks: LIVE_CONFIG.minBooks,
          minEdge: LIVE_CONFIG.minEdge,
          minEv: LIVE_CONFIG.minEv,
          minOdds: LIVE_CONFIG.minOdds,
          maxOdds: LIVE_CONFIG.maxOdds,
          minOddsImprovementCents: LIVE_CONFIG.minOddsImprovementCents,
          minEdgeImprovement: LIVE_CONFIG.minEdgeImprovement,
          minEvImprovement: LIVE_CONFIG.minEvImprovement,
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
