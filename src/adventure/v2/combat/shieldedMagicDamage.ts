/** 직접 마법 스킬 본타 전용. 빙결·DoT·장비 추가타는 이 계산을 사용하지 않는다. */
export function directMagicSkillDamageBonus(input: {
  damage: number;
  shield: number;
  basePct?: number;
  passivePct?: number;
  skillPct?: number;
}): number {
  const positive = (value: number | undefined) =>
    Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
  const shieldedPct = input.shield > 0
    ? positive(input.passivePct) + positive(input.skillPct)
    : 0;
  return Math.floor(positive(input.damage) * (positive(input.basePct) + shieldedPct) / 100);
}
