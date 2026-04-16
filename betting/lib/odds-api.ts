export type SupportedSport = {
  key: string;
  group: string;
  title: string;
  active: boolean;
  has_outrights?: boolean;
};

export const ALLOWED_SPORT_KEYS = [
  'baseball_mlb',
  'basketball_nba',
  'americanfootball_nfl',
  'icehockey_nhl',
  'mma_mixed_martial_arts',
  'soccer_epl',
  'soccer_usa_mls',
  'basketball_wnba',
  'golf_pga_championship_winner',
  'motorsport_nascar_cup',
];

export const SPORT_NAME_MAP: Record<string, string> = {
  baseball_mlb: 'MLB',
  basketball_nba: 'NBA',
  americanfootball_nfl: 'NFL',
  icehockey_nhl: 'NHL',
  mma_mixed_martial_arts: 'MMA',
  soccer_epl: 'Soccer (EPL)',
  soccer_usa_mls: 'Soccer (MLS)',
  basketball_wnba: 'WNBA',
  golf_pga_championship_winner: 'Golf',
  motorsport_nascar_cup: 'NASCAR',
};

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

function requireApiKey() {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    throw new Error('Missing ODDS_API_KEY');
  }

  return apiKey;
}

export async function fetchAvailableSports(): Promise<SupportedSport[]> {
  const apiKey = requireApiKey();

  const res = await fetch(
    `${ODDS_API_BASE}/sports?apiKey=${apiKey}&all=true`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load sports: ${text}`);
  }

  const sports = (await res.json()) as SupportedSport[];

  return sports
    .filter((sport) => ALLOWED_SPORT_KEYS.includes(sport.key))
    .sort((a, b) => {
      const aLabel = SPORT_NAME_MAP[a.key] || a.title;
      const bLabel = SPORT_NAME_MAP[b.key] || b.title;
      return aLabel.localeCompare(bLabel);
    });
}

export async function fetchOddsForSport(sportKey: string) {
  const apiKey = requireApiKey();

  const markets =
    sportKey === 'golf_pga_championship_winner' ||
    sportKey === 'motorsport_nascar_cup'
      ? 'outrights'
      : 'h2h,spreads,totals';

  const params = new URLSearchParams({
    apiKey,
    regions: 'us',
    markets,
    oddsFormat: 'american',
  });

  const res = await fetch(
    `${ODDS_API_BASE}/sports/${sportKey}/odds?${params.toString()}`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load odds for ${sportKey}: ${text}`);
  }

  return res.json();
}

  return await res.json();
}
