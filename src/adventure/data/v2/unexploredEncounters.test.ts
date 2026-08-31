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
    const result = pickUnexploredMonster({
      baseMonsterIds: ["base_a", "base_b"],
      shares: unexploredEncounterShares([
        { poolId: "iron_legion", core: true, frequency: true },
      ]),
      groupRng: () => 0.99,
      monsterRng: () => 0.999999,
    });
    expect(result).toEqual({
      source: "special",
      poolId: "iron_legion",
      monsterId: "armored_shieldman",
    });
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
