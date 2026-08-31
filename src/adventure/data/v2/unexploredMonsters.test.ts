import { describe, expect, it } from "vitest";
import { UNEXPLORED_MONSTER_POOLS } from "./unexploredMonsterPools";
import { unexploredResourceGrowthCompensation } from "./unexploredSimulationBalance";
import {
  UNEXPLORED_BASE_MONSTER_IDS,
  unexploredBaseMonstersAtDifficulty,
  unexploredLaunchSpecialMonstersAtDifficulty,
  unexploredMonsterAtDifficulty,
} from "./unexploredMonsters";

describe("unexplored runtime monsters", () => {
  it("exposes five independent base monsters and one launch monster per pool", () => {
    const base = unexploredBaseMonstersAtDifficulty(95);
    const special = unexploredLaunchSpecialMonstersAtDifficulty(95, []);

    expect(base).toHaveLength(5);
    expect(special).toHaveLength(12);
    expect(new Set([...base, ...special].map((entry) => entry.monsterId)).size).toBe(17);
    expect(base.map((entry) => entry.monsterId)).toEqual(UNEXPLORED_BASE_MONSTER_IDS);
    expect(special.map((entry) => entry.monsterId)).toEqual(
      UNEXPLORED_MONSTER_POOLS.map((pool) => pool.launchMonster.id),
    );
    for (const entry of [...base, ...special]) {
      expect(entry.monster.image).toBe(
        `/images/monster/v2/${entry.imageFileName}`,
      );
      expect(entry.monster.exp).toBeGreaterThan(0);
    }
  });

  it("keeps every integer difficulty from 95 through 120 finite and continuous", () => {
    let previous = unexploredBaseMonstersAtDifficulty(95)[0].monster;
    for (let difficulty = 95; difficulty <= 120; difficulty += 1) {
      const monsters = [
        ...unexploredBaseMonstersAtDifficulty(difficulty),
        ...unexploredLaunchSpecialMonstersAtDifficulty(difficulty, []),
      ];
      expect(monsters).toHaveLength(17);
      for (const { monster, monsterId } of monsters) {
        for (const stat of ["hp", "atk", "def", "magicDef", "spd"] as const) {
          expect(Number.isFinite(monster[stat]), `${monsterId}:${difficulty}:${stat}`).toBe(true);
          expect(monster[stat] ?? 0, `${monsterId}:${difficulty}:${stat}`).toBeGreaterThan(0);
        }
      }
      const current = monsters[0].monster;
      if (difficulty > 95) {
        expect(current.hp).toBeGreaterThan(previous.hp);
        expect(current.atk).toBeGreaterThanOrEqual(previous.atk);
        expect(current.def).toBeGreaterThanOrEqual(previous.def);
        expect(current.magicDef).toBeGreaterThanOrEqual(previous.magicDef ?? 0);
        expect(current.spd).toBeGreaterThanOrEqual(previous.spd);
      }
      previous = current;
    }
  });

  it("preserves the approved anchor values and ends resource compensation at 110", () => {
    expect(unexploredBaseMonstersAtDifficulty(95)[0].monster).toMatchObject({
      hp: 397_012,
      atk: 14_710,
      def: 2_142,
      magicDef: 2_226,
      spd: 13,
    });
    expect(unexploredBaseMonstersAtDifficulty(100)[0].monster).toMatchObject({
      hp: 494_969,
      atk: 16_372,
      def: 2_370,
      magicDef: 2_461,
      spd: 17,
    });
    for (let difficulty = 110; difficulty <= 120; difficulty += 1) {
      expect(unexploredResourceGrowthCompensation(difficulty)).toEqual({
        hp: 1,
        atk: 1,
        def: 1,
      });
    }
  });

  it("applies only each pool's declared focus axis", () => {
    const normal = (poolId: Parameters<typeof unexploredMonsterAtDifficulty>[0]["poolId"]) =>
      unexploredMonsterAtDifficulty({
        source: "special",
        poolId,
        focused: false,
        difficulty: 100,
      }).monster;
    const focused = (poolId: Parameters<typeof unexploredMonsterAtDifficulty>[0]["poolId"]) =>
      unexploredMonsterAtDifficulty({
        source: "special",
        poolId,
        focused: true,
        difficulty: 100,
      }).monster;

    expect(focused("iron_legion").def).toBeGreaterThan(normal("iron_legion").def);
    expect(focused("mana_barrier").magicDef).toBeGreaterThan(normal("mana_barrier").magicDef ?? 0);
    expect(focused("regenerating_swarm").hp).toBeGreaterThan(normal("regenerating_swarm").hp);
    expect(focused("red_berserkers").critPct).toBe((normal("red_berserkers").critPct ?? 0) + 10);
    expect(focused("crystal_artillery").v2MaxMp).toBeGreaterThan(normal("crystal_artillery").v2MaxMp ?? 0);
    expect(focused("precision_hunters").accuracy).toBe((normal("precision_hunters").accuracy ?? 0) + 15);
    expect(focused("runaway_machines").bonusAttackChancePct).toBe((normal("runaway_machines").bonusAttackChancePct ?? 0) + 15);
    expect(focused("shadow_stalkers").evasionPct).toBe((normal("shadow_stalkers").evasionPct ?? 0) + 10);
    expect(focused("venom_colony").v2Skills?.equipped).toContain("mob_catastrophe_venom");
    expect(focused("bloodstained_dead").atk).toBeGreaterThan(normal("bloodstained_dead").atk);
    expect(focused("frozen_legion").v2Skills?.equipped).toContain("mob_deep_chill");
    expect(focused("crushing_colossi").playerDefVulnerable).toBe(0.08);
  });
});
