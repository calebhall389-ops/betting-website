import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type PickRow = {
  id: string;
  created_at: string;
  sport: string;
  game: string;
  pick: string;
  odds: number;
  confidence: string | number;
  stake: number;
  result: string;
  profit: number | null;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error('Missing Supabase public environment variables');
  }

  return createClient(url, anon);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export default async function HomePage() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('picks')
    .select(
      'id,created_at,sport,game,pick,odds,confidence,stake,result,profit'
    )
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return (
      <main className="p-6">
        <h1 className="text-3xl font-bold mb-4">Betting Dashboard</h1>
        <p className="text-red-600">Error loading picks: {error.message}</p>
      </main>
    );
  }

  const picks = (data ?? []) as PickRow[];

  const graded = picks.filter(
    (pick) =>
      pick.result === 'win' ||
      pick.result === 'loss' ||
      pick.result === 'push'
  );

  const wins = graded.filter((pick) => pick.result === 'win').length;
  const losses = graded.filter((pick) => pick.result === 'loss').length;
  const pushes = graded.filter((pick) => pick.result === 'push').length;
  const pending = picks.filter((pick) => pick.result === 'pending').length;

  const totalStake = graded.reduce(
    (sum, pick) => sum + Number(pick.stake ?? 0),
    0
  );

  const totalProfit = graded.reduce(
    (sum, pick) => sum + Number(pick.profit ?? 0),
    0
  );

  const totalBets = graded.length;
  const winRate = totalBets > 0 ? (wins / totalBets) * 100 : 0;
  const roi = totalStake > 0 ? (totalProfit / totalStake) * 100 : 0;

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Betting Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Automated picks, results, profit, and ROI.
          </p>
        </div>

        <Link
          href="/results"
          className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          View Full Results
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-sm text-gray-500">Graded Bets</p>
          <p className="text-2xl font-bold">{totalBets}</p>
        </div>

        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-sm text-gray-500">Wins</p>
          <p className="text-2xl font-bold">{wins}</p>
        </div>

        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-sm text-gray-500">Losses</p>
          <p className="text-2xl font-bold">{losses}</p>
        </div>

        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-sm text-gray-500">Pushes</p>
          <p className="text-2xl font-bold">{pushes}</p>
        </div>

        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold">{pending}</p>
        </div>

        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-sm text-gray-500">Profit</p>
          <p className="text-2xl font-bold">{formatMoney(totalProfit)}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-sm text-gray-500">Win Rate</p>
          <p className="text-2xl font-bold">{formatPercent(winRate)}</p>
        </div>

        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-sm text-gray-500">ROI</p>
          <p className="text-2xl font-bold">{formatPercent(roi)}</p>
        </div>
      </div>

      <div className="rounded-2xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-semibold">Latest Picks</h2>
          <Link
            href="/results"
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            See all
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="p-3">Date</th>
                <th className="p-3">Game</th>
                <th className="p-3">Pick</th>
                <th className="p-3">Odds</th>
                <th className="p-3">Stake</th>
                <th className="p-3">Result</th>
                <th className="p-3">Profit</th>
              </tr>
            </thead>
            <tbody>
              {picks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-gray-500">
                    No picks found yet.
                  </td>
                </tr>
              ) : (
                picks.map((pick) => (
                  <tr key={pick.id} className="border-t">
                    <td className="p-3">
                      {new Date(pick.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">{pick.game}</td>
                    <td className="p-3">{pick.pick}</td>
                    <td className="p-3">
                      {pick.odds > 0 ? `+${pick.odds}` : pick.odds}
                    </td>
                    <td className="p-3">
                      {formatMoney(Number(pick.stake ?? 0))}
                    </td>
                    <td className="p-3 capitalize">{pick.result}</td>
                    <td className="p-3">
                      {pick.profit === null ? '-' : formatMoney(Number(pick.profit))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
