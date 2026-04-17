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

type SideData = {
  prices: number[];
  bestPrice: number;
  bestBook: string;
  bestBookKey: string;
};

type CandidatePick = {
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: string;
  analysis: string;
  stake: number;
  sportsbook: string;
  sportsbook_key: string;
  edge: number;
  ev: number;
  play_rating: string;
  status: string;
  game_date: string;
};

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

function impliedProbToAmerican(prob: number): number {
  if (prob <= 0 || prob >= 1) return 0;

  if (prob >= 0.5) {
    return Math.round(-(prob / (1 - prob)) * 100);
  }

  return Math.round(((1 - prob) / prob) * 100);
}

function expectedValue(modelProb: number, americanOdds: number): number {
  const decimalOdds =
    americanOdds > 0
      ? 1 + americanOdds / 100
      : 1 + 100 / Math.abs(americanOdds);

  return modelProb * (decimalOdds - 1) - (1 - modelProb);
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function normalizeSportName(sportTitle: string): string {
  if (sportTitle === 'American Football') return 'NFL';
  if (sportTitle === 'Baseball') return 'MLB';
  if (sportTitle === 'Basketball') return 'NBA';
  if (sportTitle === 'Ice Hockey') return 'NHL';
  return sportTitle;
}

function getPlayRating(evPct: number, edgePct: number, modelProb: number): string {
  if (evPct >= 14 && edgePct >= 6 && modelProb >= 0.6) {
    return 'MAX PLAY';
  }
  if (evPct >= 12 && edgePct >= 5.5 && modelProb >= 0.56) {
    return 'A+ PLAY';
  }
  if (evPct >= 10 && edgePct >= 4.5 && modelProb >= 0.52) {
    return 'A PLAY';
  }
  return 'B+ PLAY';
}

async function fetchOdds(): Promise<OddsEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    throw new Error('Missing ODDS_API_KEY');
  }

  const sports = [
    'baseball_mlb',
    'basketball_nba',
    'icehockey_nhl',
    'americanfootball_nfl',
  ];

  const regions = 'us';
  const markets = 'h2h';
  const oddsFormat = 'american';
  const dateFormat = 'iso';

  const allEvents: OddsEvent[] = [];

  for (const sport of sports) {
    const url =
      `https://api.the-odds-api.com/v4/sports/${sport}/odds` +
      `?apiKey=${apiKey}` +
      `&regions=${regions}` +
      `&markets=${markets}` +
      `&oddsFormat=${oddsFormat}` +
      `&dateFormat=${dateFormat}`;

    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Odds API failed for ${sport}: ${text}`);
    }

    const data = (await res.json()) as OddsEvent[];
    allEvents.push(...data);
  }

  return allEvents;
}

export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    const cronHeader = req.headers.get('x-cron-secret');

    if (
      cronSecret &&
      authHeader !== `Bearer ${cronSecret}` &&
      cronHeader !== cronSecret
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    const oddsEvents = await fetchOdds();

    const SHARP_BOOKS = [
      'draftkings',
      'fanduel',
      'betmgm',
      'caesars',
      'espnbet',
      'betrivers',
      'pointsbetus',
    ];

    const MIN_BOOKS = 3;
    const MIN_EDGE = 4.5;
    const MIN_EV = 10;
    const MIN_CONFIDENCE = 50;
    const MAX_PICKS_PER_RUN = 5;

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const candidates: CandidatePick[] = [];
    let eventsChecked = 0;

    for (const event of oddsEvents) {
      const gameDate = new Date(event.commence_time);
      const isToday = isSameUtcDay(gameDate, now);
      const isTomorrow = isSameUtcDay(gameDate, tomorrow);

      if (!isToday && !isTomorrow) continue;
      if (!event.bookmakers?.length) continue;

      eventsChecked++;

      const filteredBooks = event.bookmakers.filter((book) =>
        SHARP_BOOKS.includes(book.key)
      );

      if (filteredBooks.length < MIN_BOOKS) continue;

      const sides: Record<string, SideData> = {};

      for (const bookmaker of filteredBooks) {
        const h2hMarket = bookmaker.markets?.find((m) => m.key === 'h2h');
        if (!h2hMarket?.outcomes?.length) continue;

        for (const outcome of h2hMarket.outcomes) {
          if (typeof outcome.price !== 'number') continue;

          if (!sides[outcome.name]) {
            sides[outcome.name] = {
              prices: [],
              bestPrice: outcome.price,
              bestBook: bookmaker.title,
              bestBookKey: bookmaker.key,
            };
          }

          sides[outcome.name].prices.push(outcome.price);

          if (outcome.price > sides[outcome.name].bestPrice) {
            sides[outcome.name].bestPrice = outcome.price;
            sides[outcome.name].bestBook = bookmaker.title;
            sides[outcome.name].bestBookKey = bookmaker.key;
          }
        }
      }

      const eventCandidates: CandidatePick[] = [];

      for (const [team, data] of Object.entries(sides)) {
        if (!data || data.prices.length < MIN_BOOKS) continue;

        const consensusProb =
          data.prices
            .map((price) => americanToImpliedProb(price))
            .reduce((sum, prob) => sum + prob, 0) / data.prices.length;

        // Elite version: lighter model boost so the edge is less inflated
        const modelProb = Math.min(consensusProb * 1.05, 0.92);

        if (modelProb <= 0 || modelProb >= 0.95) continue;

        const bestOdds = data.bestPrice;
        const marketImpliedProb = americanToImpliedProb(bestOdds);
        const edge = (modelProb - marketImpliedProb) * 100;
        const ev = expectedValue(modelProb, bestOdds) * 100;
        const confidence = Math.round(modelProb * 100);

        if (
          edge < MIN_EDGE ||
          ev < MIN_EV ||
          confidence < MIN_CONFIDENCE
        ) {
          continue;
        }

        const playRating = getPlayRating(ev, edge, modelProb);
        const fairOdds = impliedProbToAmerican(modelProb);
        const displayOdds = bestOdds > 0 ? `+${bestOdds}` : `${bestOdds}`;
        const displayFairOdds = fairOdds > 0 ? `+${fairOdds}` : `${fairOdds}`;

        eventCandidates.push({
          sport: normalizeSportName(event.sport_title),
          game: `${event.away_team} at ${event.home_team}`,
          pick: `${team} ML`,
          odds: bestOdds,
          confidence: String(confidence),
          analysis:
            `${team} ML is showing +EV against market consensus. ` +
            `Best price found: ${displayOdds} at ${data.bestBook}. ` +
            `Books used: ${data.prices.length}. ` +
            `Model win probability: ${(modelProb * 100).toFixed(2)}%. ` +
            `Market implied probability: ${(marketImpliedProb * 100).toFixed(2)}%. ` +
            `Estimated edge: ${edge.toFixed(2)}%. ` +
            `Estimated EV: ${ev.toFixed(2)}%. ` +
            `Fair odds: ${displayFairOdds}. ` +
            `Play rating: ${playRating}.`,
          stake: 1,
          sportsbook: data.bestBook,
          sportsbook_key: data.bestBookKey,
          edge: Number(edge.toFixed(2)),
          ev: Number(ev.toFixed(2)),
          play_rating: playRating,
          status: 'pending',
          game_date: event.commence_time,
        });
      }

      // Only keep the single best side from each game
      eventCandidates.sort((a, b) => {
        if (b.ev !== a.ev) return b.ev - a.ev;
        if (b.edge !== a.edge) return b.edge - a.edge;
        return Number(b.confidence) - Number(a.confidence);
      });

      if (eventCandidates.length > 0) {
        candidates.push(eventCandidates[0]);
      }
    }

    candidates.sort((a, b) => {
      const ratingRank = (rating: string) => {
        if (rating === 'MAX PLAY') return 4;
        if (rating === 'A+ PLAY') return 3;
        if (rating === 'A PLAY') return 2;
        return 1;
      };

      const ratingDiff = ratingRank(b.play_rating) - ratingRank(a.play_rating);
      if (ratingDiff !== 0) return ratingDiff;

      if (b.ev !== a.ev) return b.ev - a.ev;
      if (b.edge !== a.edge) return b.edge - a.edge;
      return Number(b.confidence) - Number(a.confidence);
    });

    const finalPicks = candidates.slice(0, MAX_PICKS_PER_RUN);

    if (finalPicks.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying elite picks found today or tomorrow.',
        debug: {
          eventsChecked,
          candidatesFound: candidates.length,
          finalSelected: 0,
          minBooks: MIN_BOOKS,
          minEdge: MIN_EDGE,
          minEv: MIN_EV,
          minConfidence: MIN_CONFIDENCE,
          maxPicksPerRun: MAX_PICKS_PER_RUN,
          sharpBooks: SHARP_BOOKS,
        },
      });
    }

    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 1);
    dayAfterTomorrow.setUTCHours(0, 0, 0, 0);

    await supabase
      .from('picks')
      .delete()
      .gte('game_date', todayStart.toISOString())
      .lt('game_date', dayAfterTomorrow.toISOString())
      .eq('status', 'pending');

    const { data: insertedRows, error: insertError } = await supabase
      .from('picks')
      .insert(finalPicks)
      .select();

    if (insertError) {
      throw new Error(`Supabase insert failed: ${insertError.message}`);
    }

    return NextResponse.json({
      success: true,
      inserted: insertedRows?.length ?? 0,
      picks: insertedRows ?? [],
      debug: {
        eventsChecked,
        candidatesFound: candidates.length,
        finalSelected: finalPicks.length,
        minBooks: MIN_BOOKS,
        minEdge: MIN_EDGE,
        minEv: MIN_EV,
        minConfidence: MIN_CONFIDENCE,
        maxPicksPerRun: MAX_PICKS_PER_RUN,
        sharpBooks: SHARP_BOOKS,
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
