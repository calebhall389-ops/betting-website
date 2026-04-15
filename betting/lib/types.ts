export type Sport = 'NFL' | 'NBA' | 'MLB' | 'NHL' | 'NCAAF' | 'NCAAB' | 'Soccer';

export type BetType = 'spread' | 'moneyline' | 'over/under' | 'prop' | 'parlay';

export type PickResult = 'win' | 'loss' | 'push' | 'pending';

export interface Pick {
  id: string;
  sport: Sport;
  game: string;
  home_team: string;
  away_team: string;
  bet_type: BetType;
  pick: string;
  odds: number;
  confidence: number;
  analysis: string;
  result: PickResult;
  game_date: string;
  units: number;
  created_at?: string;
}

export interface Prop {
  id: string;
  sport: Sport;
  player: string;
  team: string;
  stat: string;
  line: number;
  over_odds: number;
  under_odds: number;
  recommendation: 'over' | 'under';
  confidence: number;
  game_date: string;
  opponent: string;
  result: PickResult;
  created_at?: string;
}

export interface OddsEntry {
  id: string;
  sport: Sport;
  home_team: string;
  away_team: string;
  game_date: string;
  game_time: string;
  spread_home: number;
  spread_away: number;
  spread_home_odds: number;
  spread_away_odds: number;
  moneyline_home: number;
  moneyline_away: number;
  total: number;
  over_odds: number;
  under_odds: number;
  created_at?: string;
}

export interface TrackedBet {
  id: string;
  pick_id?: string;
  sport: Sport;
  description: string;
  bet_type: BetType;
  odds: number;
  units: number;
  result: PickResult;
  profit: number;
  date: string;
  created_at?: string;
}

export interface Stats {
  totalPicks: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  winRate: number;
  totalUnits: number;
  totalProfit: number;
  roi: number;
}
