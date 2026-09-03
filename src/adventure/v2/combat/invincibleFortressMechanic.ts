export const INVINCIBLE_FORTRESS_BARRIER_TICKS = 400;
export const INVINCIBLE_FORTRESS_BARRIER_HP = 1_500_000;
export const INVINCIBLE_FORTRESS_HP_FRACTIONS = [1, 0.75, 0.5, 0.25] as const;
export const INVINCIBLE_FORTRESS_TIER_MIN_DAMAGE_RATIOS = [
  1,
  0.9,
  0.75,
  0.6,
  0.45,
  0.3,
  0.15,
  0,
] as const;

export type InvincibleFortressEnrageTier = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type InvincibleFortressBarrierIndex = 0 | 1 | 2 | 3;
export type InvincibleFortressCompletedBarrierCount = 0 | 1 | 2 | 3 | 4;

export type InvincibleFortressBattleState = {
  kind: "invincible_fortress";
  completedBarrierCount: InvincibleFortressCompletedBarrierCount;
  activeBarrierIndex: InvincibleFortressBarrierIndex | null;
  barrierTicksRemaining: number;
  barrierDamage: number;
  enrageTier: InvincibleFortressEnrageTier;
  barrierResults: readonly InvincibleFortressEnrageTier[];
};

export const INVINCIBLE_FORTRESS_ENRAGE = [
  { atkMult: 1, spdMult: 1 },
  { atkMult: 1.1, spdMult: 1.15 },
  { atkMult: 1.25, spdMult: 1.35 },
  { atkMult: 1.45, spdMult: 1.6 },
  { atkMult: 1.7, spdMult: 1.9 },
  { atkMult: 1.95, spdMult: 2.25 },
  { atkMult: 2.2, spdMult: 2.6 },
  { atkMult: 2.5, spdMult: 3 },
] as const;

function finiteInteger(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function isEnrageTier(value: unknown): value is InvincibleFortressEnrageTier {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 7;
}

function isBarrierIndex(value: unknown): value is InvincibleFortressBarrierIndex {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}

function sharedMaxHp(value: number): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
}

export function invincibleFortressBarrierTarget(_maxHp: number): number {
  return INVINCIBLE_FORTRESS_BARRIER_HP;
}

export function initialInvincibleFortressState(
  _maxHp: number,
): InvincibleFortressBattleState {
  return {
    kind: "invincible_fortress",
    completedBarrierCount: 0,
    activeBarrierIndex: 0,
    barrierTicksRemaining: INVINCIBLE_FORTRESS_BARRIER_TICKS,
    barrierDamage: 0,
    enrageTier: 0,
    barrierResults: [],
  };
}

export function invincibleFortressTierForDamage(
  damage: number,
  maxHp: number,
): InvincibleFortressEnrageTier {
  const scored = Math.max(0, Math.floor(Number.isFinite(damage) ? damage : 0));
  const target = invincibleFortressBarrierTarget(maxHp);
  if (scored >= Math.ceil(target * INVINCIBLE_FORTRESS_TIER_MIN_DAMAGE_RATIOS[0])) return 0;
  if (scored >= Math.ceil(target * INVINCIBLE_FORTRESS_TIER_MIN_DAMAGE_RATIOS[1])) return 1;
  if (scored >= Math.ceil(target * INVINCIBLE_FORTRESS_TIER_MIN_DAMAGE_RATIOS[2])) return 2;
  if (scored >= Math.ceil(target * INVINCIBLE_FORTRESS_TIER_MIN_DAMAGE_RATIOS[3])) return 3;
  if (scored >= Math.ceil(target * INVINCIBLE_FORTRESS_TIER_MIN_DAMAGE_RATIOS[4])) return 4;
  if (scored >= Math.ceil(target * INVINCIBLE_FORTRESS_TIER_MIN_DAMAGE_RATIOS[5])) return 5;
  if (scored >= Math.ceil(target * INVINCIBLE_FORTRESS_TIER_MIN_DAMAGE_RATIOS[6])) return 6;
  return 7;
}

export function invincibleFortressEnrageMultipliers(
  tier: InvincibleFortressEnrageTier,
): { atkMult: number; spdMult: number } {
  return INVINCIBLE_FORTRESS_ENRAGE[tier];
}

function legacyStateForHp(
  maxHp: number,
  currentHp: number,
): InvincibleFortressBattleState {
  const max = sharedMaxHp(maxHp);
  const hp = Math.max(0, Math.min(max, Math.floor(currentHp)));
  if (hp >= max) return initialInvincibleFortressState(max);

  const completed = INVINCIBLE_FORTRESS_HP_FRACTIONS.filter(
    (fraction) => hp < Math.floor(max * fraction),
  ).length as InvincibleFortressCompletedBarrierCount;
  const nextIndex = completed < 4
    ? (completed as InvincibleFortressBarrierIndex)
    : null;
  const onNextBoundary =
    nextIndex !== null &&
    hp === Math.floor(max * INVINCIBLE_FORTRESS_HP_FRACTIONS[nextIndex]);

  return {
    kind: "invincible_fortress",
    completedBarrierCount: completed,
    activeBarrierIndex: onNextBoundary ? nextIndex : null,
    barrierTicksRemaining: onNextBoundary
      ? INVINCIBLE_FORTRESS_BARRIER_TICKS
      : 0,
    barrierDamage: 0,
    enrageTier: 0,
    barrierResults: [],
  };
}

