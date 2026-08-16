/** 장비 치명타 배율을 마법 스킬 치명타 배율로 전환할 때의 점근 상한. */
export const EQUIPMENT_MAGIC_SKILL_CRIT_MAX_MULT = 0.75;

const EQUIPMENT_MAGIC_SKILL_CRIT_CURVE_DIVISOR = 2;

/**
 * 장비에서 얻은 치명타 배율(1 = +1.00x)을 마법 스킬 치명타 보너스로 변환한다.
 * 초반 효율은 높지만 장비 투자가 커질수록 +0.75x에 점근한다.
 */
export function equipmentCritMultToMagicSkillCritBonus(
  equipmentCritMult: number,
): number {
  if (!Number.isFinite(equipmentCritMult) || equipmentCritMult <= 0) return 0;
  return Math.min(
    EQUIPMENT_MAGIC_SKILL_CRIT_MAX_MULT,
    EQUIPMENT_MAGIC_SKILL_CRIT_MAX_MULT *
      (1 - Math.exp(-equipmentCritMult / EQUIPMENT_MAGIC_SKILL_CRIT_CURVE_DIVISOR)),
  );
}
