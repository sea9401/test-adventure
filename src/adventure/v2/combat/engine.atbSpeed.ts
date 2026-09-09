import type { Monster } from "@/adventure/data/monsters";
import { combatRandom } from "./combatRandom";
import { monsterActionSpd } from "./combatTimeline";
import { type BattleState, type PlayerCombat } from "./engineState";
import { glacialChillSpeedMultiplier } from "./glacialColossusMechanic";
import { weightSpeedMultiplier } from "./mutationCombat";

export function rollEnemyAttackCount(enemy: Monster): number {
  const chance = enemy.bonusAttackChancePct ?? 0;
  if (chance <= 0) return 1;
  const guaranteed = Math.floor(chance / 100);
  const remainder = chance - guaranteed * 100;
  return 1 + guaranteed + (combatRandom() * 100 < remainder ? 1 : 0);
}

export function effectivePlayerSpd(
  player: PlayerCombat,
  state: BattleState,
): number {
  const buffed = state.buffs.playerSpdTurnsLeft > 0
    ? player.spd * state.buffs.playerSpdMult
    : player.spd;
  const weighted = buffed * weightSpeedMultiplier(state.stacks.mutationWeight);
  return state.bossMechanic?.kind === "glacial_colossus"
    ? weighted *
        glacialChillSpeedMultiplier(state.bossMechanic.glacialChillStacks)
    : weighted;
}

export function effectiveEnemyTimelineSpd(
  state: BattleState,
  depthCorr: number,
  frostReductionPct = activeFrostSpeedReduction(state),
): number {
  const base = monsterActionSpd(state.enemy, depthCorr);
  const buffed = state.buffs.enemySpdTurnsLeft > 0
    ? base * state.buffs.enemySpdMult
    : base;
  return buffed * (1 - frostReductionPct / 100);
}

export function activeFrostSpeedReduction(state: BattleState): number {
  const frost = state.unexploredSetRuntime?.frost;
  return frost && frost.actions > 0 ? frost.speedReductionPct : 0;
}
