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

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(url, serviceRoleKey);
}

function americanToImpliedProbability(odds: number) {
  if (odds > 0) {
    return 100 / (odds + 100);
  }
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function americanToDecimal(odds: number) {
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

function calcEV(modelProb: number, odds: number) {
  const decimalOdds = americanToDecimal(odds);
  return modelProb * (decimalOdds - 1) - (1 - modelProb);
}

function formatSport(sportTitle: string) {
  if (sportTitle.toLowerCase().includes('baseball')) return 'MLB';
  if (sportTitle.toLowerCase().includes('basketball')) return 'NBA';
  if (sportTitle.toLowerCase().includes('hockey')) return 'NHL';
  if (sportTitle.toLowerCase().includes('football')) return 'NFL';
  return sportTitle;
}

function buildAnalysis(params: {
  side: string;
  bookTitle: string;
  bestOdds: number;
  modelProb: number;
  impliedProb: number;
  edgePct: number;
  evPct: number;
}) {
  const { side, bookTitle, bestOdds, modelProb, impliedProb, edgePct, evPct } =
    params;

  return `${side} moneyline shows value versus the consensus market. Best price found: ${
    bestOdds > 0 ? `+${bestOdds}` : bestOdds
  } at ${bookTitle}. Model win probability: ${(modelProb * 100).toFixed(
    2
  )}%. Market implied probability: ${(impliedProb * 100).toFixed(
    2
  )}%. Estimated edge: ${edgePct.toFixed(2)}%. Estimated EV: ${evPct.toFixed(
    2
  )}%.`;
}

function getTodayDateString() {
  return new Date().toISOString().split('T')[0];
}

function getSimpleModelProbability(
  event: OddsEvent,
  avgHomeImplied: number,
  avgAwayImplied: number
) {
  const homeBias = 0.015;
  const awayBias = 0.015;

  let homeModel = avgHomeImplied + homeBias;
  let awayModel = avgAwayImplied + awayBias;

  const sportKey = event.sport_key.toLowerCase();

  if (sportKey.includes('baseball_mlb')) {
    homeModel += 0.01;
  } else if (sportKey.includes('icehockey_nhl')) {
    homeModel += 0.005;
  } else if (sportKey.includes('basketball_nba')) {
    homeModel += 0.01;
  }

  homeModel = Math.min(Math.max(homeModel, 0.35), 0.65);
  awayModel = Math.min(Math.max(awayModel, 0.35), 0.65);

  return {
    homeModel,
    awayModel,
  };
}

async function fetchOddsForSport(
  sportKey: string,
  apiKey: string
): Promise<OddsEvent[]> {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds`);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('regions', 'us');
  url.searchParams.set('markets', 'h2h');
  url.searchParams.set('oddsFormat', 'american');
  url.searchParams.set('bookmakers', 'draftkings,fanduel,betmgm,caesars');

  const res = await fetch(url.toString(), {
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API failed for ${sportKey}: ${text}`);
  }

  return res.json();
}

