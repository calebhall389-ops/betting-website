import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/* ================================
   SUPABASE CLIENT (SERVICE ROLE)
================================ */
function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/* ================================
   SECURITY CHECK FOR CRON
================================ */
function requireCronSecret(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return;

  const authHeader = req.headers.get('authorization');
  const bearer = authHeader?.replace('Bearer ', '').trim();
  const cronHeader = req.headers.get('x-cron-secret');

  if (bearer !== expected && cronHeader !== expected) {
    throw new Error('Unauthorized');
  }
}

/* ================================
   UTILITY FUNCTIONS
================================ */
function americanToImpliedProb(odds: number): number {
  return odds > 0
    ? 100 / (odds + 100)
    : Math.abs(odds) / (Math.abs(odds) + 100);
}

function americanToDecimal(odds: number): number {
  return odds > 0
    ? 1 + odds / 100
    : 1 + 100 / Math.abs(odds);
}

function clamp(num: number, min: number, max: number) {
  return Math.max(min, Math.min(max, num));
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function normalizeTeamName(name: string) {
  return name.trim().toLowerCase();
}

function computeConfidence(edge: number, ev: number) {
  const raw = 0.55 + edge * 2.2 + ev * 1.4;
  return clamp(raw, 0.55, 0.78);
}

function computeQuarterKellyStake(
  bankroll: number,
  winProb: number,
  americanOdds: number,
  fraction = 0.25
) {
  const decimalOdds = americanToDecimal(americanOdds);
  const b = decimalOdds - 1;
  const q = 1 - winProb;

  const fullKelly = (b * winProb - q) / b;
  const fractionalKelly = Math.max(0, fullKelly) * fraction;

  const capped = clamp(fractionalKelly, 0.01, 0.03);
  return Number((bankroll * capped).toFixed(2));
}

/* ================================
   FETCH ODDS FROM THE ODDS API
================================ */
async function fetchOddsForSport(
  sportKey: string,
  apiKey: string,
  bookmakersCsv: string
) {
  const url = new URL(
    `https://api.the-odds-api.com/v4/sports/${sportKey}/odds`
  );

  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('regions', 'us');
  url.searchParams.set('markets', 'h2h');
  url.searchParams.set('oddsFormat', 'american');
  url.searchParams.set('bookmakers', bookmakersCsv);

  const res = await fetch(url.toString(), {
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API failed for ${sportKey}: ${text}`);
  }

  return res.json();
}

/* ================================
   BUILD PICK CANDIDATES
================================ */
function buildCandidates(events: any[], settings: any) {
  const candidates: any[] = [];

  for (const event of events) {
    const bookmakers = event.bookmakers ?? [];
    const game = `${event.away_team} at ${event.home_team}`;

    const teamPrices = new Map<
      string,
      { prices: number[]; bestPrice: number; bestBookmaker: string }
    >();

    for (const bookmaker of bookmakers) {
      const market = bookmaker.markets?.find(
        (m: any) => m.key === 'h2h'
      );
      if (!market) continue;

      for (const outcome of market.outcomes ?? []) {
        const team = normalizeTeamName(outcome.name);
        const current = teamPrices.get(team);

        if (!current) {
          teamPrices.set(team, {
            prices: [outcome.price],
            bestPrice: outcome.price,
            bestBookmaker: bookmaker.title,
          });
        } else {
          current.prices.push(outcome.price);
          if (outcome.price > current.bestPrice) {
            current.bestPrice = outcome.price;
            current.bestBookmaker = bookmaker.title;
          }
        }
      }
    }

    Array.from(teamPrices.entries()).forEach(([teamName, data]) => {
      if (data.prices.length < settings.minBooks) return;

      const consensusProb = median(
        data.prices.map(americanToImpliedProb)
      );
      const bookProb = americanToImpliedProb(data.bestPrice);

      const edge = consensusProb - bookProb;
      const decimalOdds = americanToDecimal(data.bestPrice);
      const ev =
        consensusProb * (decimalOdds - 1) -
        (1 - consensusProb);

      const confidence = computeConfidence(edge, ev);

      if (
        edge < settings.minEdge ||
        ev < settings.minEv ||
        confidence < settings.minConfidence
      ) {
        return;
      }

      const displayTeam =
        teamName === normalizeTeamName(event.home_team)
          ? event.home_team
          : teamName === normalizeTeamName(event.away_team)
          ? event.away_team
          : teamName;

      const stake = computeQuarterKellyStake(
        settings.bankroll,
        consensusProb,
        data.bestPrice,
        settings.kellyFraction
      );

      candidates.push({
        sport: event.sport_title,
        game,
        pick: `${displayTeam} ML`,
        odds: data.bestPrice,
        edge,
        ev,
        confidence,
        stake,
        bookmaker: data.bestBookmaker,
        analysis: `${displayTeam} ML shows value based on consensus market pricing.`,
      });
    });
  }

  return candidates;
}

/* ================================
   API ROUTE
================================ */
export async function GET(req: NextRequest) {
  try {
    requireCronSecret(req);

    const oddsApiKey = process.env.ODDS_API_KEY;
    if (!oddsApiKey) {
      return NextResponse.json(
        { error: 'Missing ODDS_API_KEY' },
        { status: 500 }
      );
    }

    const supabase = getSupabase();

    // Medium-sharp settings
    const settings = {
      minEdge: Number(process.env.MIN_EDGE ?? 0.015),
      minEv: Number(process.env.MIN_EV ?? 0.02),
      minConfidence: Number(process.env.MIN_CONFIDENCE ?? 0.62),
      minBooks: Number(process.env.MIN_BOOKS ?? 3),
      maxPicks: Number(process.env.MAX_PICKS ?? 5),
      bankroll: Number(process.env.BANKROLL ?? 1000),
      kellyFraction: Number(process.env.KELLY_FRACTION ?? 0.25),
    };

    const bookmakers = (
      process.env.ALLOWED_BOOKMAKERS ??
      'draftkings,fanduel,betmgm,caesars,espnbet'
    ).split(',');

    const sports = (
      process.env.PICK_SPORTS ??
      'basketball_nba,baseball_mlb,icehockey_nhl'
    ).split(',');

    const eventsArrays = await Promise.all(
      sports.map((sport) =>
        fetchOddsForSport(
          sport,
          oddsApiKey,
          bookmakers.join(',')
        )
      )
    );

    const allEvents = eventsArrays.flat();

    const candidates = buildCandidates(allEvents, settings);

    const sorted = candidates
      .sort((a, b) => b.ev - a.ev)
      .slice(0, settings.maxPicks);

    if (sorted.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying EV picks found today.',
        debug: {
          eventsChecked: allEvents.length,
          candidatesFound: candidates.length,
        },
      });
    }

    // Prevent duplicates
    const { data: existing } = await supabase
      .from('picks')
      .select('game, pick')
      .eq('result', 'pending');

    const existingSet = new Set(
      (existing ?? []).map(
        (p) => `${p.game}__${p.pick}`
      )
    );

    const rowsToInsert = sorted
      .filter(
        (p) => !existingSet.has(`${p.game}__${p.pick}`)
      )
      .map((p) => ({
        sport: p.sport,
        game: p.game,
        pick: p.pick,
        odds: p.odds,
        confidence: `${Math.round(
          p.confidence * 100
        )}%`,
        stake: p.stake,
        result: 'pending',
        analysis: p.analysis,
      }));

    if (rowsToInsert.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message:
          'All qualifying picks already exist in the database.',
      });
    }

    const { data, error } = await supabase
      .from('picks')
      .insert(rowsToInsert)
      .select();

    if (error) {
      throw new Error(
        `Supabase insert failed: ${error.message}`
      );
    }

    return NextResponse.json({
      success: true,
      inserted: data?.length ?? 0,
      picks: sorted.map((p) => ({
        sport: p.sport,
        game: p.game,
        pick: p.pick,
        odds: p.odds,
        edge: Number((p.edge * 100).toFixed(2)),
        ev: Number((p.ev * 100).toFixed(2)),
        confidence: `${Math.round(
          p.confidence * 100
        )}%`,
        stake: p.stake,
        bookmaker: p.bookmaker,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
