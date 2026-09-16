import type { V2DamageScaling, V2SkillEffect } from "./v2Skills";

/**
 * 동일 위력 연타는 스킬 전체 계수로 작성한다. 엔진·설명·SP 계산은 분배된 효과를 공유한다.
 * 타격별 방어·최소 피해·반올림 순서는 유지하며, 몬스터용 고정 피해도 합계로 받는다.
 */
export function multiHitDamage({
  hitCount,
  totalStatCoef,
  totalBaseFlat,
  scaling,
  totalPrimaryStatCoef,
}: {
  hitCount: number;
  totalStatCoef: number;
  totalBaseFlat: number;
  scaling?: V2DamageScaling;
  totalPrimaryStatCoef?: number;
}): Extract<V2SkillEffect, { kind: "damage" }>[] {
  // 카탈로그의 소수 계수를 재현해 피해 floor 직전의 부동소수점 오차를 방지한다.
  const share = (total: number) => Number((total / hitCount).toPrecision(15));
  return Array.from({ length: hitCount }, () => ({
    kind: "damage",
    statCoef: share(totalStatCoef),
    baseFlat: share(totalBaseFlat),
    ...(scaling ? { scaling } : {}),
    ...(totalPrimaryStatCoef != null
      ? { primaryStatCoef: share(totalPrimaryStatCoef) }
      : {}),
  }));
}
