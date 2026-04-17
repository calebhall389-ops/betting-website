import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchOddsForSport,
  fetchPlayerPropsForEvent,
  PLAYER_PROP_MARKETS_BY_SPORT,
  getDisplaySportFromKey,
  getPropLabel,
  MAJOR_BOOKMAKERS,
  type OddsEvent,
} from '@/lib/odds-api';

export const dynamic = 'force-dynamic';

type PropsRow = {
  sport: string;
  player: string;
  game: string;
  market: string;
  market_key: string;
  recommendation: 'over' | 'under';
  line: number;
  over_odds: number;
  under_odds: number;
  best_sportsbook: string;
  edge: number;
  ev: number;
  confidence: number;
  analysis: string;
  event_time: string;
  game_date: string;
  result: string;
  dedupe_key: string;
};

type BookOutcomePair = {
  bookKey: string;
  bookTitle: string;
  overPrice?: number;
  underPrice?: number;
};

type CandidateScore = {
  recommendation: 'over' | 'under';
  bestOdds: number;
  marketProb: number;
  modelProb: number;
  edge: number;
  ev: number;
  bookTitle: string;
};

const PROP_SPORT_KEYS = [
  'basketball_nba',
  'americanfootball_nfl',
  'baseball_mlb',
  'icehockey_nhl',
];

const MAJOR_BOOKS_SET = new Set(MAJOR_BOOKMAKERS);

// loosened thresholds so props can start populating
const MIN_BOOKS = 2;
const MIN_EDGE = 1.75;
const MIN_EV = 1.25;
const MAX_PROPS_PER_RUN = 18;

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

function getArizonaYmd(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDaysYmd(base: Date, days: number) {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return getArizonaYmd(d);
}

function americanToImpliedProb(price: number) {
  if (price > 0) {
    return 100 / (price + 100);
  }

  return Math.abs(price) / (Math.abs(price) + 100);
}

function calcEvPercent(modelProb: number, americanOdds: number) {
  const decimalOdds =
    americanOdds > 0
      ? 1 + americanOdds / 100
      : 1 + 100 / Math.abs(americanOdds);

  const ev = modelProb * (decimalOdds - 1) - (1 - modelProb);
  return ev * 100;
}

function getConfidence(edge: number, ev: number) {
  if (edge >= 5 && ev >= 4) return 5;
  if (edge >= 4 && ev >= 3.25) return 4;
  if (edge >= 2.75 && ev >= 2) return 3;
  if (edge >= 1.75 && ev >= 1.25) return 2;
  return 1;
}

function buildAnalysis(args: {
  player: string;
  market: string;
  recommendation: 'over' | 'under';
  line: number;
  bestOdds: number;
  bookTitle: string;
  modelProb: number;
  marketProb: number;
  edge: number;
  ev: number;
  booksCount: number;
}) {
  const {
    player,
    market,
    recommendation,
    line,
    bestOdds,
    bookTitle,
    modelProb,
    marketProb,
    edge,
    ev,
    booksCount,
  } = args;

  return (
    `${player} ${recommendation.toUpperCase()} ${line} ${market} shows value versus consensus pricing. ` +
    `Best price found: ${bestOdds > 0 ? `+${bestOdds}` : bestOdds} at ${bookTitle}. ` +
    `Books compared: ${booksCount}. ` +
    `Model probability: ${(modelProb * 100).toFixed(2)}%. ` +
    `Market implied probability: ${(marketProb * 100).toFixed(2)}%. ` +
    `Estimated edge: ${edge.toFixed(2)}%. ` +
    `Estimated EV: ${ev.toFixed(2)}%.`
  );
}

function normalizeConsensusProb(overProbs: number[], underProbs: number[]) {
  const overAvg =
    overProbs.reduce((sum, p) => sum + p, 0) / Math.max(overProbs.length, 1);
  const underAvg =
    underProbs.reduce((sum, p) => sum + p, 0) / Math.max(underProbs.length, 1);

  const total = overAvg + underAvg;

  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }

  return {
    over: overAvg / total,
    under: underAvg / total,
  };
}

