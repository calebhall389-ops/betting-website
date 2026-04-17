import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

type SidePriceData = {
  prices: number[];
  best: number;
  book: string;
};

type PickInsert = {
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: number;
  stake: number;
  result: string;
  sportsbook: string;
  edge: number;
  ev: number;
  analysis: string;
  game_time: string;
  play_rating: string;
};

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(url, key);
}

function getSharpBookmakerKeys(): string[] {
  return ['fanduel', 'draftkings', 'betmgm', 'caesars', 'espnbet'];
}

function americanToImpliedProbability(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function decimalFromAmerican(odds: number): number {
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

function expectedValue(probability: number, odds: number): number {
  const decimalOdds = decimalFromAmerican(odds);
  return probability * (decimalOdds - 1) - (1 - probability);
}

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function normalizeSportLabel(sport: string): string {
  const s = sport.toUpperCase();

  if (s.includes('BASEBALL')) return 'MLB';
  if (s.includes('NBA')) return 'NBA';
  if (s.includes('HOCKEY')) return 'NHL';
  if (s.includes('NFL')) return 'NFL';

  return sport;
}

function getWindow() {
  const now = new Date();

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function isValidGame(time: string): boolean {
  const gameDate = new Date(time);
  const { start, end } = getWindow();
  return gameDate >= start && gameDate <= end;
}

function estimateModelProbability(
  consensus: number,
  best: number
): number {
  const edgeSignal = consensus - best;
  const model = consensus + edgeSignal * 0.65;
  return Math.max(0.02, Math.min(0.85, model));
}

function getRating(
  probability: number,
  edge: number,
  ev: number,
  odds: number
): string {
  if (
    probability >= 0.54 &&
    edge >= 0.03 &&
    ev >= 0.08 &&
    odds >= -180 &&
    odds <= 180
  ) {
    return 'MAX PLAY';
  }

  if (
    probability >= 0.5 &&
    edge >= 0.02 &&
    ev >= 0.05
  ) {
    return 'A PLAY';
  }

  if (
    probability >= 0.1 &&
    edge >= 0.01 &&
    ev >= 0.03
  ) {
    return 'B PLAY';
  }

  return 'PASS';
}

async function fetchOdds(sport: string): Promise<OddsApiEvent[]> {
  const key = process.env.ODDS_API_KEY;

  if (!key) {
    throw new Error('Missing ODDS_API_KEY');
  }

  const url =
    `https://api.the-odds-api.com/v4/sports/${sport}/odds` +
    `?apiKey=${key}` +
    `&regions=us` +
    `&markets=h2h` +
    `&oddsFormat=american` +
    `&dateFormat=iso` +
    `&bookmakers=${getSharpBookmakerKeys().join(',')}`;

  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API failed for ${sport}: ${text}`);
  }

  const data = (await res.json()) as OddsApiEvent[];
  return Array.isArray(data) ? data : [];
}

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization');
    const secret = process.env.CRON_SECRET;

    if (secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();

    const sports = [
      'baseball_mlb',
      'basketball_nba',
      'icehockey_nhl',
      'americanfootball_nfl',
    ];

    const events: OddsApiEvent[] = [];

    for (const sport of sports) {
      const sportEvents = await fetchOdds(sport);
      events.push(...sportEvents);
    }

    const filteredEvents = events.filter(
      (event) => event.commence_time && isValidGame(event.commence_time)
    );

    const picks: PickInsert[] = [];

    for (const event of filteredEvents) {
      if (!event.bookmakers || event.bookmakers.length < 2) continue;

      const sides: Record<string, SidePriceData> = {};

      for (const bookmaker of event.bookmakers) {
        const market = bookmaker.markets.find((m) => m.key === 'h2h');
        if (!market) continue;

        for (const outcome of market.outcomes) {
          if (!sides[outcome.name]) {
            sides[outcome.name] = {
              prices: [],
              best: outcome.price,
              book: bookmaker.title,
            };
          }

          sides[outcome.name].prices.push(outcome.price);

          if (outcome.price > sides[outcome.name].best) {
            sides[outcome.name].best = outcome.price;
            sides[outcome.name].book = bookmaker.title;
          }
        }
      }

      for (const [team, side] of Object.entries(sides)) {
        if (side.prices.length < 2) continue;

        const consensus =
          side.prices
            .map((price) => americanToImpliedProbability(price))
            .reduce((sum, probability) => sum + probability, 0) /
          side.prices.length;

        const bestProb = americanToImpliedProbability(side.best);
        const model = estimateModelProbability(consensus, bestProb);
        const edge = model - bestProb;
        const ev = expectedValue(model, side.best);

        if (model < 0.1) continue;
        if (edge < 0.01) continue;
        if (ev < 0.03) continue;
        if (side.best > 350) continue;
        if (side.best < -200) continue;

        const rating = getRating(model, edge, ev, side.best);
        if (rating === 'PASS') continue;

        picks.push({
          sport: normalizeSportLabel(event.sport_title),
          game: `${event.away_team} at ${event.home_team}`,
          pick: `${team} ML`,
          odds: side.best,
          confidence: Math.round(model * 100),
          stake: 10,
          result: 'pending',
          sportsbook: side.book,
          edge: Number((edge * 100).toFixed(2)),
          ev: Number((ev * 100).toFixed(2)),
          analysis:
            `${team} moneyline shows value versus the consensus market. ` +
            `Best price found: ${formatOdds(side.best)} at ${side.book}. ` +
            `Model win probability: ${(model * 100).toFixed(2)}%. ` +
            `Market implied probability: ${(bestProb * 100).toFixed(2)}%. ` +
            `Estimated edge: ${(edge * 100).toFixed(2)}%. ` +
            `Estimated EV: ${(ev * 100).toFixed(2)}%. ` +
            `Play rating: ${rating}.`,
          game_time: event.commence_time,
          play_rating: rating,
        });
      }
    }

    picks.sort((a, b) => b.ev - a.ev);

    const finalPicks = picks.slice(0, 5);

    const { start, end } = getWindow();

    const { error: deleteError } = await supabase
      .from('picks')
      .delete()
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    if (deleteError) {
      throw new Error(`Failed clearing old picks: ${deleteError.message}`);
    }

    if (finalPicks.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying sharp picks found for today or tomorrow.',
        debug: {
          eventsChecked: filteredEvents.length,
          candidatesFound: picks.length,
        },
      });
    }

    const { data, error } = await supabase
      .from('picks')
      .insert(finalPicks)
      .select();

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      inserted: data?.length || 0,
      picks: data || [],
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
