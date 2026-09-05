
// 동일 계열 받는 피해 감소를 여러 개 수집했을 때의 점감. 첫 20%는 그대로 보존하고 이후
// 증가분은 40%만 반영해, 단일 패시브 가치는 유지하면서 다중 생존 패시브의 곱연산 폭주를 막는다.
export function stackedDamageReductionPct(rawPct: number): number {
  const raw = Math.max(0, rawPct);
  if (raw <= 20) return raw;
  return Math.min(30, 20 + (raw - 20) * 0.4);
}



export function stackedSurvivalIncreasePct(
  rawPct: number,
  softCapPct: number,
  overflowRetention: number,
  hardCapPct: number | null,
): number {
  const raw = Math.max(0, rawPct);
  if (raw <= softCapPct) return raw;
  const softened = softCapPct + (raw - softCapPct) * overflowRetention;
  return hardCapPct === null ? softened : Math.min(hardCapPct, softened);
}



export function stackedVitalityIncreasePct(rawPct: number): number {
  return stackedSurvivalIncreasePct(rawPct, 40, 0.4, 60);
}



export function stackedMaxHpIncreasePct(rawPct: number): number {
  return stackedSurvivalIncreasePct(rawPct, 30, 0.35, null);
}



export function stackedDefenseIncreasePct(rawPct: number): number {
  return stackedSurvivalIncreasePct(rawPct, 30, 0.4, null);
}
