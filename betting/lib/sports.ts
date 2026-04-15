export type SupportedSport = {
  key: string;
  group: string;
  title: string;
  active: boolean;
  has_outrights?: boolean;
};

export const DEFAULT_SPORTS = [
  'baseball_mlb',
  'basketball_nba',
  'basketball_ncaab',
  'basketball_wnba',
  'icehockey_nhl',
  'americanfootball_nfl',
  'americanfootball_ncaaf',
  'soccer_epl',
  'soccer_usa_mls',
  'mma_mixed_martial_arts',
];
export const EXCLUDED_SPORTS_PREFIXES = [
  'politics_',
];
export const USE_WHITELIST_ONLY = true;