export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const headerSecret = req.headers.get('x-cron-secret');
      if (headerSecret !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const oddsApiKey = process.env.ODDS_API_KEY;
    if (!oddsApiKey) {
      throw new Error('Missing ODDS_API_KEY');
    }

    const supabase = getSupabase();

    const today = getTodayDateString();

    const allowedBooks = ['draftkings', 'fanduel', 'betmgm', 'caesars'];
    const sportKeys = [
      'baseball_mlb',
      'basketball_nba',
      'icehockey_nhl',
      'americanfootball_nfl',
    ];

    const allEvents: OddsEvent[] = [];

    for (const sportKey of sportKeys) {
      try {
        const events = await fetchOddsForSport(sportKey, oddsApiKey);
        allEvents.push(...events);
      } catch (error) {
        console.error(`Failed sport ${sportKey}`, error);
      }
    }

    let eventsChecked = 0;
    let candidatesFound = 0;

    const picksToInsert: Record<string, unknown>[] = [];

    for (const event of allEvents) {
      eventsChecked += 1;

      const gameDate = new Date(event.commence_time).toISOString().split('T')[0];
      if (gameDate !== today) continue;

      if (!event.bookmakers || event.bookmakers.length === 0) continue;

      const usableBooks = event.bookmakers.filter((book) =>
        allowedBooks.includes(book.key)
      );
      if (usableBooks.length === 0) continue;

      let bestHomeOdds = -99999;
      let bestAwayOdds = -99999;
      let bestHomeBook = '';
      let bestAwayBook = '';

      const homeImplieds: number[] = [];
      const awayImplieds: number[] = [];

      for (const book of usableBooks) {
        const h2h = book.markets.find((m) => m.key === 'h2h');
        if (!h2h) continue;

        const homeOutcome = h2h.outcomes.find((o) => o.name === event.home_team);
        const awayOutcome = h2h.outcomes.find((o) => o.name === event.away_team);

        if (!homeOutcome || !awayOutcome) continue;

        if (
          typeof homeOutcome.price !== 'number' ||
          typeof awayOutcome.price !== 'number'
        ) {
          continue;
        }

        if (
          homeOutcome.price > 1000 ||
          homeOutcome.price < -500 ||
          awayOutcome.price > 1000 ||
          awayOutcome.price < -500
        ) {
          continue;
        }

        const homeImp = americanToImpliedProbability(homeOutcome.price);
        const awayImp = americanToImpliedProbability(awayOutcome.price);

        homeImplieds.push(homeImp);
        awayImplieds.push(awayImp);

        if (homeOutcome.price > bestHomeOdds) {
          bestHomeOdds = homeOutcome.price;
          bestHomeBook = book.title;
        }

        if (awayOutcome.price > bestAwayOdds) {
          bestAwayOdds = awayOutcome.price;
          bestAwayBook = book.title;
        }
      }

      if (
        homeImplieds.length === 0 ||
        awayImplieds.length === 0 ||
        bestHomeBook === '' ||
        bestAwayBook === ''
      ) {
        continue;
      }

      const avgHomeImplied =
        homeImplieds.reduce((sum, n) => sum + n, 0) / homeImplieds.length;
      const avgAwayImplied =
        awayImplieds.reduce((sum, n) => sum + n, 0) / awayImplieds.length;

      const { homeModel, awayModel } = getSimpleModelProbability(
        event,
        avgHomeImplied,
        avgAwayImplied
      );

      const homeBestImplied = americanToImpliedProbability(bestHomeOdds);
      const awayBestImplied = americanToImpliedProbability(bestAwayOdds);

      const homeEdge = homeModel - homeBestImplied;
      const awayEdge = awayModel - awayBestImplied;

      const homeEV = calcEV(homeModel, bestHomeOdds);
      const awayEV = calcEV(awayModel, bestAwayOdds);

      const homeDiffFromMarket = Math.abs(homeModel - homeBestImplied);
      const awayDiffFromMarket = Math.abs(awayModel - awayBestImplied);

      const candidates = [
        {
          team: event.home_team,
          game: `${event.away_team} at ${event.home_team}`,
          odds: bestHomeOdds,
          sportsbook: bestHomeBook,
          modelProb: homeModel,
          impliedProb: homeBestImplied,
          edge: homeEdge,
          ev: homeEV,
          confidence: Math.round(homeModel * 100),
          diffFromMarket: homeDiffFromMarket,
        },
        {
          team: event.away_team,
          game: `${event.away_team} at ${event.home_team}`,
          odds: bestAwayOdds,
          sportsbook: bestAwayBook,
          modelProb: awayModel,
          impliedProb: awayBestImplied,
          edge: awayEdge,
          ev: awayEV,
          confidence: Math.round(awayModel * 100),
          diffFromMarket: awayDiffFromMarket,
        },
      ];

      for (const candidate of candidates) {
        if (candidate.odds > 1000 || candidate.odds < -500) continue;
        if (candidate.diffFromMarket > 0.25) continue;
        if (candidate.edge < 0.025) continue;
        if (candidate.ev < 0.03) continue;

        let tag = '';
        if (candidate.edge > 0.06 && candidate.ev > 0.05) {
          tag = '🔥 MAX PLAY';
        } else if (candidate.edge > 0.04) {
          tag = '💎 Sharp Pick';
        }

        const analysis = buildAnalysis({
          side: candidate.team,
          bookTitle: candidate.sportsbook,
          bestOdds: candidate.odds,
          modelProb: candidate.modelProb,
          impliedProb: candidate.impliedProb,
          edgePct: candidate.edge * 100,
          evPct: candidate.ev * 100,
        });

        picksToInsert.push({
          sport: formatSport(event.sport_title),
          game: candidate.game,
          pick: `${candidate.team} ML`,
          odds: candidate.odds,
          confidence: candidate.confidence,
          stake: 10,
          result: 'Pending',
          game_time: event.commence_time,
          sportsbook: candidate.sportsbook,
          edge: Number((candidate.edge * 100).toFixed(2)),
          ev: Number((candidate.ev * 100).toFixed(2)),
          analysis,
          tag,
          market_type: 'moneyline',
        });

        candidatesFound += 1;
      }
    }

    if (picksToInsert.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying EV picks found today.',
        debug: {
          eventsChecked,
          candidatesFound,
        },
      });
    }

    await supabase.from('picks').delete().eq('result', 'Pending');

    const { data, error } = await supabase
      .from('picks')
      .insert(picksToInsert)
      .select();

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      inserted: data?.length || 0,
      picks: data || [],
      debug: {
        eventsChecked,
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
