import type { EquippedLiberationEffects } from "@/adventure/data/v2/equipmentLiberationEffects";
import type { V2ProficiencyState } from "@/adventure/data/v2/proficiency";

function randomUnit(rng: () => number): number {
  const value = Number(rng());
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, 1 - Number.EPSILON);
}

function rollInclusive(max: number, rng: () => number): number {
  const normalizedMax = Math.max(0, Math.floor(max));
  if (normalizedMax <= 0) return 0;
  return Math.floor(randomUnit(rng) * (normalizedMax + 1));
}

export function applyLiberationLevelGrowth(args: {
  proficiency: V2ProficiencyState;
  levelsGained: number;
  effects: Pick<EquippedLiberationEffects, "growth">;
  rng: () => number;
}): {
  proficiency: V2ProficiencyState;
  hpGained: number;
  mpGained: number;
} {
  const levelsGained = Math.max(0, Math.floor(args.levelsGained));
  const hpMax = Math.max(0, Math.floor(args.effects.growth.levelUpMaxHpGrowth));
  const mpMax = Math.max(0, Math.floor(args.effects.growth.levelUpMaxMpGrowth));
  if (levelsGained === 0 || (hpMax === 0 && mpMax === 0)) {
    return { proficiency: args.proficiency, hpGained: 0, mpGained: 0 };
  }

  let hpGained = 0;
  let mpGained = 0;
  for (let level = 0; level < levelsGained; level += 1) {
    if (hpMax > 0) hpGained += rollInclusive(hpMax, args.rng);
    if (mpMax > 0) mpGained += rollInclusive(mpMax, args.rng);
  }

  const previous = args.proficiency.liberationCycleGrowth ?? { hp: 0, mp: 0 };
  return {
    proficiency: {
      ...args.proficiency,
      liberationCycleGrowth: {
        hp: previous.hp + hpGained,
        mp: previous.mp + mpGained,
      },
    },
    hpGained,
    mpGained,
  };
}
