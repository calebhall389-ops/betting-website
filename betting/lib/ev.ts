export function americanToImpliedProbability(odds: number): number {
  if (odds === 0) return 0;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

export function americanToProfitPerUnit(odds: number): number {
  if (odds === 0) return 0;
  return odds > 0 ? odds / 100 : 100 / Math.abs(odds);
}

export function expectedValue(modelProbability: number, odds: number, stake = 1): number {
  const profitPerUnit = americanToProfitPerUnit(odds);
  const winProfit = profitPerUnit * stake;
  const loseAmount = stake;

  return modelProbability * winProfit - (1 - modelProbability) * loseAmount;
}

export function confidenceFromEdge(edge: number): number {
  if (edge >= 0.06) return 5;
  if (edge >= 0.045) return 4;
  if (edge >= 0.03) return 3;
  if (edge >= 0.015) return 2;
  return 1;
}
