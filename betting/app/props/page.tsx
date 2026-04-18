import { createClient } from '@supabase/supabase-js';
import {
  Flame,
  Star,
  BadgeDollarSign,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

type PropRow = {
  id: string;
  sport: string;
  game: string;
  player: string;
  market: string;
  line: number;
  pick_type: 'over' | 'under';
  over_odds: number | null;
  under_odds: number | null;
  best_odds: number;
  best_sportsbook: string | null;
  fair_odds?: number | null;
  ev: number;
  edge: number;
  confidence: number | string;
  implied_probability: number;
  books_compared: number;
  analysis?: string | null;
  play_rating?: 'A+' | 'A' | 'B' | 'C' | null;
  top_play?: boolean | null;
  event_date: string;
};

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function oddsText(o: number | null) {
  if (!o) return '—';
  return o > 0 ? `+${o}` : `${o}`;
}

function pct(v: number) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function formatTime(date: string) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function confidenceNum(val: number | string) {
  const n = typeof val === 'string' ? Number(val) : val;
  return Math.max(0, Math.min(100, n || 0));
}

async function getProps(): Promise<PropRow[]> {
  const supabase = getSupabase();

  const { data } = await supabase
    .from('props')
    .select('*')
    .order('top_play', { ascending: false })
    .order('ev', { ascending: false });

  return (data || []) as PropRow[];
}

function Card({ p }: { p: PropRow }) {
  const conf = confidenceNum(p.confidence);

  return (
    <div className="rounded-2xl border border-cyan-400/30 p-5 bg-slate-950/80 shadow-lg">

      {/* HEADER */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-blue-300">{p.sport}</span>
        {p.play_rating && (
          <span className="text-xs border px-2 py-0.5 rounded text-yellow-300">
            {p.play_rating}
          </span>
        )}
        {p.top_play && (
          <span className="ml-auto bg-emerald-400 text-black px-3 py-1 text-xs rounded-full font-bold">
            TOP PLAY
          </span>
        )}
      </div>

      {/* PLAYER */}
      <h2 className="text-2xl font-bold text-white">{p.player}</h2>

      <p className="text-slate-300">
        {p.pick_type.toUpperCase()} {p.line} {p.market}
      </p>

      <p className="text-sm text-slate-400">{p.game}</p>

      {/* ✅ FIXED TIME */}
      <p className="text-xs text-slate-500 mt-1">
        {formatTime(p.event_date)}
      </p>

      {/* ODDS BOX */}
      <div className="mt-4 border rounded-xl p-4 bg-slate-900">
        <div className="flex justify-between">
          <div>
            <p className="text-slate-400 text-sm">{p.market}</p>
            <p className="text-4xl font-bold text-white">{p.line}</p>
          </div>

          <div className="text-right">
            <p className="text-xs text-slate-400">BEST</p>
            <p className="text-2xl font-bold text-green-400">
              {oddsText(p.best_odds)}
            </p>
            <p className="text-xs text-slate-400">{p.best_sportsbook}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="p-2 border rounded text-center">
            Over {p.line}
            <div className="font-bold">{oddsText(p.over_odds)}</div>
          </div>
          <div className="p-2 border rounded text-center">
            Under {p.line}
            <div className="font-bold">{oddsText(p.under_odds)}</div>
          </div>
        </div>
      </div>

      {/* ✅ FIXED STATS */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">

        <div className="p-3 border rounded min-w-0">
          <p className="text-xs text-slate-400">EV</p>
          <p className="text-2xl font-bold text-green-400 break-words">
            {pct(p.ev)}
          </p>
        </div>

        <div className="p-3 border rounded min-w-0">
          <p className="text-xs text-slate-400">Edge</p>
          <p className="text-2xl font-bold break-words">
            {pct(p.edge)}
          </p>
        </div>

        <div className="p-3 border rounded min-w-0">
          <p className="text-xs text-slate-400">Implied</p>
          <p className="text-2xl font-bold break-words">
            {p.implied_probability.toFixed(1)}%
          </p>
        </div>

        <div className="p-3 border rounded min-w-0">
          <p className="text-xs text-slate-400">Fair</p>
          <p className="text-2xl font-bold break-words">
            {oddsText(p.fair_odds || null)}
          </p>
        </div>

        <div className="p-3 border rounded min-w-0 col-span-2 md:col-span-1">
          <p className="text-xs text-slate-400">Confidence</p>
          <p className="text-2xl font-bold">{conf}%</p>
        </div>
      </div>

      {/* TAGS */}
      <div className="flex gap-2 mt-4 flex-wrap">
        {p.ev >= 3 && (
          <span className="text-xs bg-orange-500/20 px-2 py-1 rounded">
            🔥 Strong EV
          </span>
        )}
        <span className="text-xs bg-green-500/20 px-2 py-1 rounded">
          💰 Best Price
        </span>
        {p.top_play && (
          <span className="text-xs bg-yellow-500/20 px-2 py-1 rounded">
            ⭐ Top Play
          </span>
        )}
      </div>

      {/* ANALYSIS */}
      <p className="text-sm text-slate-300 mt-4">
        {p.analysis}
      </p>

    </div>
  );
}

export default async function Page() {
  const props = await getProps();

  return (
    <div className="p-6 bg-black min-h-screen">
      <h1 className="text-4xl font-bold text-white mb-6">
        Player Props
      </h1>

      {props.length === 0 ? (
        <p className="text-slate-400">No props found</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {props.map((p) => (
            <Card key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