function chooseBestSide(args: {
  overConsensus: number;
  underConsensus: number;
  bestOver: { price: number; bookTitle: string };
  bestUnder: { price: number; bookTitle: string };
}): CandidateScore | null {
  const { overConsensus, underConsensus, bestOver, bestUnder } = args;

  const overMarketProb = americanToImpliedProb(bestOver.price);
  const underMarketProb = americanToImpliedProb(bestUnder.price);

  const overEdge = (overConsensus - overMarketProb) * 100;
  const underEdge = (underConsensus - underMarketProb) * 100;

  const overEv = calcEvPercent(overConsensus, bestOver.price);
  const underEv = calcEvPercent(underConsensus, bestUnder.price);

  const candidates: CandidateScore[] = [];

  if (overEdge >= MIN_EDGE && overEv >= MIN_EV) {
    candidates.push({
      recommendation: 'over',
      bestOdds: bestOver.price,
      marketProb: overMarketProb,
      modelProb: overConsensus,
      edge: overEdge,
      ev: overEv,
      bookTitle: bestOver.bookTitle,
    });
  }

  if (underEdge >= MIN_EDGE && underEv >= MIN_EV) {
    candidates.push({
      recommendation: 'under',
      bestOdds: bestUnder.price,
      marketProb: underMarketProb,
      modelProb: underConsensus,
      edge: underEdge,
      ev: underEv,
      bookTitle: bestUnder.bookTitle,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.ev !== a.ev) return b.ev - a.ev;
    return b.edge - a.edge;
  });

  return candidates[0];
}

