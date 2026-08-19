import { V2_SKILLS } from "@/adventure/data/v2/v2Skills";

export type CrossFamily = "ranged" | "martial";
export type CrossState = { lastFamily?: CrossFamily };
export type CrossBonus = "none" | "capture" | "pursuit";

export type CrossoverResult = {
  state: CrossState;
  bonus: CrossBonus;
  damagePct: number;
  accuracyBonusPct: number;
  penetrationPct: number;
  enemyDelayPct: number;
  hastePct: number;
};

const EMPTY_BONUS = {
  bonus: "none" as const,
  damagePct: 0,
  accuracyBonusPct: 0,
  penetrationPct: 0,
  enemyDelayPct: 0,
  hastePct: 0,
};

export function resolveCrossover(input: {
  state: CrossState;
  currentFamily?: CrossFamily;
  hit: boolean;
  pvp: boolean;
}): CrossoverResult {
  if (!input.currentFamily) return { state: input.state, ...EMPTY_BONUS };
  const state = { lastFamily: input.currentFamily };
  const crossed =
    input.state.lastFamily != null &&
    input.state.lastFamily !== input.currentFamily;
  if (!crossed || !input.hit) return { state, ...EMPTY_BONUS };

  const mechanic = V2_SKILLS.v2c_skyascendant_crossover.tier7Mechanic;
  if (!mechanic || mechanic.kind !== "crossCore") {
    return { state, ...EMPTY_BONUS };
  }
  if (input.currentFamily === "ranged") {
    return {
      state,
      bonus: "capture",
      damagePct: input.pvp
        ? mechanic.pvpCaptureDamagePct
        : mechanic.captureDamagePct,
      accuracyBonusPct: mechanic.captureAccuracyPct,
      penetrationPct: input.pvp
        ? mechanic.pvpCapturePenetrationPct
        : mechanic.capturePenetrationPct,
      enemyDelayPct: 0,
      hastePct: input.pvp ? mechanic.pvpHastePct : mechanic.hastePct,
    };
  }
  return {
    state,
    bonus: "pursuit",
    damagePct: input.pvp
      ? mechanic.pvpPursuitDamagePct
      : mechanic.pursuitDamagePct,
    accuracyBonusPct: 0,
    penetrationPct: 0,
    enemyDelayPct: input.pvp
      ? mechanic.pvpPursuitEnemyDelayPct
      : mechanic.pursuitEnemyDelayPct,
    hastePct: input.pvp ? mechanic.pvpHastePct : mechanic.hastePct,
  };
}
