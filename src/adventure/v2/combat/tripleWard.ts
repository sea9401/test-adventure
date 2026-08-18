export type TripleWardRank = 0 | 1 | 2;
export type TripleWardDamageKind = "physical" | "magic";
export type TripleWardCombatMode = "pve" | "pvp";

export type TripleWardState = {
  rank: TripleWardRank;
  physical: number;
  magic: number;
  purification: number;
  stabilityStacks: number;
};

export const TRIPLE_WARD_LABELS = {
  physical: "금강결계",
  magic: "봉마결계",
  purification: "정화결계",
} as const;

function chargesForRank(rank: TripleWardRank): number {
  if (rank === 2) return 3;
  if (rank === 1) return 1;
  return 0;
}

function normalizedRank(rank: number): TripleWardRank {
  if (rank >= 2) return 2;
  if (rank >= 1) return 1;
  return 0;
}

function grantStability(state: TripleWardState): TripleWardState {
  if (state.rank !== 2) return state;
  return {
    ...state,
    stabilityStacks: Math.min(3, state.stabilityStacks + 1),
  };
}

export function initialTripleWardState(rank: TripleWardRank): TripleWardState {
  const normalized = normalizedRank(rank);
  const charges = chargesForRank(normalized);
  return {
    rank: normalized,
    physical: charges,
    magic: charges,
    purification: charges,
    stabilityStacks: 0,
  };
}

/** 만법불침은 패시브가 없어도 대결계사 단계의 결계를 전개한다. */
export function refreshTripleWardState(
  state: TripleWardState,
  equippedRank: TripleWardRank,
): TripleWardState {
  const rank = normalizedRank(Math.max(1, state.rank, equippedRank));
  const charges = chargesForRank(rank);
  return {
    rank,
    physical: charges,
    magic: charges,
    purification: charges,
    stabilityStacks: state.stabilityStacks,
  };
}

export function tripleWardReductionPct(
  rank: TripleWardRank,
  mode: TripleWardCombatMode,
): number {
  if (rank === 2) return mode === "pvp" ? 40 : 60;
  if (rank === 1) return mode === "pvp" ? 30 : 45;
  return 0;
}

export function tripleWardStabilityReductionPct(
  state: TripleWardState,
): number {
  return state.rank === 2 ? Math.min(3, state.stabilityStacks) * 4 : 0;
}

export type TripleWardDamageResult = {
  state: TripleWardState;
  damages: number[];
  totalDamage: number;
  consumed: boolean;
  reductionPct: number;
  remaining: number;
};

/**
 * 한 행동의 같은 피해 유형 타격 배열을 처리한다. 0 피해는 유효 타격으로 보지 않으며,
 * 첫 양수 타격 하나만 결계로 줄여 다단 공격의 나머지 타격은 원래 피해를 유지한다.
 */
export function resolveTripleWardDamage(
  state: TripleWardState,
  kind: TripleWardDamageKind,
  mode: TripleWardCombatMode,
  rawDamages: readonly number[],
): TripleWardDamageResult {
  const damages = rawDamages.map((damage) => Math.max(0, Math.floor(damage)));
  const remainingBefore = state[kind];
  const hitIndex = remainingBefore > 0
    ? damages.findIndex((damage) => damage > 0)
    : -1;
  const reductionPct = hitIndex >= 0
    ? tripleWardReductionPct(state.rank, mode)
    : 0;

  if (hitIndex < 0 || reductionPct <= 0) {
    return {
      state,
      damages,
      totalDamage: damages.reduce((sum, damage) => sum + damage, 0),
      consumed: false,
      reductionPct: 0,
      remaining: remainingBefore,
    };
  }

  damages[hitIndex] = Math.max(
    1,
    Math.floor(damages[hitIndex] * (1 - reductionPct / 100)),
  );
  const consumedState = grantStability({
    ...state,
    [kind]: remainingBefore - 1,
  });
  return {
    state: consumedState,
    damages,
    totalDamage: damages.reduce((sum, damage) => sum + damage, 0),
    consumed: true,
    reductionPct,
    remaining: remainingBefore - 1,
  };
}

export function consumePurificationWard(state: TripleWardState): {
  state: TripleWardState;
  consumed: boolean;
  remaining: number;
} {
  if (state.purification <= 0) {
    return { state, consumed: false, remaining: 0 };
  }
  const remaining = state.purification - 1;
  return {
    state: grantStability({ ...state, purification: remaining }),
    consumed: true,
    remaining,
  };
}

export function tripleWardResourceSnapshot(
  state: TripleWardState,
): Record<string, number> | null {
  if (state.rank === 0) return null;
  return {
    physicalWard: state.physical,
    magicWard: state.magic,
    purificationWard: state.purification,
    ...(state.rank === 2 ? { domainStability: state.stabilityStacks } : {}),
  };
}

export function mergeTripleWardResourceSnapshot(
  base: Record<string, number | string> | null | undefined,
  state: TripleWardState,
): Record<string, number | string> | undefined {
  const ward = tripleWardResourceSnapshot(state);
  if (!base && !ward) return undefined;
  return { ...(base ?? {}), ...(ward ?? {}) };
}
