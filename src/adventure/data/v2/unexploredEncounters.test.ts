import { describe, expect, it } from "vitest";
import { UNEXPLORED_POOL_IDS } from "./unexploredMonsterPools";
import {
  pickUnexploredEncounterGroup,
  pickUnexploredMonster,
  unexploredEncounterShares,
} from "./unexploredEncounters";

describe("unexplored encounter shares", () => {
  it("keeps an unmodified area at 100% base", () => {
    expect(unexploredEncounterShares([])).toEqual([
      { kind: "base", share: 100 },
    ]);
  });

  it("applies core 20 and frequency 10 cumulatively", () => {
    expect(
      unexploredEncounterShares([
        { poolId: "iron_legion", core: true, frequency: true },
        { poolId: "venom_colony", core: true, frequency: false },
      ]),
    ).toEqual([
      { kind: "base", share: 50 },
      { kind: "pool", poolId: "iron_legion", share: 30 },
      { kind: "pool", poolId: "venom_colony", share: 20 },
    ]);
  });

  it("proportionally caps three 30-point requests at 70 special", () => {
    const shares = unexploredEncounterShares([
      { poolId: "iron_legion", core: true, frequency: true },
      { poolId: "venom_colony", core: true, frequency: true },
      { poolId: "frozen_legion", core: true, frequency: true },
    ]);
    expect(shares.reduce((sum, entry) => sum + entry.share, 0)).toBe(100);
    expect(shares[0]).toEqual({ kind: "base", share: 30 });
    expect(shares.slice(1).map((entry) => entry.share)).toEqual([24, 23, 23]);
  });

  it("uses half-open cumulative RNG boundaries", () => {
    const shares = unexploredEncounterShares([
      { poolId: "iron_legion", core: true, frequency: true },
    ]);
    expect(
      pickUnexploredEncounterGroup(shares, () => 0.699999),
    ).toEqual({ kind: "base" });
    expect(pickUnexploredEncounterGroup(shares, () => 0.7)).toEqual({
      kind: "pool",
      poolId: "iron_legion",
    });
  });

  it("selects uniformly inside the chosen special pool", () => {
    const pickIronMonster = (roll: number) =>
      pickUnexploredMonster({
        baseMonsterIds: ["base_a", "base_b"],
        shares: unexploredEncounterShares([
          { poolId: "iron_legion", core: true, frequency: true },
        ]),
        groupRng: () => 0.99,
        monsterRng: () => roll,
      });

    expect(pickIronMonster(0)).toMatchObject({
      source: "special",
      poolId: "iron_legion",
      monsterId: "armored_shieldman",
    });
    expect(pickIronMonster(0.34)?.monsterId).toBe("armored_spearman");
    expect(pickIronMonster(0.67)?.monsterId).toBe("armored_crusher");
  });

  it("selects uniformly inside the expanded mana barrier pool", () => {
    const pickManaMonster = (roll: number) =>
      pickUnexploredMonster({
        baseMonsterIds: ["base_a", "base_b"],
        shares: unexploredEncounterShares([
          { poolId: "mana_barrier", core: true, frequency: true },
        ]),
        groupRng: () => 0.99,
        monsterRng: () => roll,
      });

    expect(pickManaMonster(0)).toMatchObject({
      source: "special",
      poolId: "mana_barrier",
      monsterId: "barrier_guardian",
    });
    expect(pickManaMonster(0.34)?.monsterId).toBe("rune_executor");
    expect(pickManaMonster(0.67)?.monsterId).toBe("seal_watcher");
  });

  it("selects uniformly inside the expanded regenerating swarm pool", () => {
    const pickRegeneratingMonster = (roll: number) =>
      pickUnexploredMonster({
        baseMonsterIds: ["base_a", "base_b"],
        shares: unexploredEncounterShares([
          { poolId: "regenerating_swarm", core: true, frequency: true },
        ]),
        groupRng: () => 0.99,
        monsterRng: () => roll,
      });

    expect(pickRegeneratingMonster(0)).toMatchObject({
      source: "special",
      poolId: "regenerating_swarm",
      monsterId: "regenerating_spore",
    });
    expect(pickRegeneratingMonster(0.34)?.monsterId).toBe(
      "devouring_regenerator",
    );
    expect(pickRegeneratingMonster(0.67)?.monsterId).toBe(
      "proliferating_core",
    );
  });

  it("selects uniformly inside the expanded red berserkers pool", () => {
    const pickRedMonster = (roll: number) =>
      pickUnexploredMonster({
        baseMonsterIds: ["base_a", "base_b"],
        shares: unexploredEncounterShares([
          { poolId: "red_berserkers", core: true, frequency: true },
        ]),
        groupRng: () => 0.99,
        monsterRng: () => roll,
      });

    expect(pickRedMonster(0)).toMatchObject({
      source: "special",
      poolId: "red_berserkers",
      monsterId: "red_berserker",
    });
    expect(pickRedMonster(0.34)?.monsterId).toBe("blood_duelist");
    expect(pickRedMonster(0.67)?.monsterId).toBe("red_executioner");
  });

  it("selects uniformly inside the expanded crystal artillery pool", () => {
    const pickCrystalMonster = (roll: number) =>
      pickUnexploredMonster({
        baseMonsterIds: ["base_a", "base_b"],
        shares: unexploredEncounterShares([
          { poolId: "crystal_artillery", core: true, frequency: true },
        ]),
        groupRng: () => 0.99,
        monsterRng: () => roll,
      });

    expect(pickCrystalMonster(0)).toMatchObject({
      source: "special",
      poolId: "crystal_artillery",
      monsterId: "crystal_mage",
    });
    expect(pickCrystalMonster(0.34)?.monsterId).toBe("refraction_artillery");
    expect(pickCrystalMonster(0.67)?.monsterId).toBe("crystal_sentinel");
  });

  it("selects uniformly inside the expanded precision hunters pool", () => {
    const pickPrecisionMonster = (roll: number) =>
      pickUnexploredMonster({
        baseMonsterIds: ["base_a", "base_b"],
        shares: unexploredEncounterShares([
          { poolId: "precision_hunters", core: true, frequency: true },
        ]),
        groupRng: () => 0.99,
        monsterRng: () => roll,
      });

    expect(pickPrecisionMonster(0)).toMatchObject({
      source: "special",
      poolId: "precision_hunters",
      monsterId: "precision_scout",
    });
    expect(pickPrecisionMonster(0.34)?.monsterId).toBe("lethal_sniper");
    expect(pickPrecisionMonster(0.67)?.monsterId).toBe("armor_hunter");
  });

  it("selects uniformly inside the expanded runaway machines pool", () => {
    const pickRunawayMonster = (roll: number) =>
      pickUnexploredMonster({
        baseMonsterIds: ["base_a", "base_b"],
        shares: unexploredEncounterShares([
          { poolId: "runaway_machines", core: true, frequency: true },
        ]),
        groupRng: () => 0.99,
        monsterRng: () => roll,
      });

    expect(pickRunawayMonster(0)).toMatchObject({
      source: "special",
      poolId: "runaway_machines",
      monsterId: "rushing_machine",
    });
    expect(pickRunawayMonster(0.34)?.monsterId).toBe("combo_automaton");
    expect(pickRunawayMonster(0.67)?.monsterId).toBe(
      "overheated_enforcer",
    );
  });

  it("selects uniformly inside the expanded shadow stalkers pool", () => {
    const pickShadowMonster = (roll: number) =>
      pickUnexploredMonster({
        baseMonsterIds: ["base_a", "base_b"],
        shares: unexploredEncounterShares([
          { poolId: "shadow_stalkers", core: true, frequency: true },
        ]),
        groupRng: () => 0.99,
        monsterRng: () => roll,
      });

    expect(pickShadowMonster(0)).toMatchObject({
      source: "special",
      poolId: "shadow_stalkers",
      monsterId: "shadow_scout",
    });
    expect(pickShadowMonster(0.34)?.monsterId).toBe("night_assassin");
    expect(pickShadowMonster(0.67)?.monsterId).toBe("phantom_stalker");
  });

  it("selects uniformly inside the expanded venom colony pool", () => {
    const pickVenomMonster = (roll: number) =>
      pickUnexploredMonster({
        baseMonsterIds: ["base_a", "base_b"],
        shares: unexploredEncounterShares([
          { poolId: "venom_colony", core: true, frequency: true },
        ]),
        groupRng: () => 0.99,
        monsterRng: () => roll,
      });

    expect(pickVenomMonster(0)).toMatchObject({
      source: "special",
      poolId: "venom_colony",
      monsterId: "venom_fang_devourer",
    });
    expect(pickVenomMonster(0.34)?.monsterId).toBe("venom_sprayer");
    expect(pickVenomMonster(0.67)?.monsterId).toBe("corrosive_colony");
  });

  it("selects uniformly inside the expanded bloodstained dead pool", () => {
    const pickBloodstainedMonster = (roll: number) =>
      pickUnexploredMonster({
        baseMonsterIds: ["base_a", "base_b"],
        shares: unexploredEncounterShares([
          { poolId: "bloodstained_dead", core: true, frequency: true },
        ]),
        groupRng: () => 0.99,
        monsterRng: () => roll,
      });

    expect(pickBloodstainedMonster(0)).toMatchObject({
      source: "special",
      poolId: "bloodstained_dead",
      monsterId: "hooked_dead",
    });
    expect(pickBloodstainedMonster(0.34)?.monsterId).toBe(
      "bloodtrail_pursuer",
    );
    expect(pickBloodstainedMonster(0.67)?.monsterId).toBe(
      "severing_executioner",
    );
  });

  it("selects uniformly inside the expanded frozen legion pool", () => {
    const pickFrozenMonster = (roll: number) =>
      pickUnexploredMonster({
        baseMonsterIds: ["base_a", "base_b"],
        shares: unexploredEncounterShares([
          { poolId: "frozen_legion", core: true, frequency: true },
        ]),
        groupRng: () => 0.99,
        monsterRng: () => roll,
      });

    expect(pickFrozenMonster(0)).toMatchObject({
      source: "special",
      poolId: "frozen_legion",
      monsterId: "frost_toucher",
    });
    expect(pickFrozenMonster(0.34)?.monsterId).toBe("freezing_mage");
    expect(pickFrozenMonster(0.67)?.monsterId).toBe("frozen_sentinel");
  });

  it("selects uniformly inside the expanded crushing colossi pool", () => {
    const pickCrushingMonster = (roll: number) =>
      pickUnexploredMonster({
        baseMonsterIds: ["base_a", "base_b"],
        shares: unexploredEncounterShares([
          { poolId: "crushing_colossi", core: true, frequency: true },
        ]),
        groupRng: () => 0.99,
        monsterRng: () => roll,
      });

    expect(pickCrushingMonster(0)).toMatchObject({
      source: "special",
      poolId: "crushing_colossi",
      monsterId: "bedrock_colossus",
    });
    expect(pickCrushingMonster(0.34)?.monsterId).toBe("ironwall_crusher");
    expect(pickCrushingMonster(0.67)?.monsterId).toBe("crust_destroyer");
  });

  it("returns null only when the selected base pool is empty", () => {
    expect(
      pickUnexploredMonster({
        baseMonsterIds: [],
        shares: [{ kind: "base", share: 100 }],
        groupRng: () => 0,
        monsterRng: () => 0,
      }),
    ).toBeNull();
  });

  it("never emits a distribution below the base floor", () => {
    const allMaxed = UNEXPLORED_POOL_IDS.map((poolId) => ({
      poolId,
      core: true,
      frequency: true,
    }));
    const shares = unexploredEncounterShares(allMaxed);
    expect(shares[0]).toEqual({ kind: "base", share: 30 });
    expect(shares.reduce((sum, entry) => sum + entry.share, 0)).toBe(100);
  });

  it("allows the tracking deep node to lower the base floor to 25%", () => {
    const allMaxed = UNEXPLORED_POOL_IDS.map((poolId) => ({
      poolId,
      core: true,
      frequency: true,
    }));
    const shares = unexploredEncounterShares(allMaxed, {
      baseMinShare: 25,
    });

    expect(shares[0]).toEqual({ kind: "base", share: 25 });
    expect(
      shares
        .filter((entry) => entry.kind === "pool")
        .reduce((sum, entry) => sum + entry.share, 0),
    ).toBe(75);
    expect(shares.reduce((sum, entry) => sum + entry.share, 0)).toBe(100);
  });
});
