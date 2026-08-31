import { actionRate } from "./combatTimeline";

const BASE_INITIATIVE_WEIGHT = 100;
const MIN_INITIATIVE_CHANCE = 0.35;
const MAX_INITIATIVE_CHANCE = 0.65;

export type PvPInitiativeActor = "p1" | "p2";

export function pvpInitiativeChance(p1Spd: number, p2Spd: number): number {
  const p1Weight = BASE_INITIATIVE_WEIGHT + actionRate(p1Spd);
  const p2Weight = BASE_INITIATIVE_WEIGHT + actionRate(p2Spd);
  const rawChance = p1Weight / (p1Weight + p2Weight);
  return Math.max(
    MIN_INITIATIVE_CHANCE,
    Math.min(MAX_INITIATIVE_CHANCE, rawChance),
  );
}

export function pickPvpInitiative(
  p1Spd: number,
  p2Spd: number,
  roll: number,
): PvPInitiativeActor {
  return roll < pvpInitiativeChance(p1Spd, p2Spd) ? "p1" : "p2";
}
