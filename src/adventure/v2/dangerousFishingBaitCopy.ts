import type {
  DangerousBait,
  DangerousFishRarity,
} from "@/adventure/data/v2/dangerousFishing";

const RARITY_LABEL: Record<DangerousFishRarity, string> = {
  common: "일반",
  rare: "희귀",
  epic: "영웅",
  legendary: "전설",
};

export function dangerousBaitAttractionCopy(bait: DangerousBait): string {
  if (bait.targetRarities.length === 0 || bait.rarityBonus <= 0) {
    return "추가 어종 출현 보정 없음";
  }
  const rarities = bait.targetRarities.map((rarity) => RARITY_LABEL[rarity]).join("·");
  const bossExclusion = bait.id === "abyss_bait" ? "(거대어 제외)" : "";
  return `${rarities} 어종${bossExclusion} 출현 가중치 +${Math.round(bait.rarityBonus * 100)}%`;
}

export function dangerousBaitRealtimeEffectCopy(bait: DangerousBait): string {
  const effect = bait.realtimeEffect;
  const labels: string[] = [];
  if (
    effect.turnDistanceRecoveryReductionPct > 0 &&
    effect.turnDistanceRecoveryReductionPct === effect.turnTensionImpactReductionPct
  ) {
    labels.push(
      `급선회 중 거리 회복·장력 충격 ${effect.turnDistanceRecoveryReductionPct}% 감소`,
    );
  } else {
    if (effect.turnDistanceRecoveryReductionPct > 0) {
      labels.push(`급선회 중 거리 회복 ${effect.turnDistanceRecoveryReductionPct}% 감소`);
    }
    if (effect.turnTensionImpactReductionPct > 0) {
      labels.push(`급선회 중 장력 충격 ${effect.turnTensionImpactReductionPct}% 감소`);
    }
  }
  if (effect.chargeAndThrashStaminaDamagePct > 0) {
    labels.push(`돌진·몸부림 중 어체력 피해 ${effect.chargeAndThrashStaminaDamagePct}% 증가`);
  }
  if (effect.telegraphCount > 0) {
    labels.push(`다음 행동 ${effect.telegraphCount}개 예고`);
  }
  if (effect.diveSpeedReductionPct > 0) {
    labels.push(`잠수 속도 ${effect.diveSpeedReductionPct}% 감소`);
  }
  if (effect.startingStaminaReductionPct > 0) {
    labels.push(`시작 어체력 ${effect.startingStaminaReductionPct}% 감소`);
  }
  if (effect.tensionImpulseReductionPct > 0) {
    labels.push(`모든 행동 장력 충격 ${effect.tensionImpulseReductionPct}% 감소`);
  }
  return labels.length > 0 ? labels.join(" · ") : "추가 실시간 효과 없음";
}