export function normalizeInvincibleFortressState(
  raw: unknown,
  maxHp: number,
  currentHp: number,
): InvincibleFortressBattleState {
  const fallback = legacyStateForHp(maxHp, currentHp);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const source = raw as Record<string, unknown>;
  if (source.kind !== "invincible_fortress") return fallback;

  const completed = finiteInteger(source.completedBarrierCount, 0, 4);
  if (completed === null || completed !== source.completedBarrierCount) {
    return fallback;
  }
  const resultsRaw = Array.isArray(source.barrierResults)
    ? source.barrierResults
    : null;
  if (
    !resultsRaw ||
    resultsRaw.length > completed ||
    !resultsRaw.every(isEnrageTier)
  ) {
    return fallback;
  }
  const results = resultsRaw.slice(0, 4) as InvincibleFortressEnrageTier[];
  const activeRaw = source.activeBarrierIndex;
  const active = activeRaw === null
    ? null
    : isBarrierIndex(activeRaw)
      ? activeRaw
      : undefined;
  if (active === undefined || (active !== null && active !== completed)) {
    return fallback;
  }
  if ((completed === 4 && active !== null) || (completed < 4 && results.length > completed)) {
    return fallback;
  }

  const ticks = finiteInteger(
    source.barrierTicksRemaining,
    0,
    INVINCIBLE_FORTRESS_BARRIER_TICKS,
  );
  const barrierDamage = finiteInteger(
    source.barrierDamage,
    0,
    invincibleFortressBarrierTarget(maxHp),
  );
  if (ticks === null || barrierDamage === null) return fallback;
  const fallbackTier = results.at(-1) ?? 0;
  const enrageTier = isEnrageTier(source.enrageTier)
    ? source.enrageTier
    : fallbackTier;

  return {
    kind: "invincible_fortress",
    completedBarrierCount: completed as InvincibleFortressCompletedBarrierCount,
    activeBarrierIndex: active,
    barrierTicksRemaining: active === null
      ? 0
      : Math.max(1, ticks || INVINCIBLE_FORTRESS_BARRIER_TICKS),
    barrierDamage: active === null ? 0 : barrierDamage,
    enrageTier: active === null ? enrageTier : 0,
    barrierResults: results,
  };
}

export type SettleInvincibleFortressDamageResult = {
  state: InvincibleFortressBattleState;
  bodyHp: number;
  bodyDamage: number;
  barrierDamageApplied: number;
  barrierStarted: boolean;
  barrierEvents: readonly InvincibleFortressDamageEvent[];
};

export type InvincibleFortressDamageEvent =
  | {
      kind: "barrier_started";
      barrierIndex: InvincibleFortressBarrierIndex;
    }
  | {
      kind: "barrier_damage";
      barrierIndex: InvincibleFortressBarrierIndex;
      damage: number;
      totalDamage: number;
    }
  | {
      kind: "barrier_destroyed";
      barrierIndex: InvincibleFortressBarrierIndex;
      totalDamage: number;
      tier: 0;
    };

function completeInvincibleFortressBarrier(
  state: InvincibleFortressBattleState,
  tier: InvincibleFortressEnrageTier,
): InvincibleFortressBattleState {
  if (state.activeBarrierIndex === null) return state;
  const completed = (state.activeBarrierIndex + 1) as
    InvincibleFortressCompletedBarrierCount;
  return {
    kind: "invincible_fortress",
    completedBarrierCount: completed,
    activeBarrierIndex: null,
    barrierTicksRemaining: 0,
    barrierDamage: 0,
    enrageTier: tier,
    barrierResults: [...state.barrierResults, tier].slice(0, 4),
  };
}

