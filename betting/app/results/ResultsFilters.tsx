'use client';

type Props = {
  sports: string[];
  selectedSport: string;
  selectedResult: string;
  onSportChange: (value: string) => void;
  onResultChange: (value: string) => void;
};

export default function ResultsFilters({
  sports,
  selectedSport,
  selectedResult,
  onSportChange,
  onResultChange,
}: Props) {
  return (
    <div className="flex flex-wrap gap-4">
      {/* Sport Filter */}
      <select
        value={selectedSport}
        onChange={(e) => onSportChange(e.target.value)}
        className="border rounded-lg px-3 py-2"
      >
        <option value="All">All Sports</option>
        {sports.map((sport) => (
          <option key={sport} value={sport}>
            {sport}
          </option>
        ))}
      </select>

      {/* Result Filter */}
      <select
        value={selectedResult}
        onChange={(e) => onResultChange(e.target.value)}
        className="border rounded-lg px-3 py-2"
      >
        <option value="All">All Results</option>
        <option value="win">Wins</option>
        <option value="loss">Losses</option>
        <option value="push">Pushes</option>
        <option value="pending">Pending</option>
      </select>
    </div>
  );
}
