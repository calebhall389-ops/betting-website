import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// ===============================
// SETTINGS
// ===============================
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

const MIN_BOOKS = 2;
const MIN_CONSENSUS_BOOKS = 2;
const MIN_EDGE = 1.0;
const MIN_EV = 1.0;

const MAX_PICKS_PER_RUN = 12;
const ONE_PICK_PER_GAME = true;
const LOOKAHEAD_HOURS = 36;
const MIN_MINUTES_TO_START = 5;

const MAX_REASONABLE_EDGE = 12;
const MAX_REASONABLE_EV = 15;
const MAX_REASONABLE_DOG_PROB = 0.66;
const MAX_REASONABLE_DOG_ODDS = 170;

const STALE_DROP_EDGE = 0.75;
const STALE_DROP_EV = 0.75;

const BOOK_WEIGHTS: Record<string, number> = {
  fanduel: 1.0,
  draftkings: 1.0,
  betmgm: 1.0,
  caesars: 0.95,
  betrivers: 0.92,
  espnbet: 0.9,
  fanatics: 0.88,
  thescorebet: 0.88,
};

// ===============================
// TYPES
// ===============================
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

type PriceEntry = {
  bookKey: string;
  bookTitle: string;
  price: number;
};

type SpreadPriceEntry = {
  bookKey: string;
  bookTitle: string;
  price: number;
  point: number;
};

type TotalPriceEntry = {
  bookKey: string;
  bookTitle: string;
  price: number;
  point: number;
};

type SideAggregate = {
  prices: PriceEntry[];
};

type SpreadAggregate = {
  prices: SpreadPriceEntry[];
};

type TotalAggregate = {
  prices: TotalPriceEntry[];
};

type PlayRating = 'MAX' | 'A' | 'B' | 'C';
type PickStatus = 'pregame';

type ExistingPickRow = {
  id: string;
  game: string | null;
  pick: string | null;
  odds: number | null;
  previous_odds?: number | null;
  best_odds?: number | null;
  edge?: number | null;
  ev?: number | null;
  play_rating?: string | null;
  max_play?: boolean | null;
  sportsbook?: string | null;
  sportsbook_key?: string | null;
  market_type?: string | null;
  market_key?: string | null;
  selection_name?: string | null;
  commence_time?: string | null;
  status?: string | null;
  result?: string | null;
  odds_last_seen_at?: string | null;
  event_id?: string | null;
};

type Candidate = {
  sport: string;
  game: string;
  pick: string;
  market_type: 'moneyline' | 'spread' | 'total';
  market_key: string;
  selection_name: string;
  odds: number;
  sportsbook: string;
  sportsbook_key: string;
  confidence: number;
  analysis: string;
  stake: number;
  fair_line: number | null;
  model_probability: number;
  implied_probability: number;
  edge: number;
  ev: number;
  play_rating: PlayRating;
  status: PickStatus;
  commence_time: string;
  max_play: boolean;
  pick_type: 'pregame';
  is_live: false;
  event_id: string;
  best_odds: number;
  previous_odds: number | null;
  closing_odds: number | null;
  clv: number | null;
  odds_last_seen_at: string;
  line_movement: string | null;
  mode: 'elite';
};

type InsertRow = {
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: string;
  analysis: string;
  stake: number;
  result: string;
  sportsbook: string;
  sportsbook_key: string;
  status: string;
  commence_time: string;
  market_type: string;
  market_key: string;
  selection_name: string;
  fair_line: number | null;
  model_probability: number;
  implied_probability: number;
  edge: number;
  ev: number;
  play_rating: string;
  max_play: boolean;
  pick_type: string;
  is_live: boolean;
  event_id: string;
  best_odds: number;
  previous_odds: number | null;
  closing_odds: number | null;
  clv: number | null;
  odds_last_seen_at: string;
  mode: string;
};

// ===============================
// HELPERS
// ===============================
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

