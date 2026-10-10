// 골렘 계보 중량 순환(축적·해방). 설계: docs/superpowers/specs/2026-10-10-golem-tier2-tier6-design.md
// 전투(PvE·PvP 공용 시전 해석)·스킬 상세 칩·성능 점수가 같은 선언을 읽는다.

/** 해방 1회 평균 소모량(점수화 가정). 기본 패턴은 중량 3에서 해방하므로 sim 실측 3.0을 쓴다. */
export const WEIGHT_CYCLE_AVG_CONSUME = 3;
/** 중량 3 가동률(점수화 가정). */
export const WEIGHT_CYCLE_FULL_UPTIME = 0.35;
/** 축적기 시전 전 중량이 이미 3인 비율(점수화 가정). */
export const WEIGHT_CYCLE_OVERLOAD_RATE = 0.35;
/** 직접 물리 스킬 시전 중 해방 시전 비율(점수화 가정). 해방 패시브는 이 비율로만 발동한다. */
export const WEIGHT_CYCLE_RELEASE_SHARE = 0.4;
/** 공용 중량 규칙의 중첩당 SPD 감소(%). */
export const WEIGHT_BASE_SPEED_PENALTY_PCT = 5;

export type WeightCycleMechanic = {
  /** 축적기 — 피해 계산 뒤 중량을 얻는다. */
  gain?: {
    amount: number;
    /** 시전 전 중량 0일 때 대신 얻는 양. */
    amountFromEmpty?: number;
    /** 시전 전 중량 3(과적)일 때 이 스킬 방어 관통 +%p. */
    overloadPenetrationPct?: number;
  };
  /** 해방기 — 시전 시 중량을 모두 소모한다. */
  release?: {
    damagePctPerStack: number;
    enemyDelayPctPerStack?: number;
    enemyDelayMaxPct?: number;
    fullPenetrationPct?: number;
    fullActualDamageHealPct?: number;
    fullCastHastePct?: number;
  };
  /** 패시브 — 어느 해방기로든 소모량 1 이상이면 발동. */
  onRelease?: {
    hastePctPerStack?: number;
    hasteMaxPct?: number;
    shieldMaxHpPctPerStack?: number;
    regainWeight?: number;
  };
  /** 패시브 — 장착 시 중첩당 SPD 감소율을 이 값으로 대체. */
  speedPenaltyPctPerStack?: number;
  /** 패시브 — 시전 전 중량 3이면 직접 물리 스킬 피해 +%. */
  fullWeightDirectPhysicalDamagePct?: number;
  /** 패시브 — 중량 3 상태에서 받는 직접 피해 −%. */
  fullWeightDamageTakenReductionPct?: number;
};

// bleedHunt 와 같은 환산 기준(가속 22/3, 관통 3, 피해 4, 지연 40, 실제 피해 회복 8) + 보호막 16.
const SCORE = {
  hasteDivisor: 22 / 3,
  penetrationDivisor: 3,
  damageDivisor: 4,
  enemyDelayDivisor: 40,
  actualDamageHealDivisor: 8,
  shieldDivisor: 16,
  damageTakenReductionDivisor: 8,
  weightStack: 0.4,
} as const;

const pos = (value: number | undefined): number => Math.max(0, value ?? 0);

/**
 * 중량 순환 효과를 공격력 한 방 등가 점수로 환산한다. rawActive 는 액티브의 효과 합산 점수(해방 피해
 * 증가가 비례할 기준), 패시브는 0을 넘긴다.
 */
export function weightCyclePowerValue(
  mechanic: WeightCycleMechanic | undefined,
  rawActive: number,
): number {
  if (!mechanic) return 0;
  const avg = WEIGHT_CYCLE_AVG_CONSUME;
  const full = WEIGHT_CYCLE_FULL_UPTIME;
  const overload = WEIGHT_CYCLE_OVERLOAD_RATE;
  let score = 0;
  const { gain, release, onRelease } = mechanic;
  if (gain) {
    const extra = pos((gain.amountFromEmpty ?? gain.amount) - gain.amount);
    score += extra * SCORE.weightStack * (1 - overload);
    score += (pos(gain.overloadPenetrationPct) / SCORE.penetrationDivisor) * overload;
  }
  if (release) {
    score += (pos(rawActive) * pos(release.damagePctPerStack) * avg) / 100;
    const delay = Math.min(
      pos(release.enemyDelayPctPerStack) * avg,
      release.enemyDelayMaxPct ?? Infinity,
    );
    score += delay / SCORE.enemyDelayDivisor;
    score +=
      (pos(release.fullPenetrationPct) / SCORE.penetrationDivisor +
        pos(release.fullActualDamageHealPct) / SCORE.actualDamageHealDivisor +
        pos(release.fullCastHastePct) / SCORE.hasteDivisor) *
      full;
  }
  if (onRelease) {
    const haste = Math.min(
      pos(onRelease.hastePctPerStack) * avg,
      onRelease.hasteMaxPct ?? Infinity,
    );
    score +=
      (haste / SCORE.hasteDivisor +
        (pos(onRelease.shieldMaxHpPctPerStack) * avg) / SCORE.shieldDivisor +
        pos(onRelease.regainWeight) * SCORE.weightStack) *
      WEIGHT_CYCLE_RELEASE_SHARE;
  }
  if (mechanic.speedPenaltyPctPerStack != null) {
    score +=
      (pos(WEIGHT_BASE_SPEED_PENALTY_PCT - mechanic.speedPenaltyPctPerStack) * avg) /
      SCORE.hasteDivisor;
  }
  score +=
    (pos(mechanic.fullWeightDirectPhysicalDamagePct) / SCORE.damageDivisor) * full;
  score +=
    (pos(mechanic.fullWeightDamageTakenReductionPct) /
      SCORE.damageTakenReductionDivisor) *
    full;
  return score;
}

