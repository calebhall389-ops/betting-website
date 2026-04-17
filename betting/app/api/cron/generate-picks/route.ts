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

type SidePriceData = {
  prices: number[];
  bestPrice: number;
  bestBook: string;
};

type SideMap = Record<string, SidePriceData>;

type PickInsert = {
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: number;
  stake: number;
  result: string;
  analysis: string;
  sportsbook: string;
  edge: number;
  ev: number;
  game_time: string;
  play_rating: string;
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

function getOddsApiKey() {
  const key = process.env.ODDS_API_KEY;
  if (!key) {
    throw new Error('Missing ODDS_API_KEY');
  }
  return key;
}

function americanToImpliedProbability(odds: number): number {
  if (odds > 0) {
    return 100 / (odds + 100);
  }
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function americanToDecimal(odds: number): number {
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

function decimalToAmerican(decimalOdds: number): number {
  if (decimalOdds >= 2) {
    return Math.round((decimalOdds - 1) * 100);
  }
  return Math.round(-100 / (decimalOdds - 1));
}

function normalizeProbabilities(rawProbs: number[]): number[] {
  const sum = rawProbs.reduce((acc, p) => acc + p, 0);
  if (sum <= 0) return rawProbs;
  return rawProbs.map((p) => p / sum);
}

function getSportLabel(sportKey: string, sportTitle: string): string {
  const key = sportKey.toLowerCase();

  if (key.includes('baseball_mlb')) return 'MLB';
  if (key.includes('basketball_nba')) return 'NBA';
  if (key.includes('icehockey_nhl')) return 'NHL';
  if (key.includes('americanfootball_nfl')) return 'NFL';
  if (key.includes('basketball_ncaab')) return 'NCAAB';
  if (key.includes('americanfootball_ncaaf')) return 'NCAAF';

  return sportTitle;
}

function isWithinCurrentOrNextDay(commenceTime: string) {
  const now = new Date();
  const eventDate = new Date(commenceTime);

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const endOfTomorrow = new Date(startOfToday);
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 2);
  endOfTomorrow.setMilliseconds(-1);

  return eventDate >= startOfToday && eventDate <= endOfTomorrow;
}

function getAllowedBookmakers(): string[] {
  return [
    'draftkings',
    'fanduel',
    'betmgm',
    'caesars',
    'espnbet',
    'betrivers',
    'pointsbetus',
    'ballybet',
    'fliff',
    'hardrockbet',
    'betonlineag',
    'lowvig',
    'betparx',
    'windcreek',
    'thescorebet',
  ];
}

function buildSidesFromBookmakers(bookmakers: OddsBookmaker[] | undefined): SideMap {
  const sides: SideMap = {};

  if (!bookmakers || bookmakers.length === 0) return sides;

  for (const bookmaker of bookmakers) {
    for (const market of bookmaker.markets || []) {
      if (market.key !== 'h2h') continue;

      for (const outcome of market.outcomes || []) {
        if (typeof outcome.price !== 'number' || !Number.isFinite(outcome.price)) {
          continue;
        }

        if (!sides[outcome.name]) {
          sides[outcome.name] = {
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
  }

  return sides;
}

function getConsensusFairOdds(sideName: string, sides: SideMap): {
  fairProbability: number;
  fairAmericanOdds: number;
} | null {
  const entries = Object.entries(sides);

  if (entries.length < 2) return null;

  const rawProbs: number[] = [];
  const sideNames: string[] = [];

  for (const [name, data] of entries) {
    if (!data.prices.length) continue;

    const avgImplied =
      data.prices
        .map((price) => americanToImpliedProbability(price))
        .reduce((sum, p) => sum + p, 0) / data.prices.length;

    rawProbs.push(avgImplied);
    sideNames.push(name);
  }

  if (rawProbs.length < 2) return null;

  const normalized = normalizeProbabilities(rawProbs);
  const idx = sideNames.findIndex((name) => name === sideName);

  if (idx === -1) return null;

  const fairProbability = normalized[idx];
  const fairAmericanOdds = decimalToAmerican(1 / fairProbability);

  return {
    fairProbability,
    fairAmericanOdds,
  };
}

function getPlayRating(edge: number, ev: number): string {
  if (edge >= 6 && ev >= 10) return 'MAX PLAY';
  if (edge >= 4 && ev >= 6) return 'A PLAY';
  if (edge >= 3 && ev >= 4) return 'B PLAY';
  return 'NO PLAY';
}

function getStakeUnits(playRating: string): number {
  switch (playRating) {
    case 'MAX PLAY':
      return 3;
    case 'A PLAY':
      return 2;
    case 'B PLAY':
      return 1;
    default:
      return 0;
  }
}

async function fetchOddsForSport(
  sport: string,
  apiKey: string,
  bookmakers: string[]
): Promise<OddsEvent[]> {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);

  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('regions', 'us');
  url.searchParams.set('markets', 'h2h');
  url.searchParams.set('oddsFormat', 'american');
  url.searchParams.set('bookmakers', bookmakers.join(','));

  const res = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API failed for ${sport}: ${text}`);
  }

  const data = (await res.json()) as OddsEvent[];
  return Array.isArray(data) ? data : [];
}

export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    const bearer = authHeader?.replace('Bearer ', '');

    if (cronSecret && bearer !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    const apiKey = getOddsApiKey();
    const allowedBookmakers = getAllowedBookmakers();

    const sportsToCheck = [
      'baseball_mlb',
      'basketball_nba',
      'icehockey_nhl',
      'americanfootball_nfl',
    ];

    const allEvents: OddsEvent[] = [];

    for (const sport of sportsToCheck) {
      try {
        const events = await fetchOddsForSport(sport, apiKey, allowedBookmakers);
        allEvents.push(...events);
      } catch (sportError) {
        console.error(`Failed loading ${sport}:`, sportError);
      }
    }

    const filteredEvents = allEvents.filter((event) =>
      isWithinCurrentOrNextDay(event.commence_time)
    );

    const picks: PickInsert[] = [];

    for (const event of filteredEvents) {
      const sides = buildSidesFromBookmakers(event.bookmakers);

      for (const [team, data] of Object.entries(sides)) {
        if (!Array.isArray(data.prices) || data.prices.length < 2) continue;

        const bestPrice = data.bestPrice;
        const bestBook = data.bestBook;

        // Optional pricing cleanup:
        // skip weak mid-range prices to avoid lots of junk plays
        if (bestPrice > -150 && bestPrice < 120) {
          continue;
        }

        const fair = getConsensusFairOdds(team, sides);
        if (!fair) continue;

        const modelProb = fair.fairProbability;
        const marketProb = americanToImpliedProbability(bestPrice);

        const edge = (modelProb - marketProb) * 100;
        const ev =
          (modelProb * (americanToDecimal(bestPrice) - 1) - (1 - modelProb)) * 100;

        const playRating = getPlayRating(edge, ev);
        if (playRating === 'NO PLAY') continue;

        const stake = getStakeUnits(playRating);
        if (stake <= 0) continue;

        const sport = getSportLabel(event.sport_key, event.sport_title);
        const game = `${event.away_team} at ${event.home_team}`;
        const pick = `${team} ML`;
        const confidence = Math.round(modelProb * 100);

        const analysis = [
          `${team} moneyline shows value versus the consensus market.`,
          `Best price found: ${bestPrice > 0 ? `+${bestPrice}` : bestPrice} at ${bestBook}.`,
          `Model win probability: ${(modelProb * 100).toFixed(2)}%.`,
          `Market implied probability: ${(marketProb * 100).toFixed(2)}%.`,
          `Estimated edge: ${edge.toFixed(2)}%.`,
          `Estimated EV: ${ev.toFixed(2)}%.`,
          `Play rating: ${playRating}.`,
        ].join(' ');

        picks.push({
          sport,
          game,
          pick,
          odds: bestPrice,
          confidence,
          stake,
          result: 'pending',
          analysis,
          sportsbook: bestBook,
          edge: Number(edge.toFixed(2)),
          ev: Number(ev.toFixed(2)),
          game_time: event.commence_time,
          play_rating: playRating,
        });
      }
    }

    // highest-quality picks first
    picks.sort((a, b) => {
      if (b.ev !== a.ev) return b.ev - a.ev;
      if (b.edge !== a.edge) return b.edge - a.edge;
      return b.confidence - a.confidence;
    });

    // avoid duplicate picks for same game + side
    const deduped = picks.filter((pick, index, arr) => {
      return (
        arr.findIndex(
          (p) => p.game === pick.game && p.pick === pick.pick && p.odds === pick.odds
        ) === index
      );
    });

    // cap the board so your page stays sharp
    const finalPicks = deduped.slice(0, 10);

    // clear only pending picks for today/tomorrow so you can regenerate cleanly
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const endOfTomorrow = new Date(startOfToday);
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 2);
    endOfTomorrow.setMilliseconds(-1);

    const { error: deleteError } = await supabase
      .from('picks')
      .delete()
      .eq('result', 'pending')
      .gte('game_time', startOfToday.toISOString())
      .lte('game_time', endOfTomorrow.toISOString());

    if (deleteError) {
      throw new Error(`Supabase delete failed: ${deleteError.message}`);
    }

    if (finalPicks.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying sharp picks found today.',
        debug: {
          eventsChecked: filteredEvents.length,
          candidatesFound: 0,
        },
      });
    }

    const { data: insertedRows, error: insertError } = await supabase
      .from('picks')
      .insert(finalPicks)
      .select();

    if (insertError) {
      throw new Error(`Supabase insert failed: ${insertError.message}`);
    }

    return NextResponse.json({
      success: true,
      inserted: insertedRows?.length || 0,
      picks: insertedRows || [],
      debug: {
        eventsChecked: filteredEvents.length,
        candidatesFound: picks.length,
        finalPicks: finalPicks.length,
      },
    });
  } catch (error) {
    console.error('Generate picks error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
