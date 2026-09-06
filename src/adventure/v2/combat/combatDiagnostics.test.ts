import { describe, expect, it } from "vitest";
import { createCombatDiagnostics, recordCombatMetric, withCombatDiagnostics } from "./combatDiagnostics";

describe("opt-in combat diagnostics", () => {
  it("accumulates quantities separately without retaining events or accepting invalid values", () => {
    const collector = createCombatDiagnostics();
    withCombatDiagnostics(collector, () => {
      recordCombatMetric("hp_damage", "basic", "enemy", 8);
      recordCombatMetric("hp_damage", "basic", "enemy", 3);
      recordCombatMetric("healing", "regen", "player", 4);
      for (const value of [NaN, Infinity, -4, 0]) recordCombatMetric("hp_damage", "basic", "enemy", value);
    });
    expect(collector.snapshot()).toEqual([
      { metric: "hp_damage", source: "basic", target: "enemy", total: 11, count: 2 },
      { metric: "healing", source: "regen", target: "player", total: 4, count: 1 },
    ]);
    collector.snapshot()[0].total = 999;
    expect(collector.snapshot()[0].total).toBe(11);
  });

  it("restores outer collection on nested throws and disables collection explicitly", () => {
    const outer = createCombatDiagnostics(), inner = createCombatDiagnostics();
    withCombatDiagnostics(outer, () => {
      expect(() => withCombatDiagnostics(inner, () => {
        recordCombatMetric("healing", "regen", "player", 2);
        throw new Error("test");
      })).toThrow("test");
      withCombatDiagnostics(undefined, () => recordCombatMetric("healing", "regen", "player", 99));
      recordCombatMetric("healing", "regen", "player", 3);
    });
    recordCombatMetric("healing", "regen", "player", 100);
    expect(outer.snapshot()[0].total).toBe(3);
    expect(inner.snapshot()[0].total).toBe(2);
  });
});
