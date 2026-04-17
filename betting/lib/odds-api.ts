export type SupportedSport = {
  key: string;
  group: string;
  title: string;
  active: boolean;
  has_outrights?: boolean;
};

export type OddsEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{
    key: string;
    title: string;
    last_update?: string;
    markets?: Array<{
      key: string;
      outcomes?: Array<{
        name: string;
        price: number;
        point?: number;
        description?: string;
      }>;
    }>;
  }>;
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

export const MAJOR_BOOKMAKERS = [
  'draftkings',
  'fanduel',
  'betmgm',
  'caesars',
  'espnbet',
  'fanatics',
  'pinnacle',
];

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

export async function fetchOddsForSport(
  sportKey: string
): Promise<OddsEvent[]> {
  const apiKey = requireApiKey();

  const markets =
    sportKey === 'golf_pga_championship_winner' ||
    sportKey === 'motorsport_nascar_cup'
      ? 'outrights'
      : 'h2h,spreads,totals';

  const params = new URLSearchParams({
    apiKey,
    bookmakers: MAJOR_BOOKMAKERS.join(','),
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

  return (await res.json()) as OddsEvent[];
}

export const PLAYER_PROP_MARKETS_BY_SPORT: Record<string, string[]> = {
  basketball_nba: [
    'player_points',
    'player_rebounds',
    'player_assists',
    'player_threes',
  ],
  americanfootball_nfl: [
    'player_pass_yds',
    'player_rush_yds',
    'player_reception_yds',
    'player_receptions',
  ],
  baseball_mlb: [
    'pitcher_strikeouts',
    'batter_hits',
    'batter_total_bases',
    'batter_runs_scored',
  ],
  icehockey_nhl: [
    'player_points',
    'player_assists',
    'player_shots_on_goal',
    'player_goals',
  ],
};

export function getDisplaySportFromKey(sportKey: string) {
  return SPORT_NAME_MAP[sportKey] || sportKey;
}

export function getPropLabel(marketKey: string) {
  const labels: Record<string, string> = {
    player_points: 'Points',
    player_rebounds: 'Rebounds',
    player_assists: 'Assists',
    player_threes: 'Three-Pointers Made',
    player_pass_yds: 'Passing Yards',
    player_rush_yds: 'Rushing Yards',
    player_reception_yds: 'Receiving Yards',
    player_receptions: 'Receptions',
    pitcher_strikeouts: 'Strikeouts',
    batter_hits: 'Hits',
    batter_total_bases: 'Total Bases',
    batter_runs_scored: 'Runs Scored',
    player_shots_on_goal: 'Shots on Goal',
    player_goals: 'Goals',
  };

  return labels[marketKey] || marketKey;
}

export async function fetchPlayerPropsForEvent(
  sportKey: string,
  eventId: string,
  markets?: string[]
): Promise<OddsEvent> {
  const apiKey = requireApiKey();
  const selectedMarkets =
    markets && markets.length > 0
      ? markets
      : PLAYER_PROP_MARKETS_BY_SPORT[sportKey] || [];

  if (selectedMarkets.length === 0) {
    throw new Error(`No supported prop markets configured for ${sportKey}`);
  }

  const params = new URLSearchParams({
    apiKey,
    bookmakers: MAJOR_BOOKMAKERS.join(','),
    markets: selectedMarkets.join(','),
    oddsFormat: 'american',
  });

  const res = await fetch(
    `${ODDS_API_BASE}/sports/${sportKey}/events/${eventId}/odds?${params.toString()}`,
    {
      method: 'GET',
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Failed to load player props for ${sportKey}/${eventId}: ${text}`
    );
  }

  return (await res.json()) as OddsEvent;
}
