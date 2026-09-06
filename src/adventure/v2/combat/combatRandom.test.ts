import { afterEach, describe, expect, it, vi } from "vitest";
import type { V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { combatRandom, seededCombatRandom, withCombatRandom } from "./combatRandom";
import { resolveBattle, type PlayerCombat } from "./engine";
import { resolveBattlePvP } from "./engine-pvp";

afterEach(() => vi.restoreAllMocks());
describe("combat-local random stream", () => {
  it("restores nested scopes after exceptions without replacing global Math.random", () => {
    const system = vi.spyOn(Math, "random").mockReturnValue(0.8);
    withCombatRandom(() => 0.2, () => {
      expect(combatRandom()).toBe(0.2);
      expect(Math.random).toBe(system);
      expect(() => withCombatRandom(() => 0.4, () => {
        expect(combatRandom()).toBe(0.4);
        throw new Error("inner");
      })).toThrow("inner");
      expect(combatRandom()).toBe(0.2);
    });
    expect(combatRandom()).toBe(0.8);
  });

  it("repeats real PvE and PvP results without consuming system randomness", () => {
    vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("unscoped random"); });
    const player: PlayerCombat = { hp: 1000, maxHp: 1000, mp: 1000, maxMp: 1000, atk: 50, def: 10, spd: 500, evasionPct: 0, attackCount: 1, accuracyPct: 100, critChancePct: 50 };
    const skills: V2SkillsState = { learned: ["v2c_warrior_flurry", "v2c_venomist_toxiccloud"], equipped: ["v2c_warrior_flurry", "v2c_venomist_toxiccloud"] };
    const enemy = { name: "test", hp: 1000, atk: 30, def: 10, spd: 10, exp: 0, tags: [] };
    const pve = () => resolveBattle(player, enemy, "A", {
      random: seededCombatRandom(123), v2Skills: skills, potions: {}, pickAction: () => ({ kind: "attack" }),
    });
    const pvp = () => resolveBattlePvP(player, player, "A", "B", {
      random: seededCombatRandom(456), v2Skills: { p1: skills, p2: skills }, potions: { p1: {}, p2: {} }, pickAction: () => ({ kind: "attack" }),
    });
    expect(pve()).toEqual(pve());
    expect(pvp()).toEqual(pvp());
  });

  it("validates seed bounds and generates repeatable finite unit-interval values", () => {
    for (const invalid of [NaN, Infinity, -1, 1.2, 0x1_0000_0000]) {
      expect(() => seededCombatRandom(invalid)).toThrow();
    }
    const a = seededCombatRandom(0), b = seededCombatRandom(0);
    const values = Array.from({ length: 100 }, () => a());
    expect(values).toEqual(Array.from({ length: 100 }, () => b()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(90);
  });
});