export function settleInvincibleFortressDamage(args: {
  state: InvincibleFortressBattleState;
  currentHp: number;
  incomingDamage: number;
  maxHp: number;
}): SettleInvincibleFortressDamageResult {
  const max = sharedMaxHp(args.maxHp);
  let bodyHp = Math.max(0, Math.min(max, Math.floor(args.currentHp)));
  let remainingDamage = Math.max(
    0,
    Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.floor(Number.isFinite(args.incomingDamage) ? args.incomingDamage : 0),
    ),
  );
  let state = args.state;
  let bodyDamage = 0;
  let barrierDamageApplied = 0;
  let barrierStarted = false;
  const barrierEvents: InvincibleFortressDamageEvent[] = [];

  while (remainingDamage > 0) {
    if (state.activeBarrierIndex !== null) {
      const barrierIndex = state.activeBarrierIndex;
      const previousBarrierDamage = Math.max(
        0,
        Math.min(
          INVINCIBLE_FORTRESS_BARRIER_HP,
          Math.floor(state.barrierDamage),
        ),
      );
      const absorbedDamage = Math.min(
        remainingDamage,
        INVINCIBLE_FORTRESS_BARRIER_HP - previousBarrierDamage,
      );
      const totalDamage = previousBarrierDamage + absorbedDamage;
      if (absorbedDamage > 0) {
        barrierDamageApplied += absorbedDamage;
        remainingDamage -= absorbedDamage;
        barrierEvents.push({
          kind: "barrier_damage",
          barrierIndex,
          damage: absorbedDamage,
          totalDamage,
        });
      }
      state = { ...state, barrierDamage: totalDamage };
      if (totalDamage < INVINCIBLE_FORTRESS_BARRIER_HP) break;

      barrierEvents.push({
        kind: "barrier_destroyed",
        barrierIndex,
        totalDamage,
        tier: 0,
      });
      state = completeInvincibleFortressBarrier(state, 0);
      continue;
    }

    if (state.completedBarrierCount >= 4) {
      const appliedDamage = Math.min(bodyHp, remainingDamage);
      bodyHp -= appliedDamage;
      bodyDamage += appliedDamage;
      remainingDamage -= appliedDamage;
      break;
    }

    const nextIndex = state.completedBarrierCount as InvincibleFortressBarrierIndex;
    const boundaryHp = Math.floor(
      max * INVINCIBLE_FORTRESS_HP_FRACTIONS[nextIndex],
    );
    const damageBeforeBoundary = Math.max(0, bodyHp - boundaryHp);
    if (remainingDamage < damageBeforeBoundary) {
      bodyHp -= remainingDamage;
      bodyDamage += remainingDamage;
      remainingDamage = 0;
      break;
    }

    bodyHp = boundaryHp;
    bodyDamage += damageBeforeBoundary;
    remainingDamage -= damageBeforeBoundary;
    barrierStarted = true;
    state = {
      ...state,
      activeBarrierIndex: nextIndex,
      barrierTicksRemaining: INVINCIBLE_FORTRESS_BARRIER_TICKS,
      barrierDamage: 0,
      enrageTier: 0,
    };
    barrierEvents.push({ kind: "barrier_started", barrierIndex: nextIndex });
  }

  return {
    state,
    bodyHp,
    bodyDamage,
    barrierDamageApplied,
    barrierStarted,
    barrierEvents,
  };
}

export function advanceInvincibleFortressBarrier(args: {
  state: InvincibleFortressBattleState;
  elapsedTicks: number;
  maxHp: number;
}): {
  state: InvincibleFortressBattleState;
  completedTier: InvincibleFortressEnrageTier | null;
  ticksConsumed: number;
} {
  if (args.state.activeBarrierIndex === null) {
    return { state: args.state, completedTier: null, ticksConsumed: 0 };
  }
  const elapsed = Math.max(
    0,
    Math.floor(Number.isFinite(args.elapsedTicks) ? args.elapsedTicks : 0),
  );
  const ticksConsumed = Math.min(args.state.barrierTicksRemaining, elapsed);
  const remaining = args.state.barrierTicksRemaining - ticksConsumed;
  if (remaining > 0) {
    return {
      state: { ...args.state, barrierTicksRemaining: remaining },
      completedTier: null,
      ticksConsumed,
    };
  }

  const tier = invincibleFortressTierForDamage(
    args.state.barrierDamage,
    args.maxHp,
  );
  return {
    state: completeInvincibleFortressBarrier(args.state, tier),
    completedTier: tier,
    ticksConsumed,
  };
}

function percentIncrease(multiplier: number): number {
  return Math.round((multiplier - 1) * 100);
}

export function invincibleFortressResourceSnapshot(
  state: InvincibleFortressBattleState,
  maxHp: number,
): Record<string, number | string> {
  if (state.activeBarrierIndex !== null) {
    const projectedTier = invincibleFortressTierForDamage(
      state.barrierDamage,
      maxHp,
    );
    return {
      fortressTrial: `${INVINCIBLE_FORTRESS_BARRIER_TICKS - state.barrierTicksRemaining} / ${INVINCIBLE_FORTRESS_BARRIER_TICKS}틱`,
      fortressDamage: `${state.barrierDamage.toLocaleString("ko-KR")} / ${invincibleFortressBarrierTarget(maxHp).toLocaleString("ko-KR")}`,
      fortressEnrage: `예상 ${projectedTier}단계`,
    };
  }
  const multipliers = invincibleFortressEnrageMultipliers(state.enrageTier);
  return {
    fortressEnrage:
      `${state.enrageTier}단계` +
      ` · 공격 +${percentIncrease(multipliers.atkMult)}%` +
      ` · 속도 +${percentIncrease(multipliers.spdMult)}%`,
  };
}
