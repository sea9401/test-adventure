import {
  LIFE_LEVEL_CAP,
  extendedLifeLevelForXp,
  extendedLifeXpThreshold,
} from "./lifeLevelProgression";

export const MINING_LEVEL_CAP = LIFE_LEVEL_CAP;
export const MINING_XP_PER_SUCCESS = 10;
export const MINING_TIME_REDUCTION_PER_LEVEL = 0.002;
export const MINING_TIME_REDUCTION_CAP = 0.1;
export const MINING_FAILURE_REDUCTION_PER_LEVEL = 0.015;
export const MINING_FAILURE_REDUCTION_CAP = 0.75;
const MINING_LEVEL_CURVE = 40;

function legacyMiningXpForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.min(50, Math.floor(level) || 1));
  return (safeLevel - 1) ** 2 * MINING_LEVEL_CURVE;
}

export type MiningProgressionView = {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number;
  successes: number;
  maxLevel: boolean;
};

function nonNegativeInt(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

export function miningXpForLevel(level: number): number {
  return extendedLifeXpThreshold(level, legacyMiningXpForLevel);
}

export function miningLevelForXp(xp: number): number {
  return extendedLifeLevelForXp(xp, legacyMiningXpForLevel);
}

export function miningTimeReduction(level: number): number {
  const safeLevel = Math.max(1, Math.min(MINING_LEVEL_CAP, Math.floor(level) || 1));
  return Math.min(
    MINING_TIME_REDUCTION_CAP,
    (safeLevel - 1) * MINING_TIME_REDUCTION_PER_LEVEL,
  );
}

export function miningDurationForLevel(baseDurationMs: number, level: number): number {
  const safeBase = Math.max(1_000, nonNegativeInt(baseDurationMs));
  return Math.max(
    1_000,
    Math.round((safeBase * (1 - miningTimeReduction(level))) / 100) * 100,
  );
}

function miningPassiveTimeReduction(durationReductionPct: number): number {
  const safePct = Number(durationReductionPct) || 0;
  return Math.min(0.5, Math.max(0, safePct / 100));
}

export function miningDurationWithPassive(
  baseDurationMs: number,
  level: number,
  durationReductionPct: number,
): number {
  const levelDurationMs = miningDurationForLevel(baseDurationMs, level);
  return Math.max(
    1_000,
    Math.round(
      (levelDurationMs * (1 - miningPassiveTimeReduction(durationReductionPct))) /
        100,
    ) * 100,
  );
}

export function miningFailureRate(baseFailureRate: number, level: number): number {
  const safeBase = Math.min(1, Math.max(0, Number(baseFailureRate) || 0));
  const safeLevel = Math.max(1, Math.min(MINING_LEVEL_CAP, Math.floor(level) || 1));
  const reduction = Math.min(
    MINING_FAILURE_REDUCTION_CAP,
    (safeLevel - 1) * MINING_FAILURE_REDUCTION_PER_LEVEL,
  );
  return safeBase * (1 - reduction);
}

export function miningProgressionView(
  successes: number,
  earnedXp?: number,
): MiningProgressionView {
  const safeSuccesses = nonNegativeInt(successes);
  const xp =
    earnedXp == null
      ? safeSuccesses * MINING_XP_PER_SUCCESS
      : nonNegativeInt(earnedXp);
  const level = miningLevelForXp(xp);
  const maxLevel = level >= MINING_LEVEL_CAP;
  const levelStartXp = miningXpForLevel(level);
  const nextLevelXp = maxLevel ? levelStartXp : miningXpForLevel(level + 1);
  return {
    level,
    xp,
    xpIntoLevel: maxLevel ? 0 : xp - levelStartXp,
    xpForNext: maxLevel ? 0 : nextLevelXp - levelStartXp,
    successes: safeSuccesses,
    maxLevel,
  };
}
