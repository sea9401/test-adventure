function nonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizedRisk(risk: number): number {
  if (!Number.isFinite(risk)) return 0;
  return Math.max(0, Math.min(5, risk));
}

export const DANGEROUS_RETURN_FISHING_COIN_RATE = 0.01;

export function dangerousReturnFishingCoins(
  retainedCargoValue: number,
  risk: number,
): number {
  const reward = Math.floor(
    nonNegativeInteger(retainedCargoValue) *
      normalizedRisk(risk) *
      DANGEROUS_RETURN_FISHING_COIN_RATE,
  );
  return Math.min(Number.MAX_SAFE_INTEGER, reward);
}
