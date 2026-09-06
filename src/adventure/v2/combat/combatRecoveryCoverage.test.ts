import { expect, it } from "vitest";
import type { Monster } from "@/adventure/data/monsters";
import { POTIONS } from "@/adventure/data/potions";
import type { PlayerCombat } from "./engineState";
import { initialBattleState } from "./engine.pveOperations";
import { initialBattleStatePvP } from "./engine.pvpInitialState";
import { applyEvasionActionRecoveryPvE } from "./engineSupport";
import { applyEvasionActionRecoveryPvP, tickPvPSideDotsOnAction } from "./engine.pvpOperations";
import { advanceTurn, resolveBattle } from "./engine";
import { resolveBattleAtb } from "./engine.atb";
import { advanceTurnPvP } from "./engine.pvpPhase";
import { applyEnemyV2SkillCast } from "./engine.enemySkills";
import { castV2SkillOnAttackerTurnPvP } from "./engine.pvpSkills";
import { createCombatDiagnostics, withCombatDiagnostics } from "./combatDiagnostics";
import { withCombatRandom } from "./combatRandom";

const player: PlayerCombat = { hp: 95, maxHp: 100, atk: 20, def: 0, spd: 100, evasionPct: 0, attackCount: 1, accuracyPct: 100 };
const enemy = { name: "target", hp: 500, atk: 20, def: 0, spd: 1, exp: 0, tags: [] };

it("records endurance after a monster-applied poison tick in a whole battle", () => {
  const actor = { ...player, hp: 1, enduranceActive: true };
  const collector = createCombatDiagnostics();
  withCombatDiagnostics(collector, () => resolveBattle(actor, {
    ...enemy, spd: 1000, v2Skills: { learned: ["mob_venom_bite"], equipped: ["mob_venom_bite"] },
  }, "A", { maxTurns: 10, random: () => 0.5, potions: {}, pickAction: () => ({ kind: "attack" }) }));
  expect(collector.snapshot()).toContainEqual({ metric: "survival_restoration", source: "endurance", target: "player", total: 1, count: 1 });
});

it.each([false, true])("records action-evasion recovery (PvP %s)", (pvp) => {
  const actor: PlayerCombat = { ...player, evaRating: 100, evasionPct: 100,
    equipSignatures: [{ trigger: "on_action_evasion", label: "recovery", lostHpHealPct: 100 }] };
  const collector = createCombatDiagnostics();
  withCombatDiagnostics(collector, () => {
    if (pvp) expect(applyEvasionActionRecoveryPvP(initialBattleStatePvP(actor, player, "A", "B"), "p1", () => 0).p1.hp).toBe(100);
    else expect(applyEvasionActionRecoveryPvE(initialBattleState(actor, enemy, "A"), actor, "A", () => 0).playerHp).toBe(100);
  });
  expect(collector.snapshot()).toContainEqual({ metric: "healing", source: "evasion_recovery", target: pvp ? "p1" : "player", total: 5, count: 1 });
});

it.each(["legacy", "pvp"])("records capped bleed-tick recovery in %s", (mode) => {
  const actor = { ...player, hp: 995, maxHp: 1000 };
  const skill = "v2c_predator_bloodnourishment" as const;
  const bleed = { tag: "bleed" as const, label: "bleed", stacks: 10, maxStacks: 10, turns: 3, flatPerStack: 50, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 0 };
  const collector = createCombatDiagnostics();
  withCombatDiagnostics(collector, () => withCombatRandom(() => 0.5, () => {
    if (mode === "pvp") {
      const state = initialBattleStatePvP(actor, player, "A", "B");
      state.p1.v2Skills = { learned: [skill], equipped: [skill] };
      state.p2.v2Dots = [bleed];
      expect(tickPvPSideDotsOnAction(state, "p2").p1.hp).toBe(1000);
    } else {
      const state = initialBattleState(actor, { ...enemy, hp: 50 }, "A");
      state.v2Skills = { learned: [skill], equipped: [skill] };
      state.enemyV2Dots = [bleed];
      state.phase = "enemy";
      const next = advanceTurn(state, actor, "A");
      expect(next.playerHp).toBe(1000);
    }
  }));
  expect(collector.snapshot()).toContainEqual({ metric: "healing", source: "bleed_hunt", target: mode === "pvp" ? "p1" : "player", total: 5, count: 1 });
});

