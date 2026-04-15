type OddsRow = {
  id: string;
  sport: string;
  event: string;
  market: string;
  book: string;
  line: string;
  price: string;
  commenceTime: string;
};

type OddsTableProps = {
  odds: OddsRow[];
};

export default function OddsTable({ odds }: OddsTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-left text-slate-400">
            <tr>
              <th className="p-3">Sport</th>
              <th className="p-3">Event</th>
              <th className="p-3">Market</th>
              <th className="p-3">Sportsbook</th>
              <th className="p-3">Line</th>
              <th className="p-3">Odds</th>
              <th className="p-3">Start Time</th>
            </tr>
          </thead>

          <tbody>
            {odds.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-slate-400">
                  No odds found.
                </td>
              </tr>
            ) : (
              odds.map((row) => (
                <tr key={row.id} className="border-t border-slate-800">
                  <td className="p-3 text-white">{row.sport}</td>
                  <td className="p-3 text-white">{row.event}</td>
                  <td className="p-3 text-slate-300">{row.market}</td>
                  <td className="p-3 text-slate-300">{row.book}</td>
                  <td className="p-3 text-slate-300">{row.line}</td>
                  <td className="p-3 font-semibold text-emerald-400">
                    {row.price}
                  </td>
                  <td className="p-3 text-slate-400">{row.commenceTime}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
