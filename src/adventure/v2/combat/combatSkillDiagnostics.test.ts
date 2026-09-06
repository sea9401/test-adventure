import { describe, expect, it } from "vitest";
import { resolveV2SkillCast, type V2SkillCastInput } from "./combatShared";
import { createCombatDiagnostics, withCombatDiagnostics } from "./combatDiagnostics";

const skill = "v2c_warrior_strike";
function input(): V2SkillCastInput {
  return { skills: { learned: [skill], equipped: [skill] }, cooldowns: {}, procRoll: 0,
    attacker: { mp: 999, atk: 100, maxHp: 1000, currentHp: 1000, selfBuffs: {}, selfDebuffs: {} },
    target: { def: 10, selfBuffs: {}, selfDebuffs: {} } };
}
describe("observed skill selection gates", () => {
  it("separates the two actors using the same skill", () => {
    const collector = createCombatDiagnostics();
    withCombatDiagnostics(collector, () => {
      resolveV2SkillCast({ ...input(), diagnosticActor: "p1" });
      resolveV2SkillCast({ ...input(), diagnosticActor: "p2" });
    });
    expect(collector.snapshot().map((row) => row.target)).toEqual(["p1:selected", "p2:selected"]);
  });
  it.each(["mp", "cooldown", "proc", "condition", "selected"] as const)("records %s once per evaluation without changing its result", (reason) => {
    const data = input();
    if (reason === "mp") data.attacker.mp = 0;
    if (reason === "cooldown") data.cooldowns = { [skill]: 3 };
    if (reason === "proc") data.procRoll = 100;
    if (reason === "condition") data.combatPattern = { blocks: [
      { condition: { kind: "self_hp", op: "below", pct: 10 }, action: { kind: "skill", skillId: skill } },
      { condition: { kind: "always" }, action: { kind: "basic_attack" } },
    ] };
    const expected = resolveV2SkillCast(data);
    const collector = createCombatDiagnostics();
    const actual = withCombatDiagnostics(collector, () => resolveV2SkillCast(data));
    expect(actual).toEqual(expected);
    expect(collector.snapshot()).toContainEqual({ metric: "skill_gate", source: skill, target: reason, total: 1, count: 1 });
    expect(actual.castSkillId).toBe(reason === "selected" ? skill : null);
  });
});
