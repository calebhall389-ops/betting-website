export const MAJOR_BOOK_KEYS = [
  'draftkings',
  'fanduel',
  'betmgm',
  'caesars',
  'espnbet',
  'betrivers',
  'hardrockbet',
] as const;

export const MAJOR_BOOK_SET = new Set<string>(MAJOR_BOOK_KEYS);

export const MAJOR_SPORTS = [
  'baseball_mlb',
  'basketball_nba',
  'americanfootball_nfl',
  'icehockey_nhl',
  'basketball_ncaab',
  'americanfootball_ncaaf',
] as const;

export const MAJOR_SPORTS_SET = new Set<string>(MAJOR_SPORTS);
