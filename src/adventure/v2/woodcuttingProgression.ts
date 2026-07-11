export const WOODCUTTING_LEVEL_CAP = 50;
export const WOODCUTTING_XP_PER_CUT = 10;
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

export function woodcuttingProgressionView(cuts: number): WoodcuttingProgressionView {
  const safeCuts = nonNegativeInt(cuts);
  const xp = safeCuts * WOODCUTTING_XP_PER_CUT;
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
