'use client';

import { useState } from 'react';
import { mockPicks, mockProps, mockOdds } from '@/lib/mock-data';
import { cn, getSportColor, getResultBadge, formatOdds, formatDate } from '@/lib/utils';
import { Pick, Prop, OddsEntry, Sport, BetType, PickResult } from '@/lib/types';
import { Plus, Pencil, Trash2, Target, TrendingUp, BarChart2, CheckCircle2, X } from 'lucide-react';

type ActiveTab = 'picks' | 'props' | 'odds';

const SPORTS: Sport[] = ['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'Soccer'];
const BET_TYPES: BetType[] = ['spread', 'moneyline', 'over/under', 'prop', 'parlay'];
const RESULTS: PickResult[] = ['pending', 'win', 'loss', 'push'];

const defaultPick: Omit<Pick, 'id'> = {
  sport: 'NFL', game: '', home_team: '', away_team: '', bet_type: 'spread',
  pick: '', odds: -110, confidence: 3, analysis: '', result: 'pending',
  game_date: new Date().toISOString().split('T')[0], units: 1.0,
};

export default function AdminPage() {
  const [tab, setTab] = useState<ActiveTab>('picks');
  const [picks, setPicks] = useState<Pick[]>(mockPicks);
  const [showPickForm, setShowPickForm] = useState(false);
  const [pickForm, setPickForm] = useState<Omit<Pick, 'id'>>(defaultPick);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function handlePickSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      setPicks((prev) => prev.map((p) => p.id === editingId ? { ...pickForm, id: editingId } : p));
      showToast('Pick updated successfully');
    } else {
      const newPick: Pick = { ...pickForm, id: Date.now().toString() };
      setPicks((prev) => [newPick, ...prev]);
      showToast('Pick added successfully');
    }
    setShowPickForm(false);
    setEditingId(null);
    setPickForm(defaultPick);
  }

  function handleEditPick(pick: Pick) {
    const { id, ...rest } = pick;
    setPickForm(rest);
    setEditingId(id);
    setShowPickForm(true);
  }

  function handleDeletePick(id: string) {
    setPicks((prev) => prev.filter((p) => p.id !== id));
    showToast('Pick removed');
  }

  const tabs = [
    { key: 'picks' as const, label: 'Picks', icon: Target, count: picks.length },
    { key: 'props' as const, label: 'Props', icon: TrendingUp, count: mockProps.length },
    { key: 'odds' as const, label: 'Odds', icon: BarChart2, count: mockOdds.length },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {toast && (
        <div className="fixed top-20 right-4 z-50 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-slate-900 px-4 py-3 text-sm text-emerald-400 shadow-xl animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
        <p className="text-sm text-slate-500 mt-1">Manage picks, props, and odds</p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-slate-800 pb-0">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all',
              tab === key
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            )}
          >
            <Icon size={15} />
            {label}
            <span className={cn(
              'rounded-full px-1.5 py-0.5 text-xs font-semibold',
              tab === key ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
            )}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {tab === 'picks' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-400">{picks.length} picks total</h2>
            <button
              onClick={() => { setPickForm(defaultPick); setEditingId(null); setShowPickForm(true); }}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-400 transition-colors"
            >
              <Plus size={14} /> Add Pick
            </button>
          </div>

          {showPickForm && (
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">{editingId ? 'Edit Pick' : 'New Pick'}</h3>
                <button onClick={() => { setShowPickForm(false); setEditingId(null); }} className="text-slate-500 hover:text-white">
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handlePickSubmit} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Sport</label>
                  <select value={pickForm.sport} onChange={(e) => setPickForm({ ...pickForm, sport: e.target.value as Sport })}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500">
                    {SPORTS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-400 mb-1 block">Game</label>
                  <input type="text" required placeholder="e.g. Chiefs vs Ravens" value={pickForm.game}
                    onChange={(e) => setPickForm({ ...pickForm, game: e.target.value })}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500 placeholder:text-slate-600" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Away Team</label>
                  <input type="text" required value={pickForm.away_team}
                    onChange={(e) => setPickForm({ ...pickForm, away_team: e.target.value })}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500 placeholder:text-slate-600" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Home Team</label>
                  <input type="text" required value={pickForm.home_team}
                    onChange={(e) => setPickForm({ ...pickForm, home_team: e.target.value })}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500 placeholder:text-slate-600" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Bet Type</label>
                  <select value={pickForm.bet_type} onChange={(e) => setPickForm({ ...pickForm, bet_type: e.target.value as BetType })}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500">
                    {BET_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Pick</label>
                  <input type="text" required placeholder="e.g. Chiefs -3" value={pickForm.pick}
                    onChange={(e) => setPickForm({ ...pickForm, pick: e.target.value })}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500 placeholder:text-slate-600" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Odds</label>
                  <input type="number" required value={pickForm.odds}
                    onChange={(e) => setPickForm({ ...pickForm, odds: parseInt(e.target.value) })}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Units</label>
                  <input type="number" step="0.5" min="0.5" required value={pickForm.units}
                    onChange={(e) => setPickForm({ ...pickForm, units: parseFloat(e.target.value) })}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Confidence (1-5)</label>
                  <input type="number" min="1" max="5" required value={pickForm.confidence}
                    onChange={(e) => setPickForm({ ...pickForm, confidence: parseInt(e.target.value) })}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Result</label>
                  <select value={pickForm.result} onChange={(e) => setPickForm({ ...pickForm, result: e.target.value as PickResult })}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500">
                    {RESULTS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Game Date</label>
                  <input type="date" required value={pickForm.game_date}
                    onChange={(e) => setPickForm({ ...pickForm, game_date: e.target.value })}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500" />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="text-xs text-slate-400 mb-1 block">Analysis</label>
                  <textarea required rows={3} value={pickForm.analysis}
                    onChange={(e) => setPickForm({ ...pickForm, analysis: e.target.value })}
                    placeholder="Explain the reasoning behind this pick..."
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 focus:outline-none focus:border-emerald-500 placeholder:text-slate-600 resize-none" />
                </div>
                <div className="sm:col-span-2 lg:col-span-3 flex gap-3">
                  <button type="submit"
                    className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-400 transition-colors">
                    {editingId ? 'Update Pick' : 'Add Pick'}
                  </button>
                  <button type="button" onClick={() => { setShowPickForm(false); setEditingId(null); }}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-5 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-800/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Pick</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Game</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Odds</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Units</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Result</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {picks.map((pick) => (
                    <tr key={pick.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded border', getSportColor(pick.sport))}>
                            {pick.sport}
                          </span>
                          <span className="text-sm font-medium text-white">{pick.pick}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-slate-400">{pick.game}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={cn('text-sm font-semibold', pick.odds > 0 ? 'text-emerald-400' : 'text-slate-300')}>
                          {formatOdds(pick.odds)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-sm text-slate-300">{pick.units}u</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded border capitalize', getResultBadge(pick.result))}>
                          {pick.result}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-xs text-slate-500">{formatDate(pick.game_date)}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleEditPick(pick)}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-700 hover:text-white transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDeletePick(pick.id)}
                            className="rounded p-1.5 text-slate-500 hover:bg-red-500/20 hover:text-red-400 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'props' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Player</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Stat / Line</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Pick</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Odds</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Result</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {mockProps.map((prop) => (
                  <tr key={prop.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3.5">
                      <div>
                        <p className="text-sm font-medium text-white">{prop.player}</p>
                        <p className="text-xs text-slate-500">{prop.team}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-sm text-slate-300">{prop.stat}</p>
                      <p className="text-xs text-slate-500">{prop.line}</p>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={cn(
                        'text-xs font-bold px-2 py-0.5 rounded border uppercase',
                        prop.recommendation === 'over'
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-red-500/15 text-red-400 border-red-500/30'
                      )}>
                        {prop.recommendation}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={cn('text-sm font-semibold',
                        (prop.recommendation === 'over' ? prop.over_odds : prop.under_odds) > 0
                          ? 'text-emerald-400' : 'text-slate-300'
                      )}>
                        {formatOdds(prop.recommendation === 'over' ? prop.over_odds : prop.under_odds)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded border capitalize', getResultBadge(prop.result))}>
                        {prop.result}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-xs text-slate-500">{formatDate(prop.game_date)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'odds' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Matchup</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Sport</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Spread</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Moneyline</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {mockOdds.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3.5">
                      <p className="text-sm text-white">{entry.away_team} @ {entry.home_team}</p>
                      <p className="text-xs text-slate-500">{entry.game_time}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded border', getSportColor(entry.sport))}>
                        {entry.sport}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center text-xs text-slate-300">
                      {entry.spread_away > 0 ? '+' : ''}{entry.spread_away} / {entry.spread_home > 0 ? '+' : ''}{entry.spread_home}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-xs text-slate-300">{formatOdds(entry.moneyline_away)} / {formatOdds(entry.moneyline_home)}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-xs text-slate-300">O/U {entry.total}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-xs text-slate-500">{formatDate(entry.game_date)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