async function handleGenerate(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();

    const now = new Date();
    const todayYmd = getArizonaYmd(now);
    const tomorrowYmd = addDaysYmd(now, 1);
    const allowedDates = new Set([todayYmd, tomorrowYmd]);

    const featuredEvents: OddsEvent[] = [];

    for (const sportKey of PROP_SPORT_KEYS) {
      const events = await fetchOddsForSport(sportKey);

      for (const event of events) {
        const eventYmd = getArizonaYmd(new Date(event.commence_time));
        if (allowedDates.has(eventYmd)) {
          featuredEvents.push(event);
        }
      }
    }

    let eventsChecked = 0;
    let propPairsChecked = 0;
    let candidatesFound = 0;

    const propsToInsert: PropsRow[] = [];

    for (const event of featuredEvents) {
      const sportKey = event.sport_key;
      const markets = PLAYER_PROP_MARKETS_BY_SPORT[sportKey];

      if (!markets || markets.length === 0) continue;

      eventsChecked += 1;

      let eventWithProps: OddsEvent;
      try {
        eventWithProps = await fetchPlayerPropsForEvent(
          sportKey,
          event.id,
          markets
        );
      } catch {
        continue;
      }

      const grouped: Record<string, BookOutcomePair[]> = {};

      for (const bookmaker of eventWithProps.bookmakers ?? []) {
        if (!MAJOR_BOOKS_SET.has(bookmaker.key)) continue;

        for (const market of bookmaker.markets ?? []) {
          for (const outcome of market.outcomes ?? []) {
            const player = outcome.description?.trim();
            const side = outcome.name?.toLowerCase();
            const line = outcome.point;

            if (!player) continue;
            if (side !== 'over' && side !== 'under') continue;
            if (typeof line !== 'number') continue;

            const groupKey = `${market.key}__${player}__${line}`;

            if (!grouped[groupKey]) {
              grouped[groupKey] = [];
            }

            let entry = grouped[groupKey].find(
              (x) => x.bookKey === bookmaker.key
            );

            if (!entry) {
              entry = {
                bookKey: bookmaker.key,
                bookTitle: bookmaker.title,
              };
              grouped[groupKey].push(entry);
            }

            if (side === 'over') entry.overPrice = outcome.price;
            if (side === 'under') entry.underPrice = outcome.price;
          }
        }
      }

      for (const [groupKey, books] of Object.entries(grouped)) {
        const [marketKey, player, lineStr] = groupKey.split('__');
        const line = Number(lineStr);

        const validBooks = books.filter(
          (b) =>
            typeof b.overPrice === 'number' && typeof b.underPrice === 'number'
        );

        if (validBooks.length < MIN_BOOKS) continue;

        propPairsChecked += 1;

        const overProbs = validBooks.map((b) =>
          americanToImpliedProb(b.overPrice as number)
        );
        const underProbs = validBooks.map((b) =>
          americanToImpliedProb(b.underPrice as number)
        );

        const consensus = normalizeConsensusProb(overProbs, underProbs);
        if (!consensus) continue;

        const bestOver = validBooks.reduce(
          (best, current) =>
            (current.overPrice as number) > best.price
              ? {
                  price: current.overPrice as number,
                  bookTitle: current.bookTitle,
                }
              : best,
          {
            price: validBooks[0].overPrice as number,
            bookTitle: validBooks[0].bookTitle,
          }
        );

        const bestUnder = validBooks.reduce(
          (best, current) =>
            (current.underPrice as number) > best.price
              ? {
                  price: current.underPrice as number,
                  bookTitle: current.bookTitle,
                }
              : best,
          {
            price: validBooks[0].underPrice as number,
            bookTitle: validBooks[0].bookTitle,
          }
        );

        const chosen = chooseBestSide({
          overConsensus: consensus.over,
          underConsensus: consensus.under,
          bestOver,
          bestUnder,
        });

        if (!chosen) continue;

        candidatesFound += 1;

        const sport = getDisplaySportFromKey(sportKey);
        const market = getPropLabel(marketKey);
        const game = `${event.away_team} at ${event.home_team}`;
        const eventTime = event.commence_time;
        const gameDate = getArizonaYmd(new Date(event.commence_time));
        const confidence = getConfidence(chosen.edge, chosen.ev);
        const dedupeKey = [
          sport,
          player,
          marketKey,
          chosen.recommendation,
          line,
          gameDate,
        ].join('__');

        propsToInsert.push({
          sport,
          player,
          game,
          market,
          market_key: marketKey,
          recommendation: chosen.recommendation,
          line,
          over_odds: bestOver.price,
          under_odds: bestUnder.price,
          best_sportsbook: chosen.bookTitle,
          edge: Number(chosen.edge.toFixed(2)),
          ev: Number(chosen.ev.toFixed(2)),
          confidence,
          analysis: buildAnalysis({
            player,
            market,
            recommendation: chosen.recommendation,
            line,
            bestOdds: chosen.bestOdds,
            bookTitle: chosen.bookTitle,
            modelProb: chosen.modelProb,
            marketProb: chosen.marketProb,
            edge: chosen.edge,
            ev: chosen.ev,
            booksCount: validBooks.length,
          }),
          event_time: eventTime,
          game_date: gameDate,
          result: 'pending',
          dedupe_key: dedupeKey,
        });
      }
    }

    const finalProps = propsToInsert
      .sort((a, b) => {
        if (b.ev !== a.ev) return b.ev - a.ev;
        if (b.edge !== a.edge) return b.edge - a.edge;
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return a.player.localeCompare(b.player);
      })
      .slice(0, MAX_PROPS_PER_RUN);

    if (finalProps.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying props found for today or tomorrow.',
        debug: {
          eventsChecked,
          propPairsChecked,
          candidatesFound,
          finalSelected: 0,
          minBooks: MIN_BOOKS,
          minEdge: MIN_EDGE,
          minEv: MIN_EV,
          maxPropsPerRun: MAX_PROPS_PER_RUN,
        },
      });
    }

    const { data, error } = await supabase
      .from('props')
      .upsert(finalProps, { onConflict: 'dedupe_key' })
      .select();

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      inserted: data?.length ?? 0,
      props: data ?? [],
      debug: {
        eventsChecked,
        propPairsChecked,
        candidatesFound,
        finalSelected: finalProps.length,
        minBooks: MIN_BOOKS,
        minEdge: MIN_EDGE,
        minEv: MIN_EV,
        maxPropsPerRun: MAX_PROPS_PER_RUN,
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

export async function GET(req: NextRequest) {
  return handleGenerate(req);
}

export async function POST(req: NextRequest) {
  return handleGenerate(req);
}
