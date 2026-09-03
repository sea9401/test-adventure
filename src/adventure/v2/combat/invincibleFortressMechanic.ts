export const INVINCIBLE_FORTRESS_BARRIER_TICKS = 400;
export const INVINCIBLE_FORTRESS_TARGET_FRACTION = 0.003;
// 방벽 시험은 400틱 동안의 순간 화력 검사다. 본체 장기전용 HP 상향이 요구 화력까지
// 끌어올려 계보별 공략 차이를 지우지 않도록 최초 밸런스 기준 HP에서 상한을 둔다.
export const INVINCIBLE_FORTRESS_TARGET_MAX_HP = 10_800_000;
export const INVINCIBLE_FORTRESS_HP_FRACTIONS = [1, 0.75, 0.5, 0.25] as const;

export type InvincibleFortressEnrageTier = 0 | 1 | 2 | 3 | 4;
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
  { atkMult: 1.08, spdMult: 1.04 },
  { atkMult: 1.16, spdMult: 1.08 },
  { atkMult: 1.28, spdMult: 1.12 },
  { atkMult: 1.4, spdMult: 1.16 },
] as const;

const ENRAGE_LABELS = ["없음", "약함", "보통", "강함", "최대"] as const;

function finiteInteger(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function isEnrageTier(value: unknown): value is InvincibleFortressEnrageTier {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 4;
}

function isBarrierIndex(value: unknown): value is InvincibleFortressBarrierIndex {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}

function sharedMaxHp(value: number): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
}

export function invincibleFortressBarrierTarget(maxHp: number): number {
  return Math.max(
    1,
    Math.floor(
      Math.min(sharedMaxHp(maxHp), INVINCIBLE_FORTRESS_TARGET_MAX_HP) *
        INVINCIBLE_FORTRESS_TARGET_FRACTION,
    ),
  );
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
  if (scored >= target) return 0;
  if (scored >= Math.ceil(target * 0.75)) return 1;
  if (scored >= Math.ceil(target * 0.5)) return 2;
  if (scored >= Math.ceil(target * 0.25)) return 3;
  return 4;
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
    Number.MAX_SAFE_INTEGER,
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
};

export function settleInvincibleFortressDamage(args: {
  state: InvincibleFortressBattleState;
  currentHp: number;
  incomingDamage: number;
  maxHp: number;
}): SettleInvincibleFortressDamageResult {
  const max = sharedMaxHp(args.maxHp);
  const hp = Math.max(0, Math.min(max, Math.floor(args.currentHp)));
  const damage = Math.max(
    0,
    Math.min(
      Number.MAX_SAFE_INTEGER,
      Math.floor(Number.isFinite(args.incomingDamage) ? args.incomingDamage : 0),
    ),
  );

  if (args.state.activeBarrierIndex !== null) {
    const previousBarrierDamage = Math.max(
      0,
      Math.min(Number.MAX_SAFE_INTEGER, Math.floor(args.state.barrierDamage)),
    );
    const barrierDamage = Math.min(
      Number.MAX_SAFE_INTEGER,
      previousBarrierDamage + damage,
    );
    return {
      state: { ...args.state, barrierDamage },
      bodyHp: hp,
      bodyDamage: 0,
      barrierDamageApplied: barrierDamage - previousBarrierDamage,
      barrierStarted: false,
    };
  }

  if (damage <= 0 || args.state.completedBarrierCount >= 4) {
    const bodyHp = Math.max(0, hp - damage);
    return {
      state: args.state,
      bodyHp,
      bodyDamage: hp - bodyHp,
      barrierDamageApplied: 0,
      barrierStarted: false,
    };
  }

  const nextIndex = args.state.completedBarrierCount as InvincibleFortressBarrierIndex;
  const boundaryHp = Math.floor(max * INVINCIBLE_FORTRESS_HP_FRACTIONS[nextIndex]);
  const bodyDamageBeforeBoundary = Math.max(0, hp - boundaryHp);
  if (damage < bodyDamageBeforeBoundary) {
    return {
      state: args.state,
      bodyHp: hp - damage,
      bodyDamage: damage,
      barrierDamageApplied: 0,
      barrierStarted: false,
    };
  }

  const overflow = Math.max(0, damage - bodyDamageBeforeBoundary);
  return {
    state: {
      ...args.state,
      activeBarrierIndex: nextIndex,
      barrierTicksRemaining: INVINCIBLE_FORTRESS_BARRIER_TICKS,
      barrierDamage: overflow,
      enrageTier: 0,
    },
    bodyHp: boundaryHp,
    bodyDamage: bodyDamageBeforeBoundary,
    barrierDamageApplied: overflow,
    barrierStarted: true,
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
  const completed = (args.state.activeBarrierIndex + 1) as
    InvincibleFortressCompletedBarrierCount;
  return {
    state: {
      kind: "invincible_fortress",
      completedBarrierCount: completed,
      activeBarrierIndex: null,
      barrierTicksRemaining: 0,
      barrierDamage: 0,
      enrageTier: tier,
      barrierResults: [...args.state.barrierResults, tier].slice(0, 4),
    },
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
    return {
      fortressTrial: `${INVINCIBLE_FORTRESS_BARRIER_TICKS - state.barrierTicksRemaining} / ${INVINCIBLE_FORTRESS_BARRIER_TICKS}틱`,
      fortressDamage: `${state.barrierDamage.toLocaleString("ko-KR")} / ${invincibleFortressBarrierTarget(maxHp).toLocaleString("ko-KR")}`,
      fortressEnrage: ENRAGE_LABELS[
        invincibleFortressTierForDamage(state.barrierDamage, maxHp)
      ],
    };
  }
  const multipliers = invincibleFortressEnrageMultipliers(state.enrageTier);
  return {
    fortressEnrage:
      `${ENRAGE_LABELS[state.enrageTier]} (${state.enrageTier}단계)` +
      ` · 공격 +${percentIncrease(multipliers.atkMult)}%` +
      ` · 속도 +${percentIncrease(multipliers.spdMult)}%`,
  };
}
