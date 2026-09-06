import { describe, expect, it } from "vitest";
import { createCombatDiagnostics, withCombatDiagnostics } from "./combatDiagnostics";
import { applyEnemyDamage, applyRegenIfAny, initialBattleState } from "./engine.pveOperations";
import { resolveBattle, type PlayerCombat } from "./engine";
import { resolveBattlePvP } from "./engine-pvp";
import { seededCombatRandom, withCombatRandom } from "./combatRandom";
import { tickPlayerDotsOnAction } from "./engine.atb";
import { applyPlayerV2SkillCast } from "./engine.playerSkills";
import { initialBattleStatePvP } from "./engine.pvpInitialState";
import { castV2SkillOnAttackerTurnPvP } from "./engine.pvpSkills";

const player: PlayerCombat = { hp: 95, maxHp: 100, atk: 30, def: 10, spd: 500, evasionPct: 0, attackCount: 1, accuracyPct: 100, regen: { interval: 1, amount: 20 } };
const enemy = { name: "test", hp: 100, atk: 10, def: 5, spd: 6, exp: 0, tags: [] };
describe("resolved combat metrics", () => {
  it("separates PvP skill HP damage from shield absorption", () => {
    const skill = "v2c_warrior_strike";
    const actor = { ...player, mp: 999, maxMp: 999, atk: 1000 };
    const state = initialBattleStatePvP(actor, { ...player, hp: 10, bulwarkShield: 20 }, "A", "B", { learned: [skill], equipped: [skill] });
    const collector = createCombatDiagnostics();
    withCombatDiagnostics(collector, () => withCombatRandom(() => 0, () => castV2SkillOnAttackerTurnPvP(state, "p1")));
    expect(collector.snapshot()).toContainEqual({ metric: "hp_damage", source: skill, target: "p2", total: 10, count: 1 });
    expect(collector.snapshot()).toContainEqual({ metric: "skill_cast", source: skill, target: "p1", total: 1, count: 1 });
    expect(collector.snapshot()).toContainEqual({ metric: "shield_absorption", source: skill, target: "p2", total: 20, count: 1 });
  });
  it("attributes direct skill damage to its id and caps it at the target HP", () => {
    const skill = "v2c_warrior_strike";
    const actor = { ...player, mp: 999, maxMp: 999, atk: 1000 };
    const state = initialBattleState(actor, { ...enemy, hp: 10 }, "P", { learned: [skill], equipped: [skill] });
    const collector = createCombatDiagnostics();
    const result = withCombatDiagnostics(collector, () => withCombatRandom(() => 0, () =>
      applyPlayerV2SkillCast(state, actor, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} })));
    expect(result.castFired).toBe(true);
    expect(collector.snapshot()).toContainEqual({ metric: "skill_cast", source: skill, target: "player", total: 1, count: 1 });
    expect(result.state.enemyHp).toBe(0);
    expect(collector.snapshot()).toContainEqual({ metric: "hp_damage", source: skill, target: "enemy", total: 10, count: 1 });
  });
  it("attributes simultaneous DoTs without doubling their combined damage", () => {
    const state = initialBattleState(player, enemy, "P");
    state.playerV2Dots = [
      { tag: "poison", label: "P", stacks: 1, maxStacks: 10, turns: 3, flatPerStack: 3, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 1000 },
      { tag: "bleed", label: "B", stacks: 1, maxStacks: 10, turns: 3, flatPerStack: 7, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 1000 },
    ];
    const collector = createCombatDiagnostics();
    const result = withCombatDiagnostics(collector, () => tickPlayerDotsOnAction(state, player, "P"));
    expect(result.playerHp).toBe(85);
    expect(collector.snapshot().filter((row) => row.metric === "hp_damage")).toEqual([
      { metric: "hp_damage", source: "poison", target: "player", total: 3, count: 1 },
      { metric: "hp_damage", source: "bleed", target: "player", total: 7, count: 1 },
    ]);
  });
  it("caps applied damage and recovery instead of reporting overkill or overheal", () => {
    const collector = createCombatDiagnostics();
    const state = initialBattleState(player, enemy, "P");
    state.turn.completedPlayerTurns = 1;
    withCombatDiagnostics(collector, () => {
      expect(applyEnemyDamage(state, 250).enemyHp).toBe(0);
      expect(applyRegenIfAny(state, player, "P").playerHp).toBe(100);
    });
    expect(collector.snapshot()).toContainEqual({ metric: "hp_damage", source: "extra", target: "enemy", total: 100, count: 1 });
    expect(collector.snapshot()).toContainEqual({ metric: "resolved_damage", source: "extra", target: "enemy", total: 250, count: 1 });
    expect(collector.snapshot()).toContainEqual({ metric: "healing", source: "regen", target: "player", total: 5, count: 1 });
  });
  it.each(["full", "summary"] as const)("leaves seeded PvE/PvP state unchanged in %s mode", (logMode) => {
    const run = () => resolveBattle(player, enemy, "P", { logMode, random: seededCombatRandom(9), potions: {}, pickAction: () => ({ kind: "attack" }) });
    const pvp = () => resolveBattlePvP(player, { ...player, bulwarkShield: 20 }, "A", "B", {
      logMode, random: seededCombatRandom(9), potions: { p1: {}, p2: {} }, pickAction: () => ({ kind: "attack" }),
    });
    const expected = run(), expectedPvp = pvp();
    const collector = createCombatDiagnostics();
    expect(withCombatDiagnostics(collector, run)).toEqual(expected);
    expect(withCombatDiagnostics(collector, pvp)).toEqual(expectedPvp);
    expect(collector.snapshot().some((row) => row.metric === "hp_damage" && row.source === "basic")).toBe(true);
    expect(collector.snapshot().some((row) => row.metric === "shield_absorption" && row.target === "p2")).toBe(true);
  });
});
