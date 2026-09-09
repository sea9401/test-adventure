import { CRIT_MULT_BASE } from "@/adventure/data/v2/v2CombatConstants";
import { V2_HP_PER_LEVEL, V2_MP_PER_LEVEL } from "@/adventure/data/v2/v2Stats";
import { CRIT_MULT_CEIL, CRIT_MULT_SCALE, HP_PER_STR, HP_PER_VIT, MP_PER_INT } from "./v2CombatCoefficients";

export function v2LevelGrowthHpMp(args: {
  levelsGained: number;
  strGained: number;
  vitGained: number;
  intGained: number;
}): { hp: number; mp: number } {
  return {
    hp:
      args.levelsGained * V2_HP_PER_LEVEL +
      args.strGained * HP_PER_STR +
      args.vitGained * HP_PER_VIT,
    mp: args.levelsGained * V2_MP_PER_LEVEL + args.intGained * MP_PER_INT,
  };
}

export function critMultCurve(bonus: number): number {
  return (
    CRIT_MULT_CEIL -
    (CRIT_MULT_CEIL - CRIT_MULT_BASE) *
      Math.exp(-Math.max(0, bonus) / CRIT_MULT_SCALE)
  );
}