it.each([false, true])("records enemy skill damage and manual endurance (whole battle %s)", (wholeBattle) => {
  const actor = { ...player, enduranceActive: true };
  const target: Monster = { ...enemy, atk: 100, v2Skills: { learned: ["mob_crushing_blow"], equipped: ["mob_crushing_blow"] }, v2MaxMp: 999 };
  const state = initialBattleState(actor, target, "A");
  state.phase = "enemy";
  const collector = createCombatDiagnostics();
  const next = withCombatDiagnostics(collector, () => withCombatRandom(() => 0, () => wholeBattle
    ? resolveBattle(actor, target, "A", { maxTurns: 20, random: () => 0, potions: {}, pickAction: () => ({ kind: "attack" }) }).finalState : applyEnemyV2SkillCast(state, actor).state));
  if (!wholeBattle) expect(next.playerHp).toBe(1);
  expect(collector.snapshot()).toContainEqual({ metric: "hp_damage", source: "mob_crushing_blow", target: "player", total: 95, count: 1 });
  expect(collector.snapshot()).toContainEqual({ metric: "survival_restoration", source: "endurance", target: "player", total: 1, count: 1 });
});

it.each([false, true])("records PvP primary-hit endurance (skill %s)", (skill) => {
  const actor = { ...player, atk: 1000, mp: 999, maxMp: 999 };
  const state = initialBattleStatePvP(actor, { ...player, enduranceActive: true }, "A", "B", { learned: ["v2c_warrior_strike"], equipped: ["v2c_warrior_strike"] });
  const collector = createCombatDiagnostics();
  const next = withCombatDiagnostics(collector, () => withCombatRandom(() => 0.1, () => skill
    ? castV2SkillOnAttackerTurnPvP(state, "p1").state : advanceTurnPvP(state, { kind: "attack" })));
  expect(next.p2.hp).toBe(1);
  expect(collector.snapshot()).toContainEqual({ metric: "survival_restoration", source: "endurance", target: "p2", total: 1, count: 1 });
});

it.each([false, true])("records capped enemy self-healing (whole battle %s)", (wholeBattle) => {
  const target: Monster = { ...enemy, spd: 1000, v2Skills: { learned: ["v2_skill_recover"], equipped: ["v2_skill_recover"] }, v2MaxMp: 999 };
  const collector = createCombatDiagnostics();
  withCombatDiagnostics(collector, () => withCombatRandom(() => 0, () => {
    if (wholeBattle) resolveBattle(player, target, "A", { initialEnemyHp: 495, maxTurns: 20, random: () => 0, potions: { potion_mp_s: 100 }, pickAction: () => ({ kind: "use_potion", potionId: "potion_mp_s", potion: POTIONS.potion_mp_s }) });
    else {
      const state = initialBattleState(player, target, "A");
      state.enemyHp = 495;
      expect(applyEnemyV2SkillCast(state, player).state.enemyHp).toBe(500);
    }
  }));
  expect(collector.snapshot()).toContainEqual({ metric: "healing", source: "v2_skill_recover", target: "enemy", total: 5, count: 1 });
});

it.each([false, true])("records enemy-skill reflection or evasion recovery (evade %s)", (evade) => {
  const actor = { ...player, guaranteedEvades: evade ? 1 : 0, evadeHealAmount: 20, thornsPct: 50 };
  const target: Monster = { ...enemy, atk: 100, v2Skills: { learned: ["mob_crushing_blow"], equipped: ["mob_crushing_blow"] }, v2MaxMp: 999 };
  const collector = createCombatDiagnostics();
  const next = withCombatDiagnostics(collector, () => withCombatRandom(() => 0, () => applyEnemyV2SkillCast(initialBattleState(actor, target, "A"), actor).state));
  if (evade) {
    expect(next.playerHp).toBe(100);
    expect(collector.snapshot()).toContainEqual({ metric: "healing", source: "dodge", target: "player", total: 5, count: 1 });
  } else {
    expect(next.enemyHp).toBe(390);
    expect(collector.snapshot()).toContainEqual({ metric: "hp_damage", source: "reflect", target: "enemy", total: 110, count: 1 });
  }
});

it("accounts for bleed recovery through the real ATB scheduler", () => {
  const actor: PlayerCombat = { ...player, hp: 995, maxHp: 1000, atk: 1, attackCount: 10, bleedOnHit: { flatPerStack: 50, atkCoefPerStack: 0 } };
  const skill = "v2c_predator_bloodnourishment";
  const collector = createCombatDiagnostics();
  withCombatDiagnostics(collector, () => withCombatRandom(() => 0.5, () => resolveBattleAtb(actor, { ...enemy, hp: 100000, atk: 1 }, "A", {
    maxTurns: 100, potions: {}, pickAction: () => ({ kind: "attack" }), v2Skills: { learned: [skill], equipped: [skill] },
  })));
  expect(collector.snapshot().some((row) => row.metric === "healing" && row.source === "bleed_hunt" && row.total > 0)).toBe(true);
});
