import { healingAfterBurn, healingReductionPct } from "./burnHealing";
import { V2_SKILLS, type V2SkillId } from "@/adventure/data/v2/v2Skills";
import { type BattleState, type PlayerCombat } from "./engineState";
import { type PvPBattleState } from "./engine.pvpState";
import { appendLog } from "./engineSupport";
import { applySkillHealing } from "./engine.skillHealing";
import { healingAfterReceivedMultiplier } from "./combatShared";
import { scalePvPHealing } from "./engine.pvpScaling";
import { castHolyPower, normalizeHolyPower, tickHolyPower, type HolyPowerState } from "./holyPower";

export function initialHolyPower(equipped: readonly V2SkillId[]) {
  return equipped.some(id => V2_SKILLS[id]?.holyPower)
    ? { holyPower: normalizeHolyPower() } : {};
}

function cast(value: HolyPowerState | undefined, skillId: V2SkillId | null) {
  const action = skillId ? V2_SKILLS[skillId]?.holyPower : undefined;
  if (!action) return null;
  return {
    state: castHolyPower(value, action),
    text: action === "sanctuary" ? "[성역 선포] 성역 4행동 전개" : `[여명의 심판] 성력 ${normalizeHolyPower(value).power} 소비`,
  };
}

export function applyHolyPowerPveCast(state: BattleState, skillId: V2SkillId | null): BattleState {
  const result = cast(state.stacks.holyPower, skillId);
  return result ? { ...state, stacks: { ...state.stacks, holyPower: result.state }, log: appendLog(state.log, { kind: "info", text: result.text, turn: "player" }) } : state;
}

export function applyHolyPowerPvpCast(state: PvPBattleState, who: "p1" | "p2", skillId: V2SkillId | null): PvPBattleState {
  const side = state[who];
  const result = cast(side.stacks.holyPower, skillId);
  return result ? { ...state, [who]: { ...side, stacks: { ...side.stacks, holyPower: result.state } }, log: appendLog(state.log, { kind: "info", text: result.text, side: who }) } : state;
}

function sanctuaryHealing(maxHp: number, pct: number, player: PlayerCombat) {
  return healingAfterReceivedMultiplier(Math.floor(maxHp * pct / 100 * (player.healMult ?? 1)), player.receivedHealMult);
}

export function tickHolyPowerPve(state: BattleState, player: PlayerCombat, name: string): BattleState {
  if (!state.stacks.holyPower || state.playerHp <= 0 || state.phase === "ended") return state;
  const tick = tickHolyPower(state.stacks.holyPower);
  if (tick.healPct === 0) return state;
  const heal = applySkillHealing({ hp: state.playerHp, maxHp: state.playerMaxHp, player, playerName: name, skillName: "성역 선포", skillHeal: healingAfterBurn(sanctuaryHealing(state.playerMaxHp, tick.healPct, player), state.playerV2Dots), passiveHeal: 0, log: state.log });
  return { ...state, playerHp: heal.hp, stacks: { ...state.stacks, holyPower: tick.state, playerShield: state.stacks.playerShield + heal.shield }, log: appendLog(heal.log, { kind: "info", text: `[성역] 성력 +${tick.gained} (${tick.state.power}/100), ${tick.state.sanctuaryTurns}행동 남음`, turn: "player" }) };
}

export function tickHolyPowerPvp(state: PvPBattleState, who: "p1" | "p2"): PvPBattleState {
  const side = state[who];
  if (!side.stacks.holyPower || side.hp <= 0 || state.phase === "ended") return state;
  const tick = tickHolyPower(side.stacks.holyPower);
  if (tick.healPct === 0) return state;
  const reduction = healingReductionPct(side.v2Dots, side.stacks.healReduceTurns > 0 ? side.stacks.healReducePct : 0);
  const rawHeal = sanctuaryHealing(side.maxHp, tick.healPct, side.player);
  const heal = applySkillHealing({ hp: side.hp, maxHp: side.maxHp, player: side.player, playerName: side.name, skillName: "성역 선포", skillHeal: scalePvPHealing(state, Math.floor(rawHeal * (1 - reduction / 100))), passiveHeal: 0, log: state.log, side: who });
  return { ...state, [who]: { ...side, hp: heal.hp, stacks: { ...side.stacks, holyPower: tick.state, playerShield: side.stacks.playerShield + heal.shield } }, log: appendLog(heal.log, { kind: "info", text: `[성역] 성력 +${tick.gained} (${tick.state.power}/100), ${tick.state.sanctuaryTurns}행동 남음`, side: who }) };
}
