import { V2_SKILLS } from "@/adventure/data/v2/v2Skills";
import {
  WEIGHT_BASE_SPEED_PENALTY_PCT,
  type WeightCycleMechanic,
} from "@/adventure/data/v2/weightCycle";

export const MUTATION_RESOURCE_MAX = 3;

export function clampMutationResource(value: number): number {
  return Math.max(
    0,
    Math.min(MUTATION_RESOURCE_MAX, Math.floor(Number(value) || 0)),
  );
}

export function weightPhysicalSkillMultiplier(weight: number): number {
  return 1 + clampMutationResource(weight) * 0.05;
}

export function weightSpeedMultiplier(
  weight: number,
  pctPerStack: number = WEIGHT_BASE_SPEED_PENALTY_PCT,
): number {
  return 1 - (clampMutationResource(weight) * Math.max(0, pctPerStack)) / 100;
}

export function stoneskinDefMultiplier(
  weight: number,
  pctPerStack: number,
): number {
  const pct = Math.max(0, Number(pctPerStack) || 0);
  return 1 + (clampMutationResource(weight) * pct) / 100;
}

export function effectiveMutationDef(
  baseDef: number,
  weight: number,
  pctPerStack: number,
): number {
  return Math.max(
    0,
    Math.floor(
      Math.max(0, Number(baseDef) || 0) *
        stoneskinDefMultiplier(weight, pctPerStack),
    ),
  );
}

export type MutationCastTransition = {
  weightAfter: number;
  weightGained: number;
  weightConsumed: number;
  /** 해방 직후 다시 붙은 중량(산맥의 몸). */
  weightRegained: number;
  /** 로그 전용 — 해방 패시브 가속·보호막(%)과 과적 타격 여부. */
  log?: MutationTransitionLog;
};

export type MutationTransitionLog = {
  releaseHastePct: number;
  releaseShieldPct: number;
  overloaded: boolean;
};

export function mutationCastTransition(
  weightRaw: number,
  action: {
    weightGain?: number;
    consumeWeight?: boolean;
    regainAfterConsume?: number;
    log?: MutationTransitionLog;
  },
): MutationCastTransition {
  const weight = clampMutationResource(weightRaw);
  const weightConsumed = action.consumeWeight ? weight : 0;
  const weightRegained =
    weightConsumed > 0
      ? clampMutationResource(action.regainAfterConsume ?? 0)
      : 0;
  const weightBeforeGain = action.consumeWeight ? weightRegained : weight;
  const weightAfter = clampMutationResource(
    weightBeforeGain + Math.max(0, Math.floor(action.weightGain ?? 0)),
  );

  return {
    weightAfter,
    weightGained: weightAfter - weightBeforeGain,
    weightConsumed,
    weightRegained,
    ...(action.log ? { log: action.log } : {}),
  };
}

export function mutationTransitionLogLines(
  skillName: string | null,
  transition: MutationCastTransition,
): string[] {
  const lines: string[] = [];
  if (transition.weightGained > 0) {
    lines.push(
      `[중량] +${transition.weightGained} (${transition.weightAfter}/${MUTATION_RESOURCE_MAX})`,
    );
  }
  if (transition.weightConsumed > 0) {
    lines.push(
      `[${skillName ?? "중량 해방"}] 중량 ${transition.weightConsumed} 소모`,
    );
  }
  if ((transition.log?.releaseHastePct ?? 0) > 0) {
    lines.push(`[짐 벗기] 다음 행동 ${transition.log!.releaseHastePct}% 가속`);
  }
  if ((transition.log?.releaseShieldPct ?? 0) > 0) {
    lines.push(`[암벽 갑주] 보호막 +${transition.log!.releaseShieldPct}%`);
  }
  if (transition.log?.overloaded) {
    lines.push(`[${skillName ?? "과적"}] 과적 타격`);
  }
  if (transition.weightRegained > 0) {
    lines.push(
      `[산맥의 몸] 중량 +${transition.weightRegained} (${transition.weightAfter}/${MUTATION_RESOURCE_MAX})`,
    );
  }
  return lines;
}

export type WeightCycleCastResolution = {
  /** 이 액티브가 중량을 모두 소모하는 해방기인가. */
  consumes: boolean;
  consumed: number;
  weightGain: number;
  regainAfterConsume: number;
  releaseDamagePct: number;
  piercePct: number;
  directPhysicalDamagePct: number;
  selfHastePct: number;
  enemyDelayPct: number;
  shieldMaxHpPct: number;
  actualDamageHealPct: number;
  /** 전이 로그에 실을 해방 패시브·과적 정보. */
  log: MutationTransitionLog;
};

/**
 * 골렘 계보 중량 순환 — 시전 전 중량 스냅숏으로 이번 시전의 축적·해방·보상을 계산한다.
 * 현재 직업은 보지 않는다. PvE·PvP 공용 시전 해석(resolveV2SkillCast)이 한 번 호출한다.
 */
