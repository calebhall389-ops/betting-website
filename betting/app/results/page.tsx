import { createClient } from '@supabase/supabase-js';
import ResultsCharts from './ResultsCharts';

export const dynamic = 'force-dynamic';

const STARTING_BANKROLL = Number(
  process.env.NEXT_PUBLIC_BANKROLL ?? 1000
);

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

function getProfitColor(value: number | null) {
  if (value === null) return 'text-gray-500';
  if (value > 0) return 'text-green-600 font-semibold';
  if (value < 0) return 'text-red-600 font-semibold';
  return 'text-gray-600';
}

export default async function ResultsPage() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('picks')
    .select(
      'id,created_at,sport,game,pick,odds,confidence,stake,result,profit'
    )
    .order('created_at', { ascending: false })
    .limit(250);

  if (error) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold mb-4">Results</h1>
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
  const currentBankroll = STARTING_BANKROLL + totalProfit;

  const dailyMap = new Map<string, number>();

  for (const pick of graded) {
    const date = new Date(pick.created_at).toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
    });

    dailyMap.set(date, (dailyMap.get(date) ?? 0) + Number(pick.profit ?? 0));
  }

  let runningBankroll = STARTING_BANKROLL;

  const bankrollData = Array.from(dailyMap.entries())
    .sort(([a], [b]) => {
      const [aMonth, aDay] = a.split('/').map(Number);
      const [bMonth, bDay] = b.split('/').map(Number);

      return (
        new Date(2026, aMonth - 1, aDay).getTime() -
        new Date(2026, bMonth - 1, bDay).getTime()
      );
    })
    .map(([date, profit]) => {
      runningBankroll += profit;

      return {
        date,
        profit: Number(profit.toFixed(2)),
        bankroll: Number(runningBankroll.toFixed(2)),
      };
    });

  const confidenceCounts = new Map<string, number>();

  for (const pick of picks) {
    const key = String(pick.confidence ?? '1');
    confidenceCounts.set(key, (confidenceCounts.get(key) ?? 0) + 1);
  }

  const confidenceData = Array.from(confidenceCounts.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([confidence, bets]) => ({
      confidence,
      bets,
    }));

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Results Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Track wins, losses, profit, ROI, and performance trends.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-8">
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
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold">{pending}</p>
        </div>

        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-sm text-gray-500">Profit</p>
          <p className="text-2xl font-bold">{formatMoney(totalProfit)}</p>
        </div>

        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-sm text-gray-500">ROI</p>
          <p className="text-2xl font-bold">{formatPercent(roi)}</p>
        </div>

        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-sm text-gray-500">Starting Bankroll</p>
          <p className="text-2xl font-bold">{formatMoney(STARTING_BANKROLL)}</p>
        </div>

        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-sm text-gray-500">Current Bankroll</p>
          <p className="text-2xl font-bold">{formatMoney(currentBankroll)}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-sm text-gray-500">Win Rate</p>
          <p className="text-2xl font-bold">{formatPercent(winRate)}</p>
        </div>

        <div className="rounded-2xl border p-4 shadow-sm">
          <p className="text-sm text-gray-500">Pushes</p>
          <p className="text-2xl font-bold">{pushes}</p>
        </div>
      </div>

      <ResultsCharts
        profitData={bankrollData}
        confidenceData={confidenceData}
      />

      <div className="rounded-2xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold">Recent Picks</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="p-3">Date</th>
                <th className="p-3">Sport</th>
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
                  <td colSpan={8} className="p-4 text-center text-gray-500">
                    No picks found yet.
                  </td>
                </tr>
              ) : (
                picks.map((pick) => (
                  <tr key={pick.id} className="border-t">
                    <td className="p-3">
                      {new Date(pick.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">{pick.sport}</td>
                    <td className="p-3">{pick.game}</td>
                    <td className="p-3">{pick.pick}</td>
                    <td className="p-3">
                      {pick.odds > 0 ? `+${pick.odds}` : pick.odds}
                    </td>
                    <td className="p-3">
                      {formatMoney(Number(pick.stake ?? 0))}
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
      </div>
    </main>
  );
}
