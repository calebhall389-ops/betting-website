import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/* ---------------- TYPES ---------------- */

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

/* ---------------- SUPABASE ---------------- */

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase env vars');
  }

  return createClient(url, key);
}

/* ---------------- BOOKMAKER LOCK ---------------- */

function getSharpBookmakerKeys() {
  return [
    'fanduel',
    'draftkings',
    'betmgm',
    'caesars',
    'espnbet',
  ];
}

/* ---------------- HELPERS ---------------- */

function americanToImpliedProbability(odds: number) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function decimalFromAmerican(odds: number) {
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

function expectedValue(p: number, odds: number) {
  const dec = decimalFromAmerican(odds);
  return p * (dec - 1) - (1 - p);
}

function formatOdds(odds: number) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function normalizeSportLabel(sport: string) {
  const s = sport.toUpperCase();
  if (s.includes('BASEBALL')) return 'MLB';
  if (s.includes('NBA')) return 'NBA';
  if (s.includes('HOCKEY')) return 'NHL';
  if (s.includes('NFL')) return 'NFL';
  return sport;
}

/* ---------------- DATE FILTER ---------------- */

function getWindow() {
  const now = new Date();

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function isValidGame(time: string) {
  const d = new Date(time);
  const { start, end } = getWindow();
  return d >= start && d <= end;
}

/* ---------------- MODEL ---------------- */

function estimateModelProbability(
  consensus: number,
  best: number
) {
  const edgeSignal = consensus - best;
  let p = consensus + edgeSignal * 0.65;
  return Math.max(0.02, Math.min(0.85, p));
}

function getRating(p: number, edge: number, ev: number, odds: number) {
  if (p >= 0.54 && edge >= 0.03 && ev >= 0.08 && odds <= 180 && odds >= -180) {
    return 'MAX PLAY';
  }
  if (p >= 0.5 && edge >= 0.02 && ev >= 0.05) {
    return 'A PLAY';
  }
  if (p >= 0.1 && edge >= 0.01 && ev >= 0.03) {
    return 'B PLAY';
  }
  return 'PASS';
}

/* ---------------- FETCH ---------------- */

async function fetchOdds(sport: string) {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error('Missing ODDS_API_KEY');

  const url =
    `https://api.the-odds-api.com/v4/sports/${sport}/odds` +
    `?apiKey=${key}` +
    `&regions=us` +
    `&markets=h2h` +
    `&oddsFormat=american` +
    `&bookmakers=${getSharpBookmakerKeys().join(',')}`;

  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

/* ---------------- MAIN ---------------- */

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

    let events: OddsApiEvent[] = [];

    for (const s of sports) {
      const data = await fetchOdds(s);
      events.push(...data);
    }

    const filtered = events.filter(
      (e) => e.commence_time && isValidGame(e.commence_time)
    );

    const picks: any[] = [];

    for (const event of filtered) {
      if (!event.bookmakers || event.bookmakers.length < 2) continue;

      const sides: any = {};

      for (const b of event.bookmakers) {
        const m = b.markets.find((m) => m.key === 'h2h');
        if (!m) continue;

        for (const o of m.outcomes) {
          if (!sides[o.name]) {
            sides[o.name] = {
              prices: [],
              best: o.price,
              book: b.title,
            };
          }

          sides[o.name].prices.push(o.price);

          if (o.price > sides[o.name].best) {
            sides[o.name].best = o.price;
            sides[o.name].book = b.title;
          }
        }
      }

      for (const [team, data] of Object.entries(sides)) {
        if (data.prices.length < 2) continue;

        const consensus =
          data.prices
            .map(americanToImpliedProbability)
            .reduce((a, b) => a + b, 0) / data.prices.length;

        const bestProb = americanToImpliedProbability(data.best);

        const model = estimateModelProbability(consensus, bestProb);
        const edge = model - bestProb;
        const ev = expectedValue(model, data.best);

        // 🔥 SHARP FILTERS
        if (model < 0.1) continue;
        if (edge < 0.01) continue;
        if (ev < 0.03) continue;
        if (data.best > 350) continue;
        if (data.best < -200) continue;

        const rating = getRating(model, edge, ev, data.best);
        if (rating === 'PASS') continue;

        picks.push({
          sport: normalizeSportLabel(event.sport_title),
          game: `${event.away_team} at ${event.home_team}`,
          pick: `${team} ML`,
          odds: data.best,
          confidence: Math.round(model * 100),
          stake: 10,
          result: 'pending',
          sportsbook: data.book,
          edge: +(edge * 100).toFixed(2),
          ev: +(ev * 100).toFixed(2),
          analysis:
            `${team} ML shows value. Best price ${formatOdds(data.best)} at ${data.book}. ` +
            `Model ${(model * 100).toFixed(2)}% vs market ${(bestProb * 100).toFixed(2)}%.`,
          game_time: event.commence_time,
          play_rating: rating,
        });
      }
    }

    picks.sort((a, b) => b.ev - a.ev);

    const final = picks.slice(0, 5);

    // clear old
    const { start, end } = getWindow();

    await supabase
      .from('picks')
      .delete()
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    const { data, error } = await supabase
      .from('picks')
      .insert(final)
      .select();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      inserted: data.length,
      picks: data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
}