export function resolveWeightCycleCast(input: {
  preCastWeight: number;
  active: {
    weightCycle?: WeightCycleMechanic;
    mutationWeightGain?: number;
    mutationWeightConsumePctPerStack?: number;
  };
  equippedPassives: readonly WeightCycleMechanic[];
}): WeightCycleCastResolution {
  const weight = clampMutationResource(input.preCastWeight);
  const cycle = input.active.weightCycle;
  const release = cycle?.release;
  const consumes =
    release != null || (input.active.mutationWeightConsumePctPerStack ?? 0) > 0;
  const consumed = consumes ? weight : 0;
  const full = consumed === MUTATION_RESOURCE_MAX;
  const gain = cycle?.gain;
  const weightGain = consumes
    ? 0
    : gain
      ? weight === 0
        ? (gain.amountFromEmpty ?? gain.amount)
        : gain.amount
      : Math.max(0, Math.floor(input.active.mutationWeightGain ?? 0));
  const sum = (pick: (m: WeightCycleMechanic) => number): number =>
    input.equippedPassives.reduce((total, m) => total + Math.max(0, pick(m)), 0);
  const onRelease = (pick: (m: NonNullable<WeightCycleMechanic["onRelease"]>) => number) =>
    consumed > 0 ? sum((m) => (m.onRelease ? pick(m.onRelease) : 0)) : 0;
  const capped = (perStack: number | undefined, max: number | undefined) =>
    Math.min(Math.max(0, perStack ?? 0) * consumed, max ?? Infinity);
  const releasePassiveHastePct = onRelease((r) => capped(r.hastePctPerStack, r.hasteMaxPct));
  const overloadPiercePct =
    gain && weight === MUTATION_RESOURCE_MAX ? (gain.overloadPenetrationPct ?? 0) : 0;
  const shieldMaxHpPct = onRelease((r) => (r.shieldMaxHpPctPerStack ?? 0) * consumed);
  return {
    consumes,
    consumed,
    weightGain,
    regainAfterConsume: onRelease((r) => r.regainWeight ?? 0),
    releaseDamagePct: release ? Math.max(0, release.damagePctPerStack) * consumed : 0,
    piercePct: overloadPiercePct + (full ? (release?.fullPenetrationPct ?? 0) : 0),
    directPhysicalDamagePct:
      weight === MUTATION_RESOURCE_MAX
        ? sum((m) => m.fullWeightDirectPhysicalDamagePct ?? 0)
        : 0,
    selfHastePct: releasePassiveHastePct + (full ? (release?.fullCastHastePct ?? 0) : 0),
    enemyDelayPct: release
      ? capped(release.enemyDelayPctPerStack, release.enemyDelayMaxPct)
      : 0,
    shieldMaxHpPct,
    actualDamageHealPct: full ? (release?.fullActualDamageHealPct ?? 0) : 0,
    log: {
      releaseHastePct: releasePassiveHastePct,
      releaseShieldPct: shieldMaxHpPct,
      overloaded: overloadPiercePct > 0,
    },
  };
}

/** 장착한 패시브 중 중량 순환 선언만 모은다. */
export function equippedWeightCyclePassives(
  equipped: readonly string[],
): WeightCycleMechanic[] {
  return equipped.flatMap((id) => {
    const def = V2_SKILLS[id as keyof typeof V2_SKILLS];
    return def?.category === "passive" && def.weightCycle ? [def.weightCycle] : [];
  });
}

type WeightCycleProfile = {
  speedPenaltyPctPerStack: number;
  fullWeightDamageTakenReductionPct: number;
};
// ATB 틱마다 읽으므로 로드아웃 배열(전투 중 불변 참조)별로 캐시한다.
const profileCache = new WeakMap<readonly string[], WeightCycleProfile>();

/** 장착 패시브가 바꾸는 상시 중량 규칙(SPD 감소율·중량 3 받는 피해 감소). */
export function equippedWeightCycleProfile(
  equipped: readonly string[] = [],
): WeightCycleProfile {
  const cached = profileCache.get(equipped);
  if (cached) return cached;
  const profile = buildWeightCycleProfile(equipped);
  profileCache.set(equipped, profile);
  return profile;
}

function buildWeightCycleProfile(equipped: readonly string[]): WeightCycleProfile {
  const passives = equippedWeightCyclePassives(equipped);
  return {
    speedPenaltyPctPerStack: Math.min(
      WEIGHT_BASE_SPEED_PENALTY_PCT,
      ...passives.map((m) => m.speedPenaltyPctPerStack ?? WEIGHT_BASE_SPEED_PENALTY_PCT),
    ),
    fullWeightDamageTakenReductionPct: passives.reduce(
      (total, m) => total + Math.max(0, m.fullWeightDamageTakenReductionPct ?? 0),
      0,
    ),
  };
}

/** 현재 중량이 3일 때만 장착 패시브의 받는 직접 피해 감소(%)를 돌려준다. */
export function weightFullDamageTakenReductionPct(
  weight: number,
  equipped: readonly string[] = [],
): number {
  return clampMutationResource(weight) === MUTATION_RESOURCE_MAX
    ? equippedWeightCycleProfile(equipped).fullWeightDamageTakenReductionPct
    : 0;
}

/** 장착 패시브(강철 골격)를 반영한 중량 SPD 배수. */
export function equippedWeightSpeedMultiplier(
  weight: number,
  equipped: readonly string[] = [],
): number {
  return weightSpeedMultiplier(
    weight,
    equippedWeightCycleProfile(equipped).speedPenaltyPctPerStack,
  );
}