function americanToImpliedProb(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function probToAmerican(prob: number): number {
  if (prob <= 0 || prob >= 1) return 0;
  if (prob >= 0.5) return Math.round((-100 * prob) / (1 - prob));
  return Math.round((100 * (1 - prob)) / prob);
}

function decimalFromAmerican(odds: number): number {
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

function expectedValuePercent(prob: number, odds: number): number {
  const dec = decimalFromAmerican(odds);
  return (prob * dec - 1) * 100;
}

function removeVigTwoWay(probA: number, probB: number) {
  const total = probA + probB;
  if (total <= 0) return { a: 0.5, b: 0.5 };

  return {
    a: probA / total,
    b: probB / total,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function weightedAverageImpliedProb(
  prices: Array<{ bookKey: string; price: number }>
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const entry of prices) {
    const weight = BOOK_WEIGHTS[entry.bookKey] ?? 0.85;
    weightedSum += americanToImpliedProb(entry.price) * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) return 0;
  return weightedSum / totalWeight;
}

function sportLabel(sportKey: string): string {
  if (sportKey.includes('mlb')) return 'MLB';
  if (sportKey.includes('nba')) return 'NBA';
  if (sportKey.includes('nhl')) return 'NHL';
  return sportKey.toUpperCase();
}

function normalizeGameKey(event: OddsEvent): string {
  return `${event.away_team} at ${event.home_team}`;
}

function isWithinWindow(commenceTime: string): boolean {
  const now = Date.now();
  const start = new Date(commenceTime).getTime();
  const diffMs = start - now;
  const diffHours = diffMs / 1000 / 60 / 60;
  const diffMinutes = diffMs / 1000 / 60;

  return diffHours <= LOOKAHEAD_HOURS && diffMinutes >= MIN_MINUTES_TO_START;
}

function formatAmerican(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function getPlayRating(
  edge: number,
  ev: number,
  favorableMovement: boolean
): PlayRating | null {
  if (edge >= 5 && ev >= 8 && favorableMovement) return 'MAX';
  if (edge >= 3.5 && ev >= 5) return 'A';
  if (edge >= 2 && ev >= 2.5) return 'B';
  if (edge >= 1 && ev >= 1) return 'C';
  return null;
}

function getStakeUnits(rating: PlayRating): number {
  if (rating === 'MAX') return 2.0;
  if (rating === 'A') return 1.5;
  if (rating === 'B') return 1.0;
  return 0.75;
}

function ratingRank(rating: PlayRating): number {
  if (rating === 'MAX') return 4;
  if (rating === 'A') return 3;
  if (rating === 'B') return 2;
  return 1;
}

function passesSanityFilters(
  modelProb: number,
  bestOdds: number,
  edge: number,
  ev: number
): boolean {
  if (edge > MAX_REASONABLE_EDGE) return false;
  if (ev > MAX_REASONABLE_EV) return false;

  if (
    modelProb > MAX_REASONABLE_DOG_PROB &&
    bestOdds > MAX_REASONABLE_DOG_ODDS
  ) {
    return false;
  }

  return true;
}

function movementForOdds(
  currentOdds: number,
  previousOdds: number | null
): string | null {
  if (previousOdds === null || previousOdds === currentOdds) return null;

  const currentProb = americanToImpliedProb(currentOdds);
  const previousProb = americanToImpliedProb(previousOdds);

  if (currentProb > previousProb + 0.003) return 'toward_pick';
  if (currentProb < previousProb - 0.003) return 'away_from_pick';

  return 'flat';
}

function isFavorableMovement(lineMovement: string | null): boolean {
  return (
    lineMovement === 'toward_pick' ||
    lineMovement === null ||
    lineMovement === 'flat'
  );
}

function buildAnalysis(candidate: Candidate): string {
  const fairText =
    candidate.fair_line !== null ? formatAmerican(candidate.fair_line) : 'N/A';

  const ratingText = candidate.max_play
    ? 'MAX PLAY'
    : `${candidate.play_rating} PLAY`;

  const movementText =
    candidate.line_movement === 'toward_pick'
      ? ' Market is moving toward this side.'
      : candidate.line_movement === 'away_from_pick'
        ? ' Market has moved slightly against this side.'
        : '';

  return `${candidate.pick} at ${candidate.sportsbook} is available at ${formatAmerican(
    candidate.odds
  )} versus a weighted consensus fair line of ${fairText}. Consensus win probability is ${round2(
    candidate.model_probability * 100
  )}% versus implied probability ${round2(
    candidate.implied_probability * 100
  )}%. Estimated edge is ${round2(
    candidate.edge
  )}% with expected value of ${round2(
    candidate.ev
  )}%. Rating: ${ratingText}.${movementText}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}

async function fetchEventsForSport(sport: string): Promise<OddsEvent[]> {
  const url =
    `${ODDS_API_BASE}/${sport}/odds` +
    `?apiKey=${ODDS_API_KEY}` +
    `&regions=us` +
    `&markets=h2h,spreads,totals` +
    `&oddsFormat=american` +
    `&bookmakers=${Array.from(ALLOWED_BOOKS).join(',')}`;

  const data = await fetchJson<OddsEvent[]>(url);
  return Array.isArray(data) ? data : [];
}

function getBestPrice(entries: PriceEntry[]): PriceEntry | null {
  if (!entries.length) return null;
  return [...entries].sort((a, b) => b.price - a.price)[0];
}

function getBestSpreadPrice(
  entries: SpreadPriceEntry[]
): SpreadPriceEntry | null {
  if (!entries.length) return null;
  return [...entries].sort((a, b) => b.price - a.price)[0];
}

function getBestTotalPrice(entries: TotalPriceEntry[]): TotalPriceEntry | null {
  if (!entries.length) return null;
  return [...entries].sort((a, b) => b.price - a.price)[0];
}

function calcWeightedNoVigExcludingBest(
  sideAEntries: Array<{ bookKey: string; price: number }>,
  sideBEntries: Array<{ bookKey: string; price: number }>,
  excludedBookKey: string
): { a: number; b: number } | null {
  const aEntries = sideAEntries.filter((x) => x.bookKey !== excludedBookKey);
  const bEntries = sideBEntries.filter((x) => x.bookKey !== excludedBookKey);

  if (
    aEntries.length < MIN_CONSENSUS_BOOKS ||
    bEntries.length < MIN_CONSENSUS_BOOKS
  ) {
    return null;
  }

  const avgAProb = weightedAverageImpliedProb(aEntries);
  const avgBProb = weightedAverageImpliedProb(bEntries);

  return removeVigTwoWay(avgAProb, avgBProb);
}

function buildCandidateKey(candidate: Candidate): string {
  return [
    candidate.game,
    candidate.market_type,
    candidate.market_key,
    candidate.selection_name,
    candidate.pick,
  ].join('|');
}

function buildExistingPickKey(row: ExistingPickRow): string {
  return [
    row.game ?? '',
    row.market_type ?? '',
    row.market_key ?? '',
    row.selection_name ?? '',
    row.pick ?? '',
  ].join('|');
}

async function fetchExistingPregamePicks(): Promise<
  Map<string, ExistingPickRow>
> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('picks')
    .select(
      'id, game, pick, odds, previous_odds, best_odds, edge, ev, play_rating, max_play, sportsbook, sportsbook_key, market_type, market_key, selection_name, commence_time, status, result, odds_last_seen_at, event_id'
    )
    .eq('status', 'pregame')
    .eq('result', 'pending');

  if (error) {
    throw new Error(`Failed fetching existing picks: ${error.message}`);
  }

  const map = new Map<string, ExistingPickRow>();

  for (const row of (data ?? []) as ExistingPickRow[]) {
    map.set(buildExistingPickKey(row), row);
  }

  return map;
}

// ===============================
// MARKET BUILDERS
// ===============================
function buildMoneylineCandidates(
  event: OddsEvent,
  existingPicks: Map<string, ExistingPickRow>,
  nowIso: string
): Candidate[] {
  if (!event.bookmakers?.length) return [];

  const sides: Record<string, SideAggregate> = {};

  for (const book of event.bookmakers) {
    if (!ALLOWED_BOOKS.has(book.key)) continue;

    const market = book.markets?.find((m) => m.key === 'h2h');
    if (!market?.outcomes?.length) continue;

    for (const outcome of market.outcomes) {
      if (typeof outcome.price !== 'number') continue;

      if (!sides[outcome.name]) {
        sides[outcome.name] = { prices: [] };
      }

      sides[outcome.name].prices.push({
        bookKey: book.key,
        bookTitle: book.title,
        price: outcome.price,
      });
    }
  }

  const home = event.home_team;
  const away = event.away_team;

  if (!sides[home] || !sides[away]) return [];

  if (
    sides[home].prices.length < MIN_BOOKS ||
    sides[away].prices.length < MIN_BOOKS
  ) {
    return [];
  }

  const candidates: Candidate[] = [];

  for (const team of [home, away]) {
    const oppTeam = team === home ? away : home;
    const entries = sides[team].prices;
    const oppEntries = sides[oppTeam].prices;

    const best = getBestPrice(entries);
    if (!best) continue;

    const consensus = calcWeightedNoVigExcludingBest(
      entries,
      oppEntries,
      best.bookKey
    );

    if (!consensus) continue;

    const modelProb = team === home ? consensus.a : consensus.b;
    const implied = americanToImpliedProb(best.price);
    const edge = (modelProb - implied) * 100;
    const ev = expectedValuePercent(modelProb, best.price);

    if (!passesSanityFilters(modelProb, best.price, edge, ev)) continue;

    const baseCandidate: Candidate = {
      sport: sportLabel(event.sport_key),
      game: normalizeGameKey(event),
      pick: `${team} ML`,
      market_type: 'moneyline',
      market_key: 'h2h',
      selection_name: team,
      odds: best.price,
      sportsbook: best.bookTitle,
      sportsbook_key: best.bookKey,
      confidence: Math.round(modelProb * 100),
      analysis: '',
      stake: 0,
      fair_line: probToAmerican(modelProb),
      model_probability: modelProb,
      implied_probability: implied,
      edge: round2(edge),
      ev: round2(ev),
      play_rating: 'C',
      status: 'pregame',
      commence_time: event.commence_time,
      max_play: false,
      pick_type: 'pregame',
      is_live: false,
      event_id: event.id,
      best_odds: best.price,
      previous_odds: null,
      closing_odds: null,
      clv: null,
      odds_last_seen_at: nowIso,
      line_movement: null,
      mode: 'elite',
    };

    const existing = existingPicks.get(buildCandidateKey(baseCandidate));
    const previousOdds =
      typeof existing?.odds === 'number' ? existing.odds : null;

    const lineMovement = movementForOdds(best.price, previousOdds);
    const favorableMovement = isFavorableMovement(lineMovement);
    const rating = getPlayRating(edge, ev, favorableMovement);

    if (!rating) continue;
    if (edge < MIN_EDGE || ev < MIN_EV) continue;

    const finalCandidate: Candidate = {
      ...baseCandidate,
      previous_odds: previousOdds,
      line_movement: lineMovement,
      play_rating: rating,
      max_play: rating === 'MAX',
      stake: getStakeUnits(rating),
    };

    finalCandidate.analysis = buildAnalysis(finalCandidate);
    candidates.push(finalCandidate);
  }

  return candidates;
}

function buildSpreadCandidates(
  event: OddsEvent,
  existingPicks: Map<string, ExistingPickRow>,
  nowIso: string
): Candidate[] {
  if (!event.bookmakers?.length) return [];

  const spreads: Record<string, SpreadAggregate> = {};

  for (const book of event.bookmakers) {
    if (!ALLOWED_BOOKS.has(book.key)) continue;

    const market = book.markets?.find((m) => m.key === 'spreads');
    if (!market?.outcomes?.length || market.outcomes.length < 2) continue;

    for (const outcome of market.outcomes) {
      if (typeof outcome.price !== 'number' || typeof outcome.point !== 'number') {
        continue;
      }

      const key = `${outcome.name}|${outcome.point}`;

      if (!spreads[key]) {
        spreads[key] = { prices: [] };
      }

      spreads[key].prices.push({
        bookKey: book.key,
        bookTitle: book.title,
        price: outcome.price,
        point: outcome.point,
      });
    }
  }

  const candidates: Candidate[] = [];

  for (const [selectionKey, aggregate] of Object.entries(spreads)) {
    const [team, pointStr] = selectionKey.split('|');
    const point = Number(pointStr);

    if (aggregate.prices.length < MIN_BOOKS) continue;

    const oppositeTeam =
      team === event.home_team ? event.away_team : event.home_team;
    const oppositeKey = `${oppositeTeam}|${-point}`;
    const opposite = spreads[oppositeKey];

    if (!opposite || opposite.prices.length < MIN_BOOKS) continue;

    const best = getBestSpreadPrice(aggregate.prices);
    if (!best) continue;

    const consensus = calcWeightedNoVigExcludingBest(
      aggregate.prices,
      opposite.prices,
      best.bookKey
    );

    if (!consensus) continue;

    const modelProb = consensus.a;
    const implied = americanToImpliedProb(best.price);
    const edge = (modelProb - implied) * 100;
    const ev = expectedValuePercent(modelProb, best.price);

    if (!passesSanityFilters(modelProb, best.price, edge, ev)) continue;

    const pointText = point > 0 ? `+${point}` : `${point}`;

    const baseCandidate: Candidate = {
      sport: sportLabel(event.sport_key),
      game: normalizeGameKey(event),
      pick: `${team} ${pointText}`,
      market_type: 'spread',
      market_key: 'spreads',
      selection_name: team,
      odds: best.price,
      sportsbook: best.bookTitle,
      sportsbook_key: best.bookKey,
      confidence: Math.round(modelProb * 100),
      analysis: '',
      stake: 0,
      fair_line: probToAmerican(modelProb),
      model_probability: modelProb,
      implied_probability: implied,
      edge: round2(edge),
      ev: round2(ev),
      play_rating: 'C',
      status: 'pregame',
      commence_time: event.commence_time,
      max_play: false,
      pick_type: 'pregame',
      is_live: false,
      event_id: event.id,
      best_odds: best.price,
      previous_odds: null,
      closing_odds: null,
      clv: null,
      odds_last_seen_at: nowIso,
      line_movement: null,
      mode: 'elite',
    };

    const existing = existingPicks.get(buildCandidateKey(baseCandidate));
    const previousOdds =
      typeof existing?.odds === 'number' ? existing.odds : null;

    const lineMovement = movementForOdds(best.price, previousOdds);
    const favorableMovement = isFavorableMovement(lineMovement);
    const rating = getPlayRating(edge, ev, favorableMovement);

    if (!rating) continue;
    if (edge < MIN_EDGE || ev < MIN_EV) continue;

    const finalCandidate: Candidate = {
      ...baseCandidate,
      previous_odds: previousOdds,
      line_movement: lineMovement,
      play_rating: rating,
      max_play: rating === 'MAX',
      stake: getStakeUnits(rating),
    };

    finalCandidate.analysis = buildAnalysis(finalCandidate);
    candidates.push(finalCandidate);
  }

  return candidates;
}

function buildTotalCandidates(
  event: OddsEvent,
  existingPicks: Map<string, ExistingPickRow>,
  nowIso: string
): Candidate[] {
  if (!event.bookmakers?.length) return [];

  const totals: Record<string, TotalAggregate> = {};

  for (const book of event.bookmakers) {
    if (!ALLOWED_BOOKS.has(book.key)) continue;

    const market = book.markets?.find((m) => m.key === 'totals');
    if (!market?.outcomes?.length || market.outcomes.length < 2) continue;

    for (const outcome of market.outcomes) {
      if (typeof outcome.price !== 'number' || typeof outcome.point !== 'number') {
        continue;
      }

      const key = `${outcome.name}|${outcome.point}`;

      if (!totals[key]) {
        totals[key] = { prices: [] };
      }

      totals[key].prices.push({
        bookKey: book.key,
        bookTitle: book.title,
        price: outcome.price,
        point: outcome.point,
      });
    }
  }

  const candidates: Candidate[] = [];
  const seenPoints = new Set<number>();

  for (const key of Object.keys(totals)) {
    const parts = key.split('|');
    if (parts.length < 2) continue;

    const point = Number(parts[1]);

    if (!Number.isNaN(point)) {
      seenPoints.add(point);
    }
  }

  for (const point of Array.from(seenPoints)) {
    const overKey = `Over|${point}`;
    const underKey = `Under|${point}`;

    const over = totals[overKey];
    const under = totals[underKey];

    if (!over || !under) continue;

    if (over.prices.length < MIN_BOOKS || under.prices.length < MIN_BOOKS) {
      continue;
    }

    for (const side of ['Over', 'Under'] as const) {
      const aggregate = side === 'Over' ? over : under;
      const best = getBestTotalPrice(aggregate.prices);

      if (!best) continue;

      const consensus = calcWeightedNoVigExcludingBest(
        over.prices,
        under.prices,
        best.bookKey
      );

      if (!consensus) continue;

      const modelProb = side === 'Over' ? consensus.a : consensus.b;
      const implied = americanToImpliedProb(best.price);
      const edge = (modelProb - implied) * 100;
      const ev = expectedValuePercent(modelProb, best.price);

      if (!passesSanityFilters(modelProb, best.price, edge, ev)) continue;

      const baseCandidate: Candidate = {
        sport: sportLabel(event.sport_key),
        game: normalizeGameKey(event),
        pick: `${side} ${point}`,
        market_type: 'total',
        market_key: 'totals',
        selection_name: side,
        odds: best.price,
        sportsbook: best.bookTitle,
        sportsbook_key: best.bookKey,
        confidence: Math.round(modelProb * 100),
        analysis: '',
        stake: 0,
        fair_line: probToAmerican(modelProb),
        model_probability: modelProb,
        implied_probability: implied,
        edge: round2(edge),
        ev: round2(ev),
        play_rating: 'C',
        status: 'pregame',
        commence_time: event.commence_time,
        max_play: false,
        pick_type: 'pregame',
        is_live: false,
        event_id: event.id,
        best_odds: best.price,
        previous_odds: null,
        closing_odds: null,
        clv: null,
        odds_last_seen_at: nowIso,
        line_movement: null,
        mode: 'elite',
      };

      const existing = existingPicks.get(buildCandidateKey(baseCandidate));
      const previousOdds =
        typeof existing?.odds === 'number' ? existing.odds : null;

      const lineMovement = movementForOdds(best.price, previousOdds);
      const favorableMovement = isFavorableMovement(lineMovement);
      const rating = getPlayRating(edge, ev, favorableMovement);

      if (!rating) continue;
      if (edge < MIN_EDGE || ev < MIN_EV) continue;

      const finalCandidate: Candidate = {
        ...baseCandidate,
        previous_odds: previousOdds,
        line_movement: lineMovement,
        play_rating: rating,
        max_play: rating === 'MAX',
        stake: getStakeUnits(rating),
      };

      finalCandidate.analysis = buildAnalysis(finalCandidate);
      candidates.push(finalCandidate);
    }
  }

  return candidates;
}

// ===============================
// MAIN
// ===============================
export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    const bearer = authHeader?.replace('Bearer ', '');
    const xCron = req.headers.get('x-cron-secret');

    if (cronSecret && bearer !== cronSecret && xCron !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ODDS_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Missing ODDS_API_KEY' },
        { status: 500 }
      );
    }

    const supabase = getSupabase();
    const existingPicks = await fetchExistingPregamePicks();
    const nowIso = new Date().toISOString();

    let eventsChecked = 0;
    let candidatesFound = 0;

    const allCandidates: Candidate[] = [];

    for (const sport of SPORTS) {
      const events = await fetchEventsForSport(sport);

      for (const event of events) {
        if (!isWithinWindow(event.commence_time)) continue;
        if (!event.bookmakers?.length) continue;

        eventsChecked++;

        const moneyline = buildMoneylineCandidates(event, existingPicks, nowIso);
        const spreads = buildSpreadCandidates(event, existingPicks, nowIso);
        const totals = buildTotalCandidates(event, existingPicks, nowIso);

        const eventCandidates = [...moneyline, ...spreads, ...totals];

        candidatesFound += eventCandidates.length;
        allCandidates.push(...eventCandidates);
      }
    }

    allCandidates.sort((a, b) => {
      if (ratingRank(b.play_rating) !== ratingRank(a.play_rating)) {
        return ratingRank(b.play_rating) - ratingRank(a.play_rating);
      }

      if (b.ev !== a.ev) return b.ev - a.ev;

      return b.edge - a.edge;
    });

    let finalCandidates = allCandidates;

    if (ONE_PICK_PER_GAME) {
      const bestByGame = new Map<string, Candidate>();

      for (const candidate of allCandidates) {
        const existing = bestByGame.get(candidate.game);

        if (!existing) {
          bestByGame.set(candidate.game, candidate);
          continue;
        }

        if (
          ratingRank(candidate.play_rating) > ratingRank(existing.play_rating) ||
          (ratingRank(candidate.play_rating) ===
            ratingRank(existing.play_rating) &&
            candidate.ev > existing.ev) ||
          (ratingRank(candidate.play_rating) ===
            ratingRank(existing.play_rating) &&
            candidate.ev === existing.ev &&
            candidate.edge > existing.edge)
        ) {
          bestByGame.set(candidate.game, candidate);
        }
      }

      finalCandidates = Array.from(bestByGame.values()).sort((a, b) => {
        if (ratingRank(b.play_rating) !== ratingRank(a.play_rating)) {
          return ratingRank(b.play_rating) - ratingRank(a.play_rating);
        }

        if (b.ev !== a.ev) return b.ev - a.ev;

        return b.edge - a.edge;
      });
    }

    finalCandidates = finalCandidates.slice(0, MAX_PICKS_PER_RUN);

    const finalKeys = new Set(finalCandidates.map(buildCandidateKey));
    const staleIds: string[] = [];

    for (const [key, row] of Array.from(existingPicks.entries())) {
      const stillOnBoard = finalKeys.has(key);
      const rowEdge = typeof row.edge === 'number' ? row.edge : null;
      const rowEv = typeof row.ev === 'number' ? row.ev : null;

      if (!stillOnBoard) {
        staleIds.push(row.id);
        continue;
      }

      if (
        rowEdge !== null &&
        rowEv !== null &&
        (rowEdge < STALE_DROP_EDGE || rowEv < STALE_DROP_EV)
      ) {
        staleIds.push(row.id);
      }
    }

    if (staleIds.length) {
      const { error: staleDeleteError } = await supabase
        .from('picks')
        .delete()
        .in('id', staleIds);

      if (staleDeleteError) {
        return NextResponse.json(
          {
            success: false,
            error: `Failed deleting stale picks: ${staleDeleteError.message}`,
          },
          { status: 500 }
        );
      }
    }

    const { error: deleteError } = await supabase
      .from('picks')
      .delete()
      .eq('status', 'pregame')
      .eq('result', 'pending');

    if (deleteError) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed clearing old picks: ${deleteError.message}`,
        },
        { status: 500 }
      );
    }

    if (!finalCandidates.length) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying pregame picks found.',
        debug: {
          eventsChecked,
          candidatesFound,
          finalSelected: 0,
          minBooks: MIN_BOOKS,
          minConsensusBooks: MIN_CONSENSUS_BOOKS,
          minEdge: MIN_EDGE,
          minEv: MIN_EV,
          maxPicksPerRun: MAX_PICKS_PER_RUN,
          onePickPerGame: ONE_PICK_PER_GAME,
          staleRemoved: staleIds.length,
        },
      });
    }

    const rows: InsertRow[] = finalCandidates.map((c) => ({
      sport: c.sport,
      game: c.game,
      pick: c.pick,
      odds: c.odds,
      confidence: String(c.confidence),
      analysis: c.analysis,
      stake: c.stake,
      result: 'pending',
      sportsbook: c.sportsbook,
      sportsbook_key: c.sportsbook_key,
      status: c.status,
      commence_time: c.commence_time,
      market_type: c.market_type,
      market_key: c.market_key,
      selection_name: c.selection_name,
      fair_line: c.fair_line,
      model_probability: round2(c.model_probability * 100),
      implied_probability: round2(c.implied_probability * 100),
      edge: c.edge,
      ev: c.ev,
      play_rating: c.play_rating,
      max_play: c.max_play,
      pick_type: c.pick_type,
      is_live: c.is_live,
      event_id: c.event_id,
      best_odds: c.best_odds,
      previous_odds: c.previous_odds,
      closing_odds: c.closing_odds,
      clv: c.clv,
      odds_last_seen_at: c.odds_last_seen_at,
      mode: c.mode,
    }));

    const { data, error } = await supabase
      .from('picks')
      .insert(rows)
      .select();

    if (error) {
      return NextResponse.json(
        { success: false, error: `Supabase insert failed: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      inserted: data?.length || 0,
      picks: data || [],
      debug: {
        eventsChecked,
        candidatesFound,
        finalSelected: finalCandidates.length,
        minBooks: MIN_BOOKS,
        minConsensusBooks: MIN_CONSENSUS_BOOKS,
        minEdge: MIN_EDGE,
        minEv: MIN_EV,
        maxPicksPerRun: MAX_PICKS_PER_RUN,
        onePickPerGame: ONE_PICK_PER_GAME,
        staleRemoved: staleIds.length,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown server error';

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
