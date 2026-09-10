/** 직접 피해 중 비마법 부분만 증폭한다. 지속 피해·평타 처리에서는 호출하지 않는다. */
export function directPhysicalSkillDamageBonus(
  damage: number,
  magicDamage: number,
  pct = 0,
): number {
  return Math.floor(Math.max(0, damage - magicDamage) * Math.max(0, pct) / 100);
}