/** 중량을 만드는 스킬(축적기·해방 후 재부착)인가. 전투 화면의 중량 표시 여부에 쓴다. */
export function skillBuildsWeight(skill: {
  mutationWeightGain?: number;
  weightCycle?: WeightCycleMechanic;
} | undefined): boolean {
  return (
    (skill?.mutationWeightGain ?? 0) > 0 ||
    (skill?.weightCycle?.gain?.amount ?? 0) > 0 ||
    (skill?.weightCycle?.onRelease?.regainWeight ?? 0) > 0
  );
}

/** 스킬 상세 수치 칩. */
export function describeWeightCycle(mechanic: WeightCycleMechanic): string[] {
  const chips: string[] = [];
  const { gain, release, onRelease } = mechanic;
  if (gain) {
    chips.push(
      gain.amountFromEmpty != null && gain.amountFromEmpty !== gain.amount
        ? `중량 +${gain.amount} · 중량 0에서 +${gain.amountFromEmpty} (최대 3)`
        : `중량 +${gain.amount} (최대 3)`,
    );
    if (gain.overloadPenetrationPct) {
      chips.push(`중량 3에서 과적 타격: 방어 관통 +${gain.overloadPenetrationPct}%p`);
    }
  }
  if (release) {
    chips.push(`중량 전부 소모 · 소모 1당 최종 피해 +${release.damagePctPerStack}%`);
    if (release.enemyDelayPctPerStack) {
      chips.push(
        `명중 시 소모 1당 적 다음 행동 ${release.enemyDelayPctPerStack}% 지연` +
          (release.enemyDelayMaxPct != null ? ` (최대 ${release.enemyDelayMaxPct}%)` : ""),
      );
    }
    if (release.fullPenetrationPct) {
      chips.push(`중량 3 소모 시 방어 관통 +${release.fullPenetrationPct}%p`);
    }
    if (release.fullActualDamageHealPct) {
      chips.push(`중량 3 소모 시 실제 피해의 ${release.fullActualDamageHealPct}% HP 회복`);
    }
    if (release.fullCastHastePct) {
      chips.push(`중량 3 소모 시 다음 행동 ${release.fullCastHastePct}% 가속`);
    }
  }
  if (onRelease) {
    if (onRelease.hastePctPerStack) {
      chips.push(
        `해방 시 소모 1당 다음 행동 ${onRelease.hastePctPerStack}% 가속` +
          (onRelease.hasteMaxPct != null ? ` (최대 ${onRelease.hasteMaxPct}%)` : ""),
      );
    }
    if (onRelease.shieldMaxHpPctPerStack) {
      chips.push(`해방 시 소모 1당 최대 HP ${onRelease.shieldMaxHpPctPerStack}% 보호막`);
    }
    if (onRelease.regainWeight) {
      chips.push(`해방 직후 중량 +${onRelease.regainWeight}`);
    }
  }
  if (mechanic.speedPenaltyPctPerStack != null) {
    chips.push(
      `중량당 SPD 감소 ${WEIGHT_BASE_SPEED_PENALTY_PCT}% → ${mechanic.speedPenaltyPctPerStack}%`,
    );
  }
  if (mechanic.fullWeightDirectPhysicalDamagePct) {
    chips.push(`중량 3일 때 직접 물리 스킬 피해 +${mechanic.fullWeightDirectPhysicalDamagePct}%`);
  }
  if (mechanic.fullWeightDamageTakenReductionPct) {
    chips.push(`중량 3일 때 받는 직접 피해 -${mechanic.fullWeightDamageTakenReductionPct}%`);
  }
  return chips;
}
