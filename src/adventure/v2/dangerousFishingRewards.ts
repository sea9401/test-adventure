function nonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizedRisk(risk: number): number {
  if (!Number.isFinite(risk)) return 0;
  return Math.max(0, Math.min(5, risk));
}

export function dangerousReturnFishingCoins(
  retainedCargoValue: number,
  risk: number,
): number {
  const reward = Math.floor(
    nonNegativeInteger(retainedCargoValue) * normalizedRisk(risk) * 0.02,
  );
  return Math.min(Number.MAX_SAFE_INTEGER, reward);
}
