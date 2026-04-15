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
  }).format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function getResultBadge(result: string) {
  switch (result) {
    case 'win':
      return 'bg-green-100 text-green-700';
    case 'loss':
      return 'bg-red-100 text-red-700';
    case 'push':
      return 'bg-gray-200 text-gray-700';
    case 'pending':
      return 'bg-yellow-100 text-yellow-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

function getConfidenceBadge(confidence: string | number) {
  const level = Number(confidence);
  switch (level) {
    case 3:
      return 'bg-green-100 text-green-700';
    case 2:
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-gray-200 text-gray-700';
  }
}

function getProfitColor(value: number | null) {
  if (value === null) return 'text-gray-500';
  if (value > 0) return 'text-green-600 font-semibold';
  if (value < 0) return 'text-red-600 font-semibold';
  return 'text-gray-600';
}

export default async function HomePage() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('picks')
    .select(
      'id,created_at,sport,game,pick,odds,confidence,stake,result,profit'
    )
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return (
      <main className="p-6">
        <h1 className="text-3xl font-bold mb-4">Betting Dashboard</h1>
        <p className="text-red-600">Error loading picks: {error.message}</p>
      </main>
    );
  }

  const picks = (data ?? []) as PickRow[];

  const today = new Date().toISOString().slice(0, 10);
  const todaysPicks = picks.filter(
    (pick) => pick.created_at.slice(0, 10) === today
  );

  const graded = picks.filter((pick) =>
    ['win', 'loss', 'push'].includes(pick.result)
  );

  const recentResults = graded.slice(0, 15);

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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Betting Dashboard</h1>
          <p className="text-gray-500">
            Today’s picks, tracked results, profit, and ROI.
          </p>
        </div>

        <Link
          href="/results"
          className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          View Full Results
        </Link>
      </div>

      {/* Today's Picks */}
      <section className="rounded-2xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold">Today's Picks</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left">Game</th>
                <th className="p-3 text-left">Pick</th>
                <th className="p-3 text-left">Odds</th>
                <th className="p-3 text-left">Confidence</th>
                <th className="p-3 text-left">Stake</th>
                <th className="p-3 text-left">Result</th>
              </tr>
            </thead>
            <tbody>
              {todaysPicks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-gray-500">
                    No picks generated today.
                  </td>
                </tr>
              ) : (
                todaysPicks.map((pick) => (
                  <tr key={pick.id} className="border-t">
                    <td className="p-3">{pick.game}</td>
                    <td className="p-3">{pick.pick}</td>
                    <td className="p-3">
                      {pick.odds > 0 ? `+${pick.odds}` : pick.odds}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-md text-xs font-semibold ${getConfidenceBadge(
                          pick.confidence
                        )}`}
                      >
                        {pick.confidence}
                      </span>
                    </td>
                    <td className="p-3">
                      {formatMoney(Number(pick.stake))}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-md text-xs font-semibold capitalize ${getResultBadge(
                          pick.result
                        )}`}
                      >
                        {pick.result}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Performance Metrics */}
      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Graded Bets', value: totalBets },
          { label: 'Wins', value: wins },
          { label: 'Losses', value: losses },
          { label: 'Pushes', value: pushes },
          { label: 'Pending', value: pending },
          { label: 'Profit', value: formatMoney(totalProfit) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border p-4 shadow-sm">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="text-2xl font-bold">{stat.value}</p>
          </div>
        ))}
      </section>

      {/* ROI and Win Rate */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-sm text-gray-500">Win Rate</p>
          <p className="text-2xl font-bold">
            {formatPercent(winRate)}
          </p>
        </div>
        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-sm text-gray-500">ROI</p>
          <p className="text-2xl font-bold">
            {formatPercent(roi)}
          </p>
        </div>
      </section>

      {/* Recent Results */}
      <section className="rounded-2xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold">Recent Results</h2>
          <Link
            href="/results"
            className="text-sm text-blue-600 hover:underline"
          >
            See All
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left">Game</th>
                <th className="p-3 text-left">Pick</th>
                <th className="p-3 text-left">Result</th>
                <th className="p-3 text-left">Profit</th>
              </tr>
            </thead>
            <tbody>
              {recentResults.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-gray-500">
                    No graded results yet.
                  </td>
                </tr>
              ) : (
                recentResults.map((pick) => (
                  <tr key={pick.id} className="border-t">
                    <td className="p-3">{pick.game}</td>
                    <td className="p-3">{pick.pick}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-md text-xs font-semibold capitalize ${getResultBadge(
                          pick.result
                        )}`}
                      >
                        {pick.result}
                      </span>
                    </td>
                    <td className={`p-3 ${getProfitColor(pick.profit)}`}>
                      {pick.profit === null
                        ? '-'
                        : formatMoney(Number(pick.profit))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
