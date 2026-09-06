import { describe, expect, it } from "vitest";
import { POTIONS } from "@/adventure/data/potions";
import type { PlayerCombat } from "./engineState";
import { initialBattleState, applyPotionEffect, dealExtraEnemyDamage } from "./engine.pveOperations";
import { initialBattleStatePvP } from "./engine.pvpInitialState";
import { applyPotionTo, dealExtraDamage, applyDodgeEffects, maybeApplyRuneCounter, maybeApplyMartialCounter, finishAttackerTurn, applyOnHitReflect, tickPvPSideDotsOnAction } from "./engine.pvpOperations";
import { resolveEnemyPhase } from "./engine.enemyPhase";
import { tickPlayerDotsOnAction } from "./engine.atb";
import { createCombatDiagnostics, withCombatDiagnostics } from "./combatDiagnostics";
import { withCombatRandom } from "./combatRandom";

const player: PlayerCombat = { hp: 95, maxHp: 100, atk: 20, def: 0, spd: 100, evasionPct: 0, attackCount: 1, accuracyPct: 100 };
const enemy = { name: "target", hp: 500, atk: 20, def: 0, spd: 1, exp: 0, tags: [] };
const poison = { tag: "poison" as const, label: "poison", stacks: 1, maxStacks: 10, turns: 3, flatPerStack: 200, atkCoefPerStack: 0, pctMaxHpPerStack: 0, sourceAtk: 0 };

