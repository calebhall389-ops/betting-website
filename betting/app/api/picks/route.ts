import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type OddsApiOutcome = {
  name: string;
  price: number;
  point?: number;
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

type CandidatePick = {
  sport: string;
  game: string;
  pick: string;
  odds: number;
  edge: number;
  ev: number;
  confidence: number;
  stake: number;
  analysis: string;
  bookmaker: string;
  modelProbability: number;
  marketProbability: number;
  commenceTime?: string;
};

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

function requireCronSecret(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return;

  const authHeader = req.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '').trim()
    : null;

  const headerSecret = req.headers.get('x-cron-secret');

  if (bearer !== expected && headerSecret !== expected) {
    throw new Error('Unauthorized');
  }
}

function americanToImpliedProb(odds: number): number {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function americanToDecimal(odds: number): number {
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

function median(values: number[]): number {
  const arr = [...values].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);

  if (arr.length === 0) return 0;
  if (arr.length % 2 === 0) return (arr[mid - 1] + arr[mid]) / 2;
  return arr[mid];
}

function normalizeTeamName(name: string): string {
  return name.trim().toLowerCase();
}

function computeConfidence(edge: number, ev: number): number {
  const raw = 0.55 + edge * 2.2 + ev * 1.4;
  return clamp(raw, 0.55, 0.78);
}

function computeQuarterKellyStake(
  bankroll: number,
  winProb: number,
  americanOdds: number,
  fraction = 0.25
): number {
  const decimalOdds = americanToDecimal(americanOdds);
  const b = decimalOdds - 1;
  const q = 1 - winProb;

  const fullKelly = (b * winProb - q) / b;
  const fractionalKelly = Math.max(0, fullKelly) * fraction;

  const capped = clamp(fractionalKelly, 0.01, 0.03);
  return Number((bankroll * capped).toFixed(2));
}

async function fetchOddsForSport(
  sportKey: string,
  apiKey: string,
  bookmakersCsv: string
): Promise<OddsApiEvent[]> {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds`);

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

function buildCandidatesFromEvents(
  events: OddsApiEvent[],
  settings: {
    minEdge: number;
    minEv: number;
    minConfidence: number;
    minBooks: number;
    bankroll: number;
    kellyFraction: number;
  }
): CandidatePick[] {
  const candidates: CandidatePick[] = [];

  for (const event of events) {
    const bookmakers = event.bookmakers ?? [];
    const game = `${event.away_team} at ${event.home_team}`;

    const teamPrices = new Map<
      string,
      { prices: number[]; bestPrice: number; bestBookmaker: string }
    >();

    for (const bookmaker of bookmakers) {
      const market = bookmaker.markets?.find((m) => m.key === 'h2h');
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

      const consensusProb = median(data.prices.map(americanToImpliedProb));
      const bookProb = americanToImpliedProb(data.bestPrice);

      const edge = consensusProb - bookProb;
      const decimalOdds = americanToDecimal(data.bestPrice);
      const ev = consensusProb * (decimalOdds - 1) - (1 - consensusProb);
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

      const analysis = [
        `${displayTeam} moneyline shows value versus the consensus market.`,
        `Best price found: ${data.bestPrice > 0 ? `+${data.bestPrice}` : data.bestPrice} at ${data.bestBookmaker}.`,
        `Model win probability: ${(consensusProb * 100).toFixed(2)}%.`,
        `Market implied probability: ${(bookProb * 100).toFixed(2)}%.`,
        `Estimated edge: ${(edge * 100).toFixed(2)}%.`,
        `Estimated EV: ${(ev * 100).toFixed(2)}%.`,
      ].join(' ');

      candidates.push({
        sport: event.sport_title,
        game,
        pick: `${displayTeam} ML`,
        odds: data.bestPrice,
        edge,
        ev,
        confidence,
        stake,
        analysis,
        bookmaker: data.bestBookmaker,
        modelProbability: consensusProb,
        marketProbability: bookProb,
        commenceTime: event.commence_time,
      });
    });
  }

  return candidates;
}

export async function GET(req: NextRequest) {
  try {
    requireCronSecret(req);

    const oddsApiKey = process.env.ODDS_API_KEY;
    if (!oddsApiKey) {
      return NextResponse.json(
        { error: 'Missing ODDS_API_KEY env var' },
        { status: 500 }
      );
    }

    const supabase = getSupabase();

    const MIN_EDGE = Number(process.env.MIN_EDGE ?? 0.015);
    const MIN_EV = Number(process.env.MIN_EV ?? 0.02);
    const MIN_CONFIDENCE = Number(process.env.MIN_CONFIDENCE ?? 0.62);
    const MIN_BOOKS = Number(process.env.MIN_BOOKS ?? 3);
    const MAX_PICKS = Number(process.env.MAX_PICKS ?? 5);
    const BANKROLL = Number(process.env.BANKROLL ?? 1000);
    const KELLY_FRACTION = Number(process.env.KELLY_FRACTION ?? 0.25);

    const ALLOWED_BOOKMAKERS = (
      process.env.ALLOWED_BOOKMAKERS ??
      'draftkings,fanduel,betmgm,caesars,espnbet'
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const SPORT_KEYS = (
      process.env.PICK_SPORTS ??
      'basketball_nba,baseball_mlb,icehockey_nhl'
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const allEvents = (
      await Promise.all(
        SPORT_KEYS.map((sportKey) =>
          fetchOddsForSport(sportKey, oddsApiKey, ALLOWED_BOOKMAKERS.join(','))
        )
      )
    ).flat();

    const candidates = buildCandidatesFromEvents(allEvents, {
      minEdge: MIN_EDGE,
      minEv: MIN_EV,
      minConfidence: MIN_CONFIDENCE,
      minBooks: MIN_BOOKS,
      bankroll: BANKROLL,
      kellyFraction: KELLY_FRACTION,
    });

    const sorted = candidates
      .sort((a, b) => {
        if (b.ev !== a.ev) return b.ev - a.ev;
        if (b.edge !== a.edge) return b.edge - a.edge;
        return b.confidence - a.confidence;
      })
      .slice(0, MAX_PICKS);

    if (sorted.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'No qualifying EV picks found today.',
        settings: {
          MIN_EDGE,
          MIN_EV,
          MIN_CONFIDENCE,
          MIN_BOOKS,
          MAX_PICKS,
          BANKROLL,
          KELLY_FRACTION,
          ALLOWED_BOOKMAKERS,
          SPORT_KEYS,
        },
        debug: {
          eventsChecked: allEvents.length,
          candidatesFoundBeforeLimits: candidates.length,
        },
      });
    }

    const { data: existingRows, error: existingError } = await supabase
      .from('picks')
      .select('game, pick, result')
      .in('result', ['pending', 'Pending']);

    if (existingError) {
      return NextResponse.json(
        { error: `Failed reading existing picks: ${existingError.message}` },
        { status: 500 }
      );
    }

    const existingSet = new Set(
      (existingRows ?? []).map(
        (row) => `${String(row.game).trim()}__${String(row.pick).trim()}`
      )
    );

    const rowsToInsert = sorted
      .filter((pick) => !existingSet.has(`${pick.game}__${pick.pick}`))
      .map((pick) => ({
        sport: pick.sport,
        game: pick.game,
        pick: pick.pick,
        odds: pick.odds,
        confidence: `${Math.round(pick.confidence * 100)}%`,
        stake: pick.stake,
        result: 'pending',
        status: 'pending',
        analysis: pick.analysis,
        sportsbook: pick.bookmaker,
        sportsbook_key: null,
        ev: Number((pick.ev * 100).toFixed(2)),
        edge: Number((pick.edge * 100).toFixed(2)),
        model_probability: Number((pick.modelProbability * 100).toFixed(2)),
        market_probability: Number((pick.marketProbability * 100).toFixed(2)),
        model_prob: Number((pick.modelProbability * 100).toFixed(2)),
        commence_time: pick.commenceTime ?? null,
        to_win: Number(
          ((americanToDecimal(pick.odds) - 1) * pick.stake).toFixed(2)
        ),
      }));

    if (rowsToInsert.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        message: 'All qualifying picks already exist in the database.',
        picks: sorted.map((p) => ({
          sport: p.sport,
          game: p.game,
          pick: p.pick,
          odds: p.odds,
          edge: Number((p.edge * 100).toFixed(2)),
          ev: Number((p.ev * 100).toFixed(2)),
          confidence: `${Math.round(p.confidence * 100)}%`,
          stake: p.stake,
          bookmaker: p.bookmaker,
          model_probability: Number((p.modelProbability * 100).toFixed(2)),
          market_probability: Number((p.marketProbability * 100).toFixed(2)),
        })),
      });
    }

    const { data: insertedRows, error: insertError } = await supabase
      .from('picks')
      .insert(rowsToInsert)
      .select();

    if (insertError) {
      return NextResponse.json(
        { error: `Supabase insert failed: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      inserted: insertedRows?.length ?? 0,
      picks: sorted.map((p) => ({
        sport: p.sport,
        game: p.game,
        pick: p.pick,
        odds: p.odds,
        edge: Number((p.edge * 100).toFixed(2)),
        ev: Number((p.ev * 100).toFixed(2)),
        confidence: `${Math.round(p.confidence * 100)}%`,
        stake: p.stake,
        bookmaker: p.bookmaker,
        model_probability: Number((p.modelProbability * 100).toFixed(2)),
        market_probability: Number((p.marketProbability * 100).toFixed(2)),
      })),
      settings: {
        MIN_EDGE,
        MIN_EV,
        MIN_CONFIDENCE,
        MIN_BOOKS,
        MAX_PICKS,
        BANKROLL,
        KELLY_FRACTION,
        ALLOWED_BOOKMAKERS,
        SPORT_KEYS,
      },
      debug: {
        eventsChecked: allEvents.length,
        candidatesFoundBeforeLimits: candidates.length,
        rowsInserted: insertedRows?.length ?? 0,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
