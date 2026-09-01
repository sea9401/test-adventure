export type ImmortalBerserkerLifeIndex = 0 | 1 | 2;
export type ImmortalBerserkerRegenUses = 0 | 1 | 2 | 3;

export type ImmortalBerserkerBattleState = {
  kind: "immortal_berserker";
  lifeIndex: ImmortalBerserkerLifeIndex;
  regenActionCount: number;
  regenUsesRemaining: ImmortalBerserkerRegenUses;
  revivalsCompleted: ImmortalBerserkerLifeIndex;
};

const LIFE_FRACTIONS = [0.67, 0.34, 0] as const;
const MAX_REGEN_USES = [3, 2, 0] as const;
const REGEN_FRACTIONS = [0.04, 0.03, 0] as const;
const MULTIPLIERS = [
  { atkMult: 1, spdMult: 1 },
  { atkMult: 1.12, spdMult: 1.06 },
  { atkMult: 1.25, spdMult: 1.12 },
] as const;

function integer(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.floor(value)
    : fallback;
}

function safeMaxHp(maxHp: number): number {
  return Math.max(1, integer(maxHp, 1));
}

export function immortalBerserkerLifeFloors(maxHp: number): readonly [number, number, 0] {
  const max = safeMaxHp(maxHp);
  return [Math.floor(max * LIFE_FRACTIONS[0]), Math.floor(max * LIFE_FRACTIONS[1]), 0];
}

export function immortalBerserkerLifeCeilings(maxHp: number): readonly [number, number, number] {
  const max = safeMaxHp(maxHp);
  const floors = immortalBerserkerLifeFloors(max);
  return [max, floors[0], floors[1]];
}

export function immortalBerserkerLifeForHp(maxHp: number, currentHp: number): ImmortalBerserkerLifeIndex {
  const hp = Math.max(0, Math.min(safeMaxHp(maxHp), integer(currentHp)));
  const floors = immortalBerserkerLifeFloors(maxHp);
  if (hp > floors[0]) return 0;
  if (hp > floors[1]) return 1;
  return 2;
}

export function initialImmortalBerserkerState(_maxHp: number): ImmortalBerserkerBattleState {
  return {
    kind: "immortal_berserker",
    lifeIndex: 0,
    regenActionCount: 0,
    regenUsesRemaining: 3,
    revivalsCompleted: 0,
  };
}

export function normalizeImmortalBerserkerState(
  value: unknown,
  maxHp: number,
  currentHp: number,
  options?: { newSession?: boolean },
): ImmortalBerserkerBattleState {
  const lifeIndex = immortalBerserkerLifeForHp(maxHp, currentHp);
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!source || source.kind !== "immortal_berserker") {
    return {
      kind: "immortal_berserker",
      lifeIndex,
      regenActionCount: 0,
      regenUsesRemaining: options?.newSession
        ? MAX_REGEN_USES[lifeIndex]
        : 0,
      revivalsCompleted: lifeIndex,
    };
  }
  const uses = Math.max(
    0,
    Math.min(MAX_REGEN_USES[lifeIndex], integer(source.regenUsesRemaining)),
  ) as ImmortalBerserkerRegenUses;
  return {
    kind: "immortal_berserker",
    lifeIndex,
    regenActionCount: uses > 0
      ? Math.max(0, Math.min(3, integer(source.regenActionCount)))
      : 0,
    regenUsesRemaining: uses,
    revivalsCompleted: lifeIndex,
  };
}

export function immortalBerserkerMultipliers(lifeIndex: ImmortalBerserkerLifeIndex): {
  atkMult: number;
  spdMult: number;
} {
  return MULTIPLIERS[lifeIndex];
}

