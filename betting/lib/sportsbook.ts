export const MAJOR_BOOKMAKERS = [
  'draftkings',
  'fanduel',
  'betmgm',
  'caesars',
  'espnbet',
  'fanatics',
  'pinnacle',
] as const;

export const MAJOR_BOOK_SET = new Set<string>(MAJOR_BOOKMAKERS);

export const MAJOR_SPORTS = [
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
] as const;

export const MAJOR_SPORTS_SET = new Set<string>(MAJOR_SPORTS);
