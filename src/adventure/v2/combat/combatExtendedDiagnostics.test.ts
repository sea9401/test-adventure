import { describe, expect, it } from "vitest";
import type { PlayerCombat } from "./engineState";
import { initialBattleState, applyEnchantRegenIfAny, applyBerserkerHostileDamage, applyPassiveTurnHealIfAny, finishPlayerTurn } from "./engine.pveOperations";
import { initialBattleStatePvP } from "./engine.pvpInitialState";
import { releaseSwordShadowAfterEnemyAction, resolveEnemyPhase } from "./engine.enemyPhase";
import { releaseSwordShadowAfterPvPAction, applyOnHitReflect, dealExtraDamage } from "./engine.pvpOperations";
import { withCombatRandom } from "./combatRandom";
import { createCombatDiagnostics, withCombatDiagnostics } from "./combatDiagnostics";
import { initialBerserkerCombatState } from "./berserkerCombat";
import { applyTier6UniquePveEvent } from "./tier6UniquePveAdapter";
import { applyTier6UniquePvpEvent } from "./tier6UniquePvpAdapter";
import type { Tier6UniqueEvent } from "./tier6UniqueEffects";
import { resolvePvPHostileDamageSurvival } from "./pvpHostileDamage";

const player: PlayerCombat = { hp: 95, maxHp: 100, atk: 100, def: 0, spd: 100, evasionPct: 0, attackCount: 1, accuracyPct: 100 };
const enemy = { name: "target", hp: 100, atk: 20, def: 0, spd: 1, exp: 0, tags: [] };
const shadow = { sourceSkillId: "v2c_shadowblade_traceless" as const, sourceFinalDamage: 100, recordPct: 20, refined: false };
describe("extended numeric diagnostics", () => {
  it.each([false, true])("caps unique-command recovery (PvP %s)", (pvp) => {
    const actor = { ...player, equipSignatures: [{ trigger: "tier6_unique" as const, mechanic: "storm_confluence" as const, label: "storm" }] };
    const event: Tier6UniqueEvent = { kind: "heal_calculated", amount: 20, maxHp: 100, origin: { actionId: 1, eventId: 1 } };
    const collector = createCombatDiagnostics();
    withCombatDiagnostics(collector, () => {
      if (pvp) {
        const state = initialBattleStatePvP(actor, player, "A", "B");
        state.p1.stacks.tier6Uniques!.nextHealPct = 100;
        expect(applyTier6UniquePvpEvent(state, "p1", "p2", event).p1.hp).toBe(100);
      } else {
        const state = initialBattleState(actor, enemy, "P");
        state.stacks.tier6Uniques!.nextHealPct = 100;
        expect(applyTier6UniquePveEvent(state, actor, event).playerHp).toBe(100);
      }
    });
    expect(collector.snapshot()).toContainEqual({ metric: "healing", source: "unique:storm_confluence", target: pvp ? "p1" : "player", total: 5, count: 1 });
  });
  it("records PvP extra damage and its endurance rescue independently", () => {
    const state = initialBattleStatePvP(player, { ...player, enduranceActive: true }, "A", "B");
    const collector = createCombatDiagnostics();
    const next = withCombatDiagnostics(collector, () => dealExtraDamage(state, "p1", "p2", 200, "extra"));
    expect(next.p2.hp).toBe(1);
    expect(collector.snapshot()).toContainEqual({ metric: "hp_damage", source: "extra", target: "p2", total: 95, count: 1 });
    expect(collector.snapshot()).toContainEqual({ metric: "survival_restoration", source: "endurance", target: "p2", total: 1, count: 1 });
  });
  it("records rune and martial counters separately from primary damage", () => {
    const actor = { ...player, atk: 10, runeCounterChancePct: 100, passiveCounterChancePct: 100 };
    const state = initialBattleState(actor, enemy, "P");
    const collector = createCombatDiagnostics();
    withCombatDiagnostics(collector, () => withCombatRandom(() => 0.5, () => resolveEnemyPhase(state, actor, "P", false)));
    for (const source of ["rune_counter", "martial_counter"]) {
      expect(collector.snapshot()).toContainEqual({ metric: "hp_damage", source, target: "enemy", total: 10, count: 1 });
    }
  });
  it.each(["passive_regen", "skill_regen"])("records actual capped %s recovery", (source) => {
    const actor = { ...player, passiveTurnHealPctMaxHp: 20 };
    const state = initialBattleState(actor, enemy, "P");
    state.turn.completedPlayerTurns = 1;
    state.stacks.skillRegenTurns = 2;
    state.stacks.skillRegenPct = 20;
    const collector = createCombatDiagnostics();
    const next = withCombatDiagnostics(collector, () => source === "passive_regen"
      ? applyPassiveTurnHealIfAny(state, actor, "P") : finishPlayerTurn(state, actor, "P"));
    expect(next.playerHp).toBe(100);
    expect(collector.snapshot()).toContainEqual({ metric: "healing", source, target: "player", total: 5, count: 1 });
  });
  it("attributes generic PvP endurance rescue without calling it healing", () => {
    const state = initialBattleStatePvP(player, { ...player, enduranceActive: true }, "A", "B");
    const collector = createCombatDiagnostics();
    const result = withCombatDiagnostics(collector, () => resolvePvPHostileDamageSurvival(state.p2, -5, "p2"));
    expect(result.side.hp).toBe(1);
    expect(collector.snapshot()).toEqual([{ metric: "survival_restoration", source: "endurance", target: "p2", total: 1, count: 1 }]);
  });
  it.each([false, true])("records venom-burst unique damage (PvP %s)", (pvp) => {
    const actor = { ...player, equipSignatures: [{ trigger: "tier6_unique" as const, mechanic: "venom_burst" as const, label: "venom" }] };
    const event: Tier6UniqueEvent = { kind: "direct_hit", damage: 1, crit: false, attackKind: "basic", paidMp: 0, statusKinds: 1,
      bleedStacks: 0, bleedRemainingDamage: 0, poisonStacks: 5, poisonRemainingDamage: 80, magicAtk: 100, maxHp: 100, origin: { actionId: 1, eventId: 1 } };
    const collector = createCombatDiagnostics();
    withCombatDiagnostics(collector, () => {
      if (pvp) {
        const next = applyTier6UniquePvpEvent(initialBattleStatePvP(actor, player, "A", "B"), "p1", "p2", event);
        expect(next.p2.hp).toBe(35);
      } else {
        const next = applyTier6UniquePveEvent(initialBattleState(actor, enemy, "P"), actor, event);
        expect(next.enemyHp).toBe(40);
      }
    });
    expect(collector.snapshot()).toContainEqual({ metric: "hp_damage", source: "unique:venom_burst", target: pvp ? "p2" : "enemy", total: 60, count: 1 });
  });
  it("labels PvE sword-shadow damage exactly once", () => {
    const state = initialBattleState(player, enemy, "P");
    state.stacks.tier7 = { swordShadow: shadow };
    const collector = createCombatDiagnostics();
    const next = withCombatDiagnostics(collector, () => releaseSwordShadowAfterEnemyAction(state));
    expect(next.enemyHp).toBe(80);
    expect(collector.snapshot().filter((row) => row.metric === "hp_damage")).toEqual([
      { metric: "hp_damage", source: "sword_shadow", target: "enemy", total: 20, count: 1 },
    ]);
  });
  it("separates PvP delayed damage from its shield absorption", () => {
    const state = initialBattleStatePvP(player, { ...player, bulwarkShield: 5 }, "A", "B");
    state.p1.stacks.tier7 = { swordShadow: shadow };
    const collector = createCombatDiagnostics();
    const next = withCombatDiagnostics(collector, () => releaseSwordShadowAfterPvPAction(state, "p2", "p1"));
    expect(next.p2.hp).toBe(80);
    expect(collector.snapshot()).toContainEqual({ metric: "hp_damage", source: "sword_shadow", target: "p2", total: 15, count: 1 });
    expect(collector.snapshot()).toContainEqual({ metric: "shield_absorption", source: "sword_shadow", target: "p2", total: 5, count: 1 });
  });
  it("records mitigated reflection on the attacking side", () => {
    const state = initialBattleStatePvP(player, { ...player, thornsPct: 50 }, "A", "B");
    const collector = createCombatDiagnostics();
    const next = withCombatDiagnostics(collector, () => applyOnHitReflect(state, "p1", "p2", 40));
    expect(next.state.p1.hp).toBe(75);
    expect(collector.snapshot()).toContainEqual({ metric: "hp_damage", source: "reflect", target: "p1", total: 20, count: 1 });
  });
  it("records capped enchantment recovery", () => {
    const actor = { ...player, enchantRegenPctPerTurn: 20 };
    const state = initialBattleState(actor, enemy, "P");
    state.turn.completedPlayerTurns = 1;
    const collector = createCombatDiagnostics();
    const next = withCombatDiagnostics(collector, () => applyEnchantRegenIfAny(state, actor, "P"));
    expect(next.playerHp).toBe(100);
    expect(collector.snapshot()).toContainEqual({ metric: "healing", source: "enchant_regen", target: "player", total: 5, count: 1 });
  });
  it("separates survival HP rescue from ordinary healing", () => {
    const actor: PlayerCombat = { ...player, berserkerMadnessRank: 3 };
    const state = initialBattleState(actor, enemy, "P");
    state.berserker = initialBerserkerCombatState();
    const collector = createCombatDiagnostics();
    const next = withCombatDiagnostics(collector, () => applyBerserkerHostileDamage(state, actor, -100));
    expect(next.state.playerHp).toBe(20);
    expect(collector.snapshot()).toContainEqual({ metric: "survival_restoration", source: "berserker", target: "player", total: 20, count: 1 });
    expect(collector.snapshot().some((row) => row.metric === "healing")).toBe(false);
  });
});
