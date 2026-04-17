import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type OddsEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    markets: Array<{
      key: string;
      outcomes: Array<{
        name: string;
        price: number;
      }>;
    }>;
  }>;
};

type Candidate = {
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: string;
  analysis: string;
  stake: number;
  result: string;
  sportsbook: string;
  play_rating: string;
  edge: number;
  ev: number;
  pick_date: string;
  dedupe_key: string;
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

function getBaseUrl(req: NextRequest) {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl;

  const host = req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';

  if (host) return `${proto}://${host}`;

  return 'http://localhost:3000';
}

function getArizonaYmd(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Phoenix',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getArizonaHour(date: Date) {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Phoenix',
      hour: '2-digit',
      hour12: false,
    }).format(date)
  );
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

function probToAmerican(prob: number) {
  if (prob <= 0 || prob >= 1) {
    throw new Error(`Invalid probability for conversion: ${prob}`);
  }

  if (prob >= 0.5) {
    return Math.round(-(prob / (1 - prob)) * 100);
  }

  return Math.round(((1 - prob) / prob) * 100);
}

function calcEvPercent(modelProb: number, americanOdds: number) {
  const decimalOdds =
    americanOdds > 0
      ? 1 + americanOdds / 100
      : 1 + 100 / Math.abs(americanOdds);

  const ev = modelProb * (decimalOdds - 1) - (1 - modelProb);
  return ev * 100;
}

function getPlayRating(edge: number, ev: number) {
  if (edge >= 5 && ev >= 4) return 'MAX PLAY';
  if (edge >= 3.5 && ev >= 2.5) return 'A PLAY';
  return 'B PLAY';
}

function getConfidence(modelProb: number) {
  return `${Math.round(modelProb * 100)}`;
}

function normalizeSportLabel(sportTitle: string) {
  if (sportTitle.includes('Baseball')) return 'MLB';
  if (sportTitle.includes('Basketball')) return 'NBA';
  if (sportTitle.includes('Hockey')) return 'NHL';
  if (sportTitle.includes('Football')) return 'NFL';
  return sportTitle;
}

async function fetchOddsEvents(baseUrl: string) {
  const res = await fetch(`${baseUrl}/api/odds`, {
    method: 'GET',
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch odds: ${text}`);
  }

  const json = await res.json();

  if (!json?.success || !Array.isArray(json?.data)) {
    throw new Error('Odds endpoint did not return expected data shape');
  }

  return json.data as OddsEvent[];
}

async function handleGenerate(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const baseUrl = getBaseUrl(req);
    const supabase = getSupabase();
    const events = await fetchOddsEvents(baseUrl);

    const now = new Date();
    const todayYmd = getArizonaYmd(now);
    const tomorrowYmd = addDaysYmd(now, 1);
    const allowedDates = new Set([todayYmd, tomorrowYmd]);

    const phoenixHour = getArizonaHour(now);
    const isEarly = phoenixHour < 14;

    const picksToInsert: Candidate[] = [];
    let eventsChecked = 0;
    let candidatesFound = 0;

    for (const event of events) {
      const commence = new Date(event.commence_time);
      const eventYmd = getArizonaYmd(commence);

      if (!allowedDates.has(eventYmd)) continue;

      eventsChecked += 1;

      const sides: Record<
        string,
        {
          prices: Array<{ bookKey: string; bookTitle: string; price: number }>;
        }
      > = {
        [event.home_team]: { prices: [] },
        [event.away_team]: { prices: [] },
      };

      for (const bookmaker of event.bookmakers ?? []) {
        if (!MAJOR_BOOKS.has(bookmaker.key)) continue;

        const h2hMarket = bookmaker.markets?.find((m) => m.key === 'h2h');
        if (!h2hMarket) continue;

        for (const outcome of h2hMarket.outcomes ?? []) {
          if (!sides[outcome.name]) continue;

          sides[outcome.name].prices.push({
            bookKey: bookmaker.key,
            bookTitle: bookmaker.title,
            price: outcome.price,
          });
        }
      }

      for (const [team, data] of Object.entries(sides)) {
        if (data.prices.length < 2) continue;

        const consensusProb =
          data.prices
            .map((p) => americanToImpliedProb(p.price))
            .reduce((sum, p) => sum + p, 0) / data.prices.length;

        const modelProb = Math.min(
          consensusProb + (isEarly ? 0.03 : 0.015),
          0.85
        );

        const bestPrice = data.prices.reduce((best, current) =>
          current.price > best.price ? current : best
        );

        const marketProb = americanToImpliedProb(bestPrice.price);
        const edge = (modelProb - marketProb) * 100;
        const ev = calcEvPercent(modelProb, bestPrice.price);

        if (edge < 2.5) continue;
        if (ev < 2) continue;

        const playRating = getPlayRating(edge, ev);
        const sport = normalizeSportLabel(event.sport_title);
        const game = `${event.away_team} at ${event.home_team}`;
        const pick = `${team} ML`;
        const confidence = getConfidence(modelProb);
        const fairOdds = probToAmerican(modelProb);

        const analysis =
          `${pick} shows value versus the consensus market. ` +
          `Best price found: ${bestPrice.price > 0 ? `+${bestPrice.price}` : bestPrice.price} at ${bestPrice.bookTitle}. ` +
          `Model win probability: ${(modelProb * 100).toFixed(2)}%. ` +
          `Market implied probability: ${(marketProb * 100).toFixed(2)}%. ` +
          `Estimated edge: ${edge.toFixed(2)}%. ` +
          `Estimated EV: ${ev.toFixed(2)}%. ` +
          `Fair odds: ${fairOdds > 0 ? `+${fairOdds}` : fairOdds}. ` +
          `Play rating: ${playRating}.`;

        const dedupeKey = `${game}__${pick}__${eventYmd}`;

        picksToInsert.push({
          sport,
          game,
          pick,
          odds: bestPrice.price,
          confidence,
          analysis,
          stake: 1,
          result: 'pending',
          sportsbook: bestPrice.bookTitle,
          play_rating: playRating,
          edge: Number(edge.toFixed(2)),
          ev: Number(ev.toFixed(2)),
          pick_date: eventYmd,
          dedupe_key: dedupeKey,
        });

        candidatesFound += 1;
      }
    }

    if (picksToInsert.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying sharp picks found today.',
        debug: {
          eventsChecked,
          candidatesFound,
          phoenixHour,
          modelMode: isEarly ? 'early' : 'late',
        },
      });
    }

    const { data, error } = await supabase
      .from('picks')
      .upsert(picksToInsert, {
        onConflict: 'dedupe_key',
      })
      .select();

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      inserted: data?.length ?? 0,
      picks: data ?? [],
      debug: {
        eventsChecked,
        candidatesFound,
        phoenixHour,
        modelMode: isEarly ? 'early' : 'late',
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