export function settleImmortalBerserkerDamage(args: {
  state: ImmortalBerserkerBattleState;
  currentHp: number;
  incomingDamage: number;
  maxHp: number;
}): {
  state: ImmortalBerserkerBattleState;
  hp: number;
  appliedDamage: number;
  blockedDamage: number;
  revived: boolean;
  cancelledRemainingActionDamage: boolean;
} {
  const state = normalizeImmortalBerserkerState(
    args.state,
    args.maxHp,
    args.currentHp,
  );
  const currentHp = Math.max(0, Math.min(safeMaxHp(args.maxHp), integer(args.currentHp)));
  const incomingDamage = Math.max(0, integer(args.incomingDamage));
  const floor = immortalBerserkerLifeFloors(args.maxHp)[state.lifeIndex];
  const appliedDamage = Math.min(incomingDamage, Math.max(0, currentHp - floor));
  const hp = currentHp - appliedDamage;
  const blockedDamage = incomingDamage - appliedDamage;
  const revived = hp === floor && floor > 0 && state.lifeIndex < 2;
  if (!revived) {
    return {
      state,
      hp,
      appliedDamage,
      blockedDamage,
      revived: false,
      cancelledRemainingActionDamage: false,
    };
  }
  const lifeIndex = (state.lifeIndex + 1) as ImmortalBerserkerLifeIndex;
  return {
    state: {
      kind: "immortal_berserker",
      lifeIndex,
      regenActionCount: 0,
      regenUsesRemaining: MAX_REGEN_USES[lifeIndex],
      revivalsCompleted: lifeIndex,
    },
    hp,
    appliedDamage,
    blockedDamage,
    revived: true,
    cancelledRemainingActionDamage: true,
  };
}

export function advanceImmortalBerserkerEnemyAction(args: {
  state: ImmortalBerserkerBattleState;
  currentHp: number;
  maxHp: number;
}): {
  state: ImmortalBerserkerBattleState;
  hp: number;
  healed: number;
  regenerationTriggered: boolean;
} {
  const state = normalizeImmortalBerserkerState(
    args.state,
    args.maxHp,
    args.currentHp,
  );
  const hp = Math.max(0, Math.min(safeMaxHp(args.maxHp), integer(args.currentHp)));
  if (state.regenUsesRemaining <= 0) {
    return { state, hp, healed: 0, regenerationTriggered: false };
  }
  const nextActionCount = state.regenActionCount + 1;
  if (nextActionCount < 4) {
    return {
      state: { ...state, regenActionCount: nextActionCount },
      hp,
      healed: 0,
      regenerationTriggered: false,
    };
  }
  const ceilings = immortalBerserkerLifeCeilings(args.maxHp);
  const floors = immortalBerserkerLifeFloors(args.maxHp);
  const lifeMaxHp = ceilings[state.lifeIndex] - floors[state.lifeIndex];
  const requested = Math.floor(lifeMaxHp * REGEN_FRACTIONS[state.lifeIndex]);
  const healed = Math.min(requested, Math.max(0, ceilings[state.lifeIndex] - hp));
  return {
    state: {
      ...state,
      regenActionCount: 0,
      regenUsesRemaining: (state.regenUsesRemaining - 1) as ImmortalBerserkerRegenUses,
    },
    hp: hp + healed,
    healed,
    regenerationTriggered: true,
  };
}

export function immortalBerserkerDisplay(
  stateRaw: ImmortalBerserkerBattleState,
  maxHp: number,
  currentHp: number,
): {
  lifeIndex: ImmortalBerserkerLifeIndex;
  lifeHp: number;
  lifeMaxHp: number;
  regenActionsRemaining: number;
  regenUsesRemaining: ImmortalBerserkerRegenUses;
  nextRegenAmount: number;
  atkMult: number;
  spdMult: number;
} {
  const state = normalizeImmortalBerserkerState(stateRaw, maxHp, currentHp);
  const floors = immortalBerserkerLifeFloors(maxHp);
  const ceilings = immortalBerserkerLifeCeilings(maxHp);
  const lifeMaxHp = ceilings[state.lifeIndex] - floors[state.lifeIndex];
  const multipliers = immortalBerserkerMultipliers(state.lifeIndex);
  return {
    lifeIndex: state.lifeIndex,
    lifeHp: Math.max(0, Math.min(lifeMaxHp, integer(currentHp) - floors[state.lifeIndex])),
    lifeMaxHp,
    regenActionsRemaining: state.regenUsesRemaining > 0
      ? 4 - state.regenActionCount
      : 0,
    regenUsesRemaining: state.regenUsesRemaining,
    nextRegenAmount: state.regenUsesRemaining > 0
      ? Math.floor(lifeMaxHp * REGEN_FRACTIONS[state.lifeIndex])
      : 0,
    ...multipliers,
  };
}
