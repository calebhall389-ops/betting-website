'use client';

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

type ProfitData = {
  date: string;
  profit: number;
  cumulativeProfit: number;
};

type ConfidenceData = {
  confidence: string;
  bets: number;
};

type Props = {
  profitData: ProfitData[];
  confidenceData: ConfidenceData[];
};

export default function ResultsCharts({
  profitData,
  confidenceData,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Cumulative Profit Chart */}
      <div className="rounded-2xl border p-4 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">
          Cumulative Profit
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={profitData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="cumulativeProfit"
              stroke="#16a34a"
              strokeWidth={3}
              name="Profit ($)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Confidence Distribution Chart */}
      <div className="rounded-2xl border p-4 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">
          Bets by Confidence Level
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={confidenceData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="confidence" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar
              dataKey="bets"
              fill="#2563eb"
              name="Number of Bets"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
