import { describe, expect, it } from "vitest";
import {
  applyUnexploredHuntProgress,
  mintUnexploredRewardEquipment,
  prepareUnexploredHunt,
  validateDungeonHuntMode,
} from "./unexploredHunt";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";

function character(selectedNodeIds: string[], level = 100) {
  return {
    level,
    unexplored: {
      explorationXp: 0,
      xpPoints: 10,
      achievementIds: [],
      selectedNodeIds,
      traces: {},
      craftReceipts: [],
      equipmentCraftReceipts: [],
    },
  };
}

describe("unexplored hunt server authority", () => {
  it("keeps normal as the default and hides disabled unexplored mode", () => {
    expect(validateDungeonHuntMode(undefined, false)).toEqual({
      ok: true,
      mode: "normal",
    });
    expect(validateDungeonHuntMode("unexplored", false)).toEqual({
      ok: false,
      error: "not_found",
      status: 404,
    });
    expect(validateDungeonHuntMode("invalid", true)).toEqual({
      ok: false,
      error: "bad_intent",
      status: 400,
    });
  });

  it("rejects characters below level 100 and saves without the start node", () => {
    expect(prepareUnexploredHunt(character(["start"], 99), () => 0)).toEqual({
      ok: false,
      error: "level_required",
    });
    expect(prepareUnexploredHunt(character([], 100), () => 0)).toEqual({
      ok: false,
      error: "start_required",
    });
  });

  it("ignores client depth by deriving difficulty and encounter shares from nodes", () => {
    const prepared = prepareUnexploredHunt(
      character(["start", "pool-iron_legion", "enh-iron_legion-frequency"]),
      (() => {
        const rolls = [0.95, 0.2];
        return () => rolls.shift() ?? 0;
      })(),
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.difficulty).toBe(95);
    expect(prepared.encounterShares).toEqual([
      { kind: "base", share: 70 },
      { kind: "pool", poolId: "iron_legion", share: 30 },
    ]);
    expect(prepared.runtime.kind).toBe("special");
    expect(prepared.runtime.monsterId).toBe("armored_shieldman");
  });

  it.each([
    [0.34, "armored_spearman"],
    [0.67, "armored_crusher"],
  ])("preserves selected iron legion variant %s through runtime", (monsterRoll, monsterId) => {
    const prepared = prepareUnexploredHunt(
      character(["start", "pool-iron_legion", "enh-iron_legion-frequency"]),
      (() => {
        const rolls = [0.95, monsterRoll];
        return () => rolls.shift() ?? 0;
      })(),
    );

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.runtime.monsterId).toBe(monsterId);
  });

  it("selects exactly one base monster for one hunt", () => {
    const prepared = prepareUnexploredHunt(character(["start"]), () => 0.999);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.runtime.kind).toBe("base");
    expect(prepared.runtime.monsterId).toBe("unexplored_dead_star_observer");
  });

  it("records victory achievements, traces, and exploration XP in one save", () => {
    const before = character(["start"]).unexplored;
    const result = applyUnexploredHuntProgress({
      rawSave: before,
      won: true,
      specialMonsterKilled: true,
      overflowExp: 123,
      traces: { frozen_legion: 2 },
    });
    expect(result.save.explorationXp).toBe(123);
    expect(result.save.traces).toEqual({ frozen_legion: 2 });
    expect(result.save.achievementIds).toEqual([
      "first_unexplored_hunt",
      "first_special_kill",
    ]);
    expect(result.xpGained).toBe(123);
  });

  it("does not grant rewards or achievements on defeat", () => {
    const before = character(["start"]).unexplored;
    const result = applyUnexploredHuntProgress({
      rawSave: before,
      won: false,
      specialMonsterKilled: true,
      overflowExp: 123,
      traces: { frozen_legion: 2 },
    });
    expect(result.save).toEqual(before);
    expect(result.xpGained).toBe(0);
  });

  it("uses a best-of-two option roll when the quality bonus succeeds", () => {
    const low = mintUnexploredRewardEquipment("v2_iron_sword", 0, () => 0);
    const rolls = [0, 0, 0.999999, 0.999999];
    const boosted = mintUnexploredRewardEquipment(
      "v2_iron_sword",
      100,
      () => rolls.shift() ?? 0.999999,
    );
    expect(
      rollQualityPct(V2_EQUIPMENT.v2_iron_sword, boosted.roll!),
    ).toBeGreaterThan(
      rollQualityPct(V2_EQUIPMENT.v2_iron_sword, low.roll!) ?? 0,
    );
  });
});