describe("remaining calculation-site diagnostics", () => {
  it.each([false, true])("records only actual potion recovery, not MP or overheal (PvP %s)", (pvp) => {
    const collector = createCombatDiagnostics();
    withCombatDiagnostics(collector, () => {
      if (pvp) {
        const state = initialBattleStatePvP(player, player, "A", "B");
        const healed = applyPotionTo(state, "p1", POTIONS.potion_heal_s);
        expect(healed.p1.hp).toBe(100);
        applyPotionTo(healed, "p1", POTIONS.potion_heal_s);
        applyPotionTo(healed, "p1", POTIONS.potion_mp_s);
      } else {
        const state = initialBattleState(player, enemy, "A");
        const healed = applyPotionEffect(state, POTIONS.potion_heal_s, "A");
        expect(healed.playerHp).toBe(100);
        applyPotionEffect(healed, POTIONS.potion_heal_s, "A");
        applyPotionEffect(healed, POTIONS.potion_mp_s, "A");
      }
    });
    expect(collector.snapshot()).toEqual([{ metric: "healing", source: "potion", target: pvp ? "p1" : "player", total: 5, count: 1 }]);
  });
  it.each([false, true])("records capped extra-hit lifesteal (PvP %s)", (pvp) => {
    const actor = { ...player, runeLifestealPct: 100 };
    const collector = createCombatDiagnostics();
    withCombatDiagnostics(collector, () => {
      if (pvp) expect(dealExtraDamage(initialBattleStatePvP(actor, player, "A", "B"), "p1", "p2", 20, "extra").p1.hp).toBe(100);
      else expect(dealExtraEnemyDamage(initialBattleState(actor, enemy, "A"), 20, "extra", actor, "A").playerHp).toBe(100);
    });
    expect(collector.snapshot()).toContainEqual({ metric: "healing", source: "extra_lifesteal", target: pvp ? "p1" : "player", total: 5, count: 1 });
  });
  it.each(["rune_counter", "martial_counter"])("attributes PvP %s to its damaged target", (source) => {
    const actor = { ...player, runeCounterChancePct: 100, passiveCounterChancePct: 100 };
    const collector = createCombatDiagnostics();
    const next = withCombatDiagnostics(collector, () => withCombatRandom(() => 0.5, () =>
      (source === "rune_counter" ? maybeApplyRuneCounter : maybeApplyMartialCounter)(initialBattleStatePvP(player, actor, "A", "B"), "p1", "p2")));
    expect(next.state.p1.hp).toBe(75);
    expect(collector.snapshot()).toContainEqual({ metric: "hp_damage", source, target: "p1", total: 20, count: 1 });
  });
  it("separates dodge reflection, dodge counter and capped dodge healing", () => {
    const defender = { ...player, evadeHealAmount: 20, reflexEvadeMult: 1, counterAtkBonus: 10 };
    const collector = createCombatDiagnostics();
    const next = withCombatDiagnostics(collector, () => applyDodgeEffects(initialBattleStatePvP(player, defender, "A", "B"), "p1", "p2", "dodge", false, false));
    expect(next.p1.hp).toBe(45);
    expect(next.p2.hp).toBe(100);
    expect(collector.snapshot()).toContainEqual({ metric: "hp_damage", source: "reflect_on_dodge", target: "p1", total: 20, count: 1 });
    expect(collector.snapshot()).toContainEqual({ metric: "hp_damage", source: "counter_on_dodge", target: "p1", total: 30, count: 1 });
    expect(collector.snapshot()).toContainEqual({ metric: "healing", source: "dodge", target: "p2", total: 5, count: 1 });
  });
  it("records PvP skill regeneration once at the actual recovery site", () => {
    const state = initialBattleStatePvP(player, player, "A", "B");
    state.p1.stacks.skillRegenTurns = 2;
    state.p1.stacks.skillRegenPct = 20;
    const collector = createCombatDiagnostics();
    const next = withCombatDiagnostics(collector, () => finishAttackerTurn(state, "p1", "p2"));
    expect(next.p1.hp).toBe(100);
    expect(collector.snapshot()).toContainEqual({ metric: "healing", source: "skill_regen", target: "p1", total: 5, count: 1 });
  });
  it("records PvE dodge recovery and reflection", () => {
    const actor = { ...player, shadowStepPct: 100, evadeHealAmount: 20, reflexEvadeMult: 1 };
    const collector = createCombatDiagnostics();
    const next = withCombatDiagnostics(collector, () => withCombatRandom(() => 0.5, () => resolveEnemyPhase(initialBattleState(actor, enemy, "A"), actor, "A", true)));
    expect(next.playerHp).toBe(100);
    expect(next.enemyHp).toBe(480);
    expect(collector.snapshot()).toContainEqual({ metric: "healing", source: "dodge", target: "player", total: 5, count: 1 });
    expect(collector.snapshot()).toContainEqual({ metric: "hp_damage", source: "reflect_on_dodge", target: "enemy", total: 20, count: 1 });
  });
  it.each(["pve_hit", "pve_dot", "pvp_dot", "pvp_reflect"])("records manual endurance exactly once for %s", (mode) => {
    const actor = { ...player, enduranceActive: true };
    const collector = createCombatDiagnostics();
    withCombatDiagnostics(collector, () => withCombatRandom(() => 0.5, () => {
      if (mode === "pve_hit") {
        expect(resolveEnemyPhase(initialBattleState(actor, { ...enemy, atk: 200 }, "A"), actor, "A", true).playerHp).toBe(1);
      } else if (mode === "pve_dot") {
        const state = initialBattleState(actor, enemy, "A");
        state.playerV2Dots = [poison];
        expect(tickPlayerDotsOnAction(state, actor, "A").playerHp).toBe(1);
      } else if (mode === "pvp_dot") {
        const state = initialBattleStatePvP(actor, player, "A", "B");
        state.p1.v2Dots = [poison];
        expect(tickPvPSideDotsOnAction(state, "p1").p1.hp).toBe(1);
      } else {
        expect(applyOnHitReflect(initialBattleStatePvP(actor, { ...player, thornsPct: 100 }, "A", "B"), "p1", "p2", 200).state.p1.hp).toBe(1);
      }
    }));
    expect(collector.snapshot()).toContainEqual({ metric: "survival_restoration", source: "endurance", target: mode.startsWith("pve") ? "player" : "p1", total: 1, count: 1 });
  });
});
