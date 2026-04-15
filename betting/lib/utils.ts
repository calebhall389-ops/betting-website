import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Stats, TrackedBet, Pick } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function formatSpread(spread: number): string {
  return spread > 0 ? `+${spread}` : `${spread}`;
}

export function oddsToImpliedProbability(odds: number): number {
  if (odds > 0) {
    return (100 / (odds + 100)) * 100;
  }
  return (Math.abs(odds) / (Math.abs(odds) + 100)) * 100;
}

export function calcProfit(units: number, odds: number): number {
  if (odds > 0) {
    return (units * odds) / 100;
  }
  return (units * 100) / Math.abs(odds);
}

export function computeStats(picks: Pick[]): Stats {
  const settled = picks.filter((p) => p.result !== 'pending');
  const wins = picks.filter((p) => p.result === 'win').length;
  const losses = picks.filter((p) => p.result === 'loss').length;
  const pushes = picks.filter((p) => p.result === 'push').length;
  const pending = picks.filter((p) => p.result === 'pending').length;
  const winRate = settled.length > 0 ? (wins / settled.length) * 100 : 0;

  const totalProfit = picks.reduce((sum, p) => {
    if (p.result === 'win') return sum + calcProfit(p.units, p.odds);
    if (p.result === 'loss') return sum - p.units;
    return sum;
  }, 0);

  const totalUnits = picks.reduce((sum, p) => sum + p.units, 0);
  const roi = totalUnits > 0 ? (totalProfit / totalUnits) * 100 : 0;

  return {
    totalPicks: picks.length,
    wins,
    losses,
    pushes,
    pending,
    winRate,
    totalUnits,
    totalProfit,
    roi,
  };
}

export function computeTrackerStats(bets: TrackedBet[]): Stats {
  const settled = bets.filter((b) => b.result !== 'pending');
  const wins = bets.filter((b) => b.result === 'win').length;
  const losses = bets.filter((b) => b.result === 'loss').length;
  const pushes = bets.filter((b) => b.result === 'push').length;
  const pending = bets.filter((b) => b.result === 'pending').length;
  const winRate = settled.length > 0 ? (wins / settled.length) * 100 : 0;

  const totalProfit = bets.reduce((sum, b) => sum + b.profit, 0);
  const totalUnits = bets.reduce((sum, b) => sum + b.units, 0);
  const roi = totalUnits > 0 ? (totalProfit / totalUnits) * 100 : 0;

  return {
    totalPicks: bets.length,
    wins,
    losses,
    pushes,
    pending,
    winRate,
    totalUnits,
    totalProfit,
    roi,
  };
}

export function getSportColor(sport: string): string {
  const colors: Record<string, string> = {
    NFL: 'bg-red-500/20 text-red-400 border-red-500/30',
    NBA: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    MLB: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    NHL: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    NCAAF: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    NCAAB: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    Soccer: 'bg-green-500/20 text-green-400 border-green-500/30',
  };
  return colors[sport] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
}

export function getResultColor(result: string): string {
  const colors: Record<string, string> = {
    win: 'text-emerald-400',
    loss: 'text-red-400',
    push: 'text-yellow-400',
    pending: 'text-slate-400',
  };
  return colors[result] || 'text-slate-400';
}

export function getResultBadge(result: string): string {
  const badges: Record<string, string> = {
    win: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    loss: 'bg-red-500/20 text-red-400 border-red-500/30',
    push: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    pending: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };
  return badges[result] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function isToday(dateStr: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return dateStr === today;
}
