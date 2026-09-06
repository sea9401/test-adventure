import { afterEach, expect, it } from "vitest";
import { createCombatDiagnostics, withCombatDiagnostics } from "./combatDiagnostics";
import { appendSkillCastLog, setBattleLogCollection } from "./engineSupport";
import { resolveV2SkillCast, type V2SkillCastInput } from "./combatShared";

afterEach(() => setBattleLogCollection(true));
it("does not count a rejected selection as a committed cast", () => {
  const skill = "v2c_warrior_strike";
  const collector = createCombatDiagnostics();
  withCombatDiagnostics(collector, () => {
    const result = resolveV2SkillCast({ diagnosticActor: "player", skills: { learned: [skill], equipped: [skill] }, cooldowns: {}, procRoll: 0,
      attacker: { mp: 0, atk: 100, maxHp: 1000, selfBuffs: {}, selfDebuffs: {} }, target: { def: 10, selfBuffs: {}, selfDebuffs: {} } });
    expect(result.castSkillId).toBeNull();
  });
  expect(collector.snapshot().some((row) => row.metric === "skill_cast")).toBe(false);
});
it("counts one committed cast separately from repeated selector evaluations without retaining logs", () => {
  const skill = "v2c_warrior_strike";
  const input: V2SkillCastInput = { diagnosticActor: "player", skills: { learned: [skill], equipped: [skill] }, cooldowns: {}, procRoll: 0,
    attacker: { mp: 999, atk: 100, maxHp: 1000, selfBuffs: {}, selfDebuffs: {} }, target: { def: 10, selfBuffs: {}, selfDebuffs: {} } };
  const collector = createCombatDiagnostics();
  setBattleLogCollection(false);
  withCombatDiagnostics(collector, () => {
    resolveV2SkillCast(input);
    const cast = resolveV2SkillCast(input);
    expect(appendSkillCastLog([], cast.castSkillId!, cast.castSkillName!, { turn: "player" })).toEqual([]);
  });
  expect(collector.snapshot()).toContainEqual({ metric: "skill_cast", source: skill, target: "player", count: 1, total: 1 });
  expect(collector.snapshot()).toContainEqual({ metric: "skill_gate", source: skill, target: "player:selected", count: 2, total: 2 });
});
