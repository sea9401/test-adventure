function safeWhole(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function safePercent(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

/**
 * 정수 보상의 소수 보너스만 확률적으로 반올림한다.
 * 예: 3의 10%는 30% 확률로 1을 더해 장기 기대값 3.3을 보존한다.
 */
export function applyStochasticPercentBonus(
  value: number,
  pct: number,
  rng: () => number = Math.random,
): number {
  const base = safeWhole(value);
  const bonus = (base * safePercent(pct)) / 100;
  const guaranteed = Math.floor(bonus);
  const fraction = bonus - guaranteed;
  return base + guaranteed + (fraction > 0 && rng() < fraction ? 1 : 0);
}

/** 정수 보너스의 1/100 단위 나머지를 다음 지급으로 이월한다. */
export function applyAccumulatedPercentBonus(
  value: number,
  pct: number,
  remainderPct = 0,
): { value: number; bonus: number; remainderPct: number } {
  const base = safeWhole(value);
  const remainder = Math.min(99, safeWhole(remainderPct));
  const progress = base * safePercent(pct) + remainder;
  const bonus = Math.floor(progress / 100);
  return {
    value: base + bonus,
    bonus,
    remainderPct: Math.floor(progress % 100),
  };
}
