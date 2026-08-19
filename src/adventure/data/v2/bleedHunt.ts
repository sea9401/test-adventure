export const BLEED_HUNT_UPTIME_5 = 0.55;
export const BLEED_HUNT_UPTIME_10 = 0.3;

export type BleedHuntMechanic = {
  minStacks: 5 | 10;
  hitBleedStacks?: number;
  hitBleedSetTurns?: number;
  skillAccuracyPct?: number;
  hitEnemyDelayPct?: number;
  skillPenetrationPct?: number;
  skillActualDamageHealPct?: number;
  castHastePct?: number;
  directPhysicalAccuracyPct?: number;
  directPhysicalHastePct?: number;
  directPhysicalPenetrationPct?: number;
  directPhysicalDamagePct?: number;
  bleedTickHealMaxHpPct?: number;
  directPhysicalHitBleedExtend?: {
    chancePct: number;
    turns: number;
    maxTurns: number;
  };
};

export type BleedHuntStage = "tracking" | "apex";

export function bleedHuntStage(stacks: number): BleedHuntStage | null {
  if (stacks >= 10) return "apex";
  if (stacks >= 5) return "tracking";
  return null;
}

export function bleedHuntStageLabel(
  stage: BleedHuntStage | null,
): string | null {
  if (stage === "tracking") return "추적";
  if (stage === "apex") return "사냥의 절정";
  return null;
}

const SCORE = {
  accuracyDivisor: 40,
  hasteDivisor: 22 / 3,
  penetrationDivisor: 3,
  damageDivisor: 4,
  enemyDelayDivisor: 40,
  actualDamageHealDivisor: 8,
  bleedStack: 0.65,
  bleedRefreshTurn: 0.55,
  bleedTickHealPerMaxHpPct: 2.5,
  bleedExtendChanceTurn: 0.028,
} as const;

/**
 * 조건부 출혈 유지 효과를 공격력 한 방 등가 점수로 환산한다.
 * 런타임과 같은 선언을 읽되, 장기전에서 관측할 목표 가동률과 지속 갱신의 한계 실현율을 반영한다.
 */
export function bleedHuntPowerValue(
  mechanic: BleedHuntMechanic | undefined,
): number {
  if (!mechanic) return 0;
  const uptime =
    mechanic.minStacks === 5
      ? BLEED_HUNT_UPTIME_5
      : BLEED_HUNT_UPTIME_10;
  const extend = mechanic.directPhysicalHitBleedExtend;
  const conditional =
    (mechanic.hitBleedStacks ?? 0) * SCORE.bleedStack +
    Math.max(0, (mechanic.hitBleedSetTurns ?? 3) - 3) *
      SCORE.bleedRefreshTurn +
    ((mechanic.skillAccuracyPct ?? 0) +
      (mechanic.directPhysicalAccuracyPct ?? 0)) /
      SCORE.accuracyDivisor +
    ((mechanic.castHastePct ?? 0) +
      (mechanic.directPhysicalHastePct ?? 0)) /
      SCORE.hasteDivisor +
    ((mechanic.skillPenetrationPct ?? 0) +
      (mechanic.directPhysicalPenetrationPct ?? 0)) /
      SCORE.penetrationDivisor +
    (mechanic.directPhysicalDamagePct ?? 0) / SCORE.damageDivisor +
    (mechanic.hitEnemyDelayPct ?? 0) / SCORE.enemyDelayDivisor +
    (mechanic.skillActualDamageHealPct ?? 0) /
      SCORE.actualDamageHealDivisor +
    (mechanic.bleedTickHealMaxHpPct ?? 0) *
      SCORE.bleedTickHealPerMaxHpPct +
    (extend
      ? extend.chancePct *
        extend.turns *
        SCORE.bleedExtendChanceTurn
      : 0);
  return conditional * uptime;
}
