'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

type ChartRow = {
  date: string;
  profit: number;
  cumulativeProfit: number;
};

type ConfidenceRow = {
  confidence: string;
  bets: number;
};

type Props = {
  profitData: ChartRow[];
  confidenceData: ConfidenceRow[];
};

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export default function ResultsCharts({
  profitData,
  confidenceData,
}: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Cumulative Profit</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={profitData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis tickFormatter={(value) => `$${value}`} />
              <Tooltip formatter={(value: number) => formatMoney(value)} />
              <Line
                type="monotone"
                dataKey="cumulativeProfit"
                strokeWidth={3}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Profit by Day</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={profitData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis tickFormatter={(value) => `$${value}`} />
              <Tooltip formatter={(value: number) => formatMoney(value)} />
              <Bar dataKey="profit" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border p-4 shadow-sm lg:col-span-2">
        <h3 className="text-lg font-semibold mb-4">Bets by Confidence</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={confidenceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="confidence" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="bets" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
