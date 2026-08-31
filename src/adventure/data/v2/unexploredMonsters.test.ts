import { describe, expect, it } from "vitest";
import { UNEXPLORED_MONSTER_POOLS } from "./unexploredMonsterPools";
import { unexploredResourceGrowthCompensation } from "./unexploredSimulationBalance";
import {
  UNEXPLORED_BASE_MONSTER_IDS,
  unexploredActiveSpecialMonstersAtDifficulty,
  unexploredBaseMonstersAtDifficulty,
  unexploredMonsterAtDifficulty,
} from "./unexploredMonsters";

describe("unexplored runtime monsters", () => {
  it("exposes five base monsters and every active special monster", () => {
    const base = unexploredBaseMonstersAtDifficulty(95);
    const special = unexploredActiveSpecialMonstersAtDifficulty(95, []);

    expect(base).toHaveLength(5);
    expect(special).toHaveLength(14);
    expect(new Set([...base, ...special].map((entry) => entry.monsterId)).size).toBe(19);
    expect(base.map((entry) => entry.monsterId)).toEqual(UNEXPLORED_BASE_MONSTER_IDS);
    expect(special.map((entry) => entry.monsterId)).toEqual(
      UNEXPLORED_MONSTER_POOLS.flatMap((pool) =>
        pool.activeMonsters.map((monster) => monster.id),
      ),
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
        ...unexploredActiveSpecialMonstersAtDifficulty(difficulty, []),
      ];
      expect(monsters).toHaveLength(19);
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

  it("routes active iron legion variants to their combat profiles and images", () => {
    const spearman = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "iron_legion",
      monsterId: "armored_spearman",
      focused: false,
      difficulty: 100,
    });
    const crusher = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "iron_legion",
      monsterId: "armored_crusher",
      focused: false,
      difficulty: 100,
    });

    expect(spearman.monsterId).toBe("armored_spearman");
    expect(spearman.imageFileName).toBe("unexplored-armored-spearman.webp");
    expect(spearman.monster.skill).toMatchObject({
      kind: "pierce",
      armorPierce: 11,
    });
    expect(
      unexploredMonsterAtDifficulty({
        source: "special",
        poolId: "iron_legion",
        monsterId: "armored_spearman",
        focused: true,
        difficulty: 100,
      }).monster.def,
    ).toBeGreaterThan(spearman.monster.def);
    expect(crusher.monsterId).toBe("armored_crusher");
    expect(crusher.imageFileName).toBe("unexplored-armored-crusher.webp");
    expect(crusher.monster.skill).toMatchObject({
      kind: "heavy_blow",
      everyPhases: 3,
      multiplier: 2,
    });
  });

  it("rejects special monsters that are not active in their pool", () => {
    expect(() =>
      unexploredMonsterAtDifficulty({
        source: "special",
        poolId: "mana_barrier",
        monsterId: "rune_executor",
        focused: false,
        difficulty: 100,
      }),
    ).toThrow(/not active/i);
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
