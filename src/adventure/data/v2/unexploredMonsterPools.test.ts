import { describe, expect, it } from "vitest";
import {
  UNEXPLORED_MONSTER_BY_ID,
  UNEXPLORED_MONSTER_POOLS,
  UNEXPLORED_POOL_BY_ID,
} from "./unexploredMonsterPools";

describe("unexplored monster pool catalog", () => {
  it("activates every designed monster", () => {
    expect(UNEXPLORED_MONSTER_POOLS).toHaveLength(12);
    expect(Object.keys(UNEXPLORED_POOL_BY_ID)).toHaveLength(12);
    expect(Object.keys(UNEXPLORED_MONSTER_BY_ID)).toHaveLength(36);
    for (const pool of UNEXPLORED_MONSTER_POOLS) {
      expect(pool.monsters).toHaveLength(3);
      expect(pool.activeMonsters).toEqual(pool.monsters);
      expect(new Set(pool.monsters.map((monster) => monster.id)).size).toBe(3);
      expect(pool.materialId).toBe(`v2_unexplored_${pool.id}_material`);
    }
  });

  it("does not expose retired rollout and reward-design metadata", () => {
    for (const pool of UNEXPLORED_MONSTER_POOLS) {
      expect(pool, pool.id).not.toHaveProperty("releaseStage");
      expect(pool, pool.id).not.toHaveProperty("launchMonster");
      expect(pool, pool.id).not.toHaveProperty("expansionCandidates");
      expect(pool, pool.id).not.toHaveProperty("rewardCategories");
      expect(pool, pool.id).not.toHaveProperty("slowKillRewardBonusPctRange");

      for (const monster of pool.monsters) {
        expect(monster, monster.id).not.toHaveProperty("role");
      }
    }
  });

  it("keeps every relative stat finite and positive", () => {
    const speedBands = new Set(["slow", "normal", "fast", "extreme"]);
    for (const monster of Object.values(UNEXPLORED_MONSTER_BY_ID)) {
      expect(speedBands.has(monster.speedBand), monster.id).toBe(true);
      for (const value of Object.values(monster.stats)) {
        expect(Number.isFinite(value), monster.id).toBe(true);
        expect(value, monster.id).toBeGreaterThan(0);
      }
    }
  });

  it("preserves the approved edge profiles", () => {
    expect(UNEXPLORED_MONSTER_BY_ID.armored_shieldman).toMatchObject({
      speedBand: "slow",
      stats: { hp: 1.1, atk: 0.9, def: 1.8, magicDef: 0.85 },
    });
    expect(UNEXPLORED_MONSTER_BY_ID.proliferating_core.stats.hp).toBe(1.7);
    expect(UNEXPLORED_MONSTER_BY_ID.rushing_machine.speedBand).toBe("extreme");
    expect(UNEXPLORED_MONSTER_BY_ID.phantom_stalker.speedBand).toBe("extreme");
    expect(UNEXPLORED_MONSTER_BY_ID.combo_automaton.abilities).toContain(
      "bonus_attack_50",
    );
    expect(UNEXPLORED_MONSTER_BY_ID.crust_destroyer).toMatchObject({
      speedBand: "slow",
      stats: {
        hp: 1.55,
        atk: 1.35,
        def: 1.25,
        magicDef: 0.9,
      },
    });
    expect(UNEXPLORED_MONSTER_BY_ID.crust_destroyer.stats).toEqual({
      hp: 1.55,
      atk: 1.35,
      def: 1.25,
      magicDef: 0.9,
    });
  });
});
