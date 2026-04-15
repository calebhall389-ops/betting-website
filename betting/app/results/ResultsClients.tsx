'use client';

import { useState } from 'react';
import ResultsCharts from './ResultsCharts';
import ResultsFilters from './ResultsFilters';

export default function ResultsClient({
  picks,
  bankrollData,
  confidenceData,
  sports,
}: any) {
  const [selectedSport, setSelectedSport] = useState('All');
  const [selectedResult, setSelectedResult] = useState('All');

  const filteredPicks = picks.filter((pick: any) => {
    const sportMatch =
      selectedSport === 'All' || pick.sport === selectedSport;
    const resultMatch =
      selectedResult === 'All' || pick.result === selectedResult;
    return sportMatch && resultMatch;
  });

  return (
    <div className="space-y-6">
      <ResultsFilters
        sports={sports}
        selectedSport={selectedSport}
        selectedResult={selectedResult}
        onSportChange={setSelectedSport}
        onResultChange={setSelectedResult}
      />

      <ResultsCharts
        profitData={bankrollData}
        confidenceData={confidenceData}
      />
    </div>
  );
}
