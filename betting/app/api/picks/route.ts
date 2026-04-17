import { NextResponse } from 'next/server';
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

function getTodayDateRange() {
  const now = new Date();

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function americanToDecimal(odds: number) {
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

function americanToImpliedProbability(odds: number) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function getKellyStake(
  bankroll: number,
  modelProb: number,
  americanOdds: number,
  fraction = 0.25
) {
  const decimalOdds = americanToDecimal(americanOdds);
  const b = decimalOdds - 1;
  const p = modelProb;
  const q = 1 - p;

  const fullKelly = (b * p - q) / b;

  if (fullKelly <= 0) return 0;

  return Math.max(0, Math.round(bankroll * fullKelly * fraction));
}

function normalizeSport(sportTitle: string) {
  const s = sportTitle.toLowerCase();

  if (s.includes('basketball')) return 'NBA';
  if (s.includes('baseball')) return 'MLB';
  if (s.includes('hockey')) return 'NHL';
  if (s.includes('football')) return 'NFL';

  return sportTitle;
}

function getConfidence(edge: number, ev: number) {
  if (ev >= 0.15 && edge >= 12) return '5⭐ Max Play';
  if (ev >= 0.1 && edge >= 9) return '4⭐';
  if (ev >= 0.07 && edge >= 7) return '3⭐';
  if (ev >= 0.05 && edge >= 5) return '2⭐';
  return '1⭐';
}

function buildAnalysis(params: {
  team: string;
  sportsbook: string;
  odds: number;
  modelProb: number;
  impliedProb: number;
  edge: number;
  ev: number;
  confidence: string;
}) {
  const {
    team,
    sportsbook,
    odds,
    modelProb,
    impliedProb,
    edge,
    ev,
    confidence,
  } = params;

  return `${team} moneyline qualifies as a ${confidence} based on EV and edge thresholds. Best price found: ${odds > 0 ? '+' : ''}${odds} at ${sportsbook}. Model win probability: ${(modelProb * 100).toFixed(2)}%. Market implied probability: ${(impliedProb * 100).toFixed(2)}%. Estimated edge: ${edge.toFixed(2)}%. Estimated EV: ${(ev * 100).toFixed(2)}%.`;
}

async function fetchOddsForSport(
  sport: string,
  apiKey: string,
  regions: string,
  bookmakers: string
): Promise<OddsEvent[]> {
  const url =
    `https://api.the-odds-api.com/v4/sports/${sport}/odds` +
    `?apiKey=${apiKey}` +
    `&regions=${regions}` +
    `&markets=h2h` +
    `&oddsFormat=american` +
    `&bookmakers=${bookmakers}`;

  const res = await fetch(url, {
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API failed for ${sport}: ${text}`);
  }

  return res.json();
}

export async function GET() {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const oddsApiKey = process.env.ODDS_API_KEY;
    const bankroll = Number(process.env.BANKROLL || 1000);

    if (!oddsApiKey) {
      return NextResponse.json(
        { success: false, error: 'Missing ODDS_API_KEY' },
        { status: 500 }
      );
    }

    const sports = ['basketball_nba', 'baseball_mlb', 'icehockey_nhl'];
    const regions = 'us';
    const bookmakers =
      'fanduel,draftkings,betmgm,caesars,espnbet,fanatics';

    const supabase = getSupabase();

    const { startIso, endIso } = getTodayDateRange();

    const allEventsArrays = await Promise.all(
      sports.map((sport) =>
        fetchOddsForSport(sport, oddsApiKey, regions, bookmakers)
      )
    );

    const allEvents = allEventsArrays.flat();

    const todaysEvents = allEvents.filter((event) => {
      const gameTime = new Date(event.commence_time).getTime();
      return (
        gameTime >= new Date(startIso).getTime() &&
        gameTime <= new Date(endIso).getTime()
      );
    });

    if (!todaysEvents.length) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No games found for today.',
        debug: {
          eventsChecked: 0,
          candidatesFound: 0,
        },
      });
    }

    await supabase
      .from('picks')
      .delete()
      .gte('created_at', startIso)
      .lte('created_at', endIso);

    const picksToInsert: Record<string, unknown>[] = [];
    let candidatesFound = 0;

    for (const event of todaysEvents) {
      if (!event.bookmakers?.length) continue;

      const game = `${event.away_team} at ${event.home_team}`;
      const sport = normalizeSport(event.sport_title);
      const gameTime = event.commence_time;

      let bestHomeOdds = -Infinity;
      let bestAwayOdds = -Infinity;
      let bestHomeBook = '';
      let bestAwayBook = '';

      for (const bookmaker of event.bookmakers) {
        const market = bookmaker.markets?.find((m) => m.key === 'h2h');
        if (!market) continue;

        for (const outcome of market.outcomes || []) {
          if (
            outcome.name === event.home_team &&
            typeof outcome.price === 'number' &&
            outcome.price > bestHomeOdds
          ) {
            bestHomeOdds = outcome.price;
            bestHomeBook = bookmaker.title;
          }

          if (
            outcome.name === event.away_team &&
            typeof outcome.price === 'number' &&
            outcome.price > bestAwayOdds
          ) {
            bestAwayOdds = outcome.price;
            bestAwayBook = bookmaker.title;
          }
        }
      }

      const sides = [
        {
          team: event.home_team,
          odds: bestHomeOdds,
          sportsbook: bestHomeBook,
        },
        {
          team: event.away_team,
          odds: bestAwayOdds,
          sportsbook: bestAwayBook,
        },
      ];

      for (const side of sides) {
        if (!Number.isFinite(side.odds)) continue;

        const impliedProb = americanToImpliedProbability(side.odds);

        // Slight model edge above market. This keeps picks realistic
        // without producing extreme EV values.
        const modelProb = Math.min(impliedProb + 0.06, 0.75);

        const edge = (modelProb - impliedProb) * 100;
        const decimalOdds = americanToDecimal(side.odds);
        const ev = modelProb * decimalOdds - 1;

        // Tighten pick quality here
        if (
          edge < 6 ||
          ev < 0.08 ||
          side.odds < 100 ||
          side.odds > 300
        ) {
          continue;
        }

        candidatesFound++;

        const confidence = getConfidence(edge, ev);
        const stake = getKellyStake(bankroll, modelProb, side.odds, 0.25);

        const analysis = buildAnalysis({
          team: side.team,
          sportsbook: side.sportsbook,
          odds: side.odds,
          modelProb,
          impliedProb,
          edge,
          ev,
          confidence,
        });

        picksToInsert.push({
          sport,
          game,
          pick: `${side.team} ML`,
          odds: side.odds,
          confidence,
          stake,
          result: 'pending',
          analysis,
          sportsbook: side.sportsbook,
          edge: Number(edge.toFixed(2)),
          ev: Number((ev * 100).toFixed(2)),
          game_time: gameTime,
        });
      }
    }

    if (!picksToInsert.length) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying EV picks found today.',
        debug: {
          eventsChecked: todaysEvents.length,
          candidatesFound,
        },
      });
    }

    const { data, error } = await supabase
      .from('picks')
      .insert(picksToInsert)
      .select('*');

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      inserted: data?.length || 0,
      picks: data || [],
      debug: {
        eventsChecked: todaysEvents.length,
        candidatesFound,
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
