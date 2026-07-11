export const WOODCUTTING_LEVEL_CAP = 50;
export const WOODCUTTING_XP_PER_CUT = 10;
export const WOODCUTTING_TIME_REDUCTION_PER_LEVEL = 0.002;
export const WOODCUTTING_TIME_REDUCTION_CAP = 0.1;
export const WOODCUTTING_FAILURE_REDUCTION_PER_LEVEL = 0.015;
export const WOODCUTTING_FAILURE_REDUCTION_CAP = 0.75;
const WOODCUTTING_LEVEL_CURVE = 40;

export type WoodcuttingProgressionView = {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number;
  cuts: number;
  maxLevel: boolean;
};

function nonNegativeInt(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

export function woodcuttingXpForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.min(WOODCUTTING_LEVEL_CAP, Math.floor(level) || 1));
  return (safeLevel - 1) ** 2 * WOODCUTTING_LEVEL_CURVE;
}

export function woodcuttingLevelForXp(xp: number): number {
  const safeXp = nonNegativeInt(xp);
  return Math.min(
    WOODCUTTING_LEVEL_CAP,
    Math.floor(Math.sqrt(safeXp / WOODCUTTING_LEVEL_CURVE)) + 1,
  );
}

export function woodcuttingTimeReduction(level: number): number {
  const safeLevel = Math.max(1, Math.min(WOODCUTTING_LEVEL_CAP, Math.floor(level) || 1));
  return Math.min(
    WOODCUTTING_TIME_REDUCTION_CAP,
    (safeLevel - 1) * WOODCUTTING_TIME_REDUCTION_PER_LEVEL,
  );
}

export function woodcuttingDurationForLevel(baseDurationMs: number, level: number): number {
  const safeBase = Math.max(1_000, nonNegativeInt(baseDurationMs));
  return Math.max(
    1_000,
    Math.round((safeBase * (1 - woodcuttingTimeReduction(level))) / 100) * 100,
  );
}

export function woodcuttingFailureRate(baseFailureRate: number, level: number): number {
  const safeBase = Math.min(1, Math.max(0, Number(baseFailureRate) || 0));
  const safeLevel = Math.max(1, Math.min(WOODCUTTING_LEVEL_CAP, Math.floor(level) || 1));
  const reduction = Math.min(
    WOODCUTTING_FAILURE_REDUCTION_CAP,
    (safeLevel - 1) * WOODCUTTING_FAILURE_REDUCTION_PER_LEVEL,
  );
  return safeBase * (1 - reduction);
}

export function woodcuttingProgressionView(
  cuts: number,
  earnedXp?: number,
): WoodcuttingProgressionView {
  const safeCuts = nonNegativeInt(cuts);
  const xp = earnedXp == null ? safeCuts * WOODCUTTING_XP_PER_CUT : nonNegativeInt(earnedXp);
  const level = woodcuttingLevelForXp(xp);
  const maxLevel = level >= WOODCUTTING_LEVEL_CAP;
  const levelStartXp = woodcuttingXpForLevel(level);
  const nextLevelXp = maxLevel ? levelStartXp : woodcuttingXpForLevel(level + 1);
  return {
    level,
    xp,
    xpIntoLevel: maxLevel ? 0 : xp - levelStartXp,
    xpForNext: maxLevel ? 0 : nextLevelXp - levelStartXp,
    cuts: safeCuts,
    maxLevel,
  };
}
