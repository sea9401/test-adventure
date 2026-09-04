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
      explorationProgressVersion: 2,
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
  ])(
    "preserves selected iron legion variant %s through runtime",
    (monsterRoll, monsterId) => {
      const prepared = prepareUnexploredHunt(
        character([
          "start",
          "pool-iron_legion",
          "enh-iron_legion-frequency",
        ]),
        (() => {
          const rolls = [0.95, monsterRoll];
          return () => rolls.shift() ?? 0;
        })(),
      );

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(prepared.runtime.monsterId).toBe(monsterId);
    },
  );

  it.each([
    [0.34, "rune_executor"],
    [0.67, "seal_watcher"],
  ])(
    "preserves selected mana barrier variant %s through runtime",
    (monsterRoll, monsterId) => {
      const prepared = prepareUnexploredHunt(
        character([
          "start",
          "pool-mana_barrier",
          "enh-mana_barrier-frequency",
        ]),
        (() => {
          const rolls = [0.95, monsterRoll];
          return () => rolls.shift() ?? 0;
        })(),
      );

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(prepared.runtime.monsterId).toBe(monsterId);
    },
  );

  it.each([
    [0.34, "devouring_regenerator"],
    [0.67, "proliferating_core"],
  ])(
    "preserves selected regenerating swarm variant %s through runtime",
    (monsterRoll, monsterId) => {
      const prepared = prepareUnexploredHunt(
        character([
          "start",
          "pool-regenerating_swarm",
          "enh-regenerating_swarm-frequency",
        ]),
        (() => {
          const rolls = [0.95, monsterRoll];
          return () => rolls.shift() ?? 0;
        })(),
      );

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(prepared.runtime.monsterId).toBe(monsterId);
    },
  );

  it.each([
    [0.34, "blood_duelist"],
    [0.67, "red_executioner"],
  ])(
    "preserves selected red berserkers variant %s through runtime",
    (monsterRoll, monsterId) => {
      const prepared = prepareUnexploredHunt(
        character([
          "start",
          "pool-red_berserkers",
          "enh-red_berserkers-frequency",
        ]),
        (() => {
          const rolls = [0.95, monsterRoll];
          return () => rolls.shift() ?? 0;
        })(),
      );

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(prepared.runtime.monsterId).toBe(monsterId);
    },
  );

  it.each([
    [0.34, "refraction_artillery"],
    [0.67, "crystal_sentinel"],
  ])(
    "preserves selected crystal artillery variant %s through runtime",
    (monsterRoll, monsterId) => {
      const prepared = prepareUnexploredHunt(
        character([
          "start",
          "pool-crystal_artillery",
          "enh-crystal_artillery-frequency",
        ]),
        (() => {
          const rolls = [0.95, monsterRoll];
          return () => rolls.shift() ?? 0;
        })(),
      );

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(prepared.runtime.monsterId).toBe(monsterId);
    },
  );

  it.each([
    [0.34, "lethal_sniper"],
    [0.67, "armor_hunter"],
  ])(
    "preserves selected precision hunters variant %s through runtime",
    (monsterRoll, monsterId) => {
      const prepared = prepareUnexploredHunt(
        character([
          "start",
          "pool-precision_hunters",
          "enh-precision_hunters-frequency",
        ]),
        (() => {
          const rolls = [0.95, monsterRoll];
          return () => rolls.shift() ?? 0;
        })(),
      );

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(prepared.runtime.monsterId).toBe(monsterId);
    },
  );

  it.each([
    [0.34, "combo_automaton"],
    [0.67, "overheated_enforcer"],
  ])(
    "preserves selected runaway machines variant %s through runtime",
    (monsterRoll, monsterId) => {
      const prepared = prepareUnexploredHunt(
        character([
          "start",
          "pool-runaway_machines",
          "enh-runaway_machines-frequency",
        ]),
        (() => {
          const rolls = [0.95, monsterRoll];
          return () => rolls.shift() ?? 0;
        })(),
      );

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(prepared.runtime.monsterId).toBe(monsterId);
    },
  );

  it.each([
    [0.34, "night_assassin"],
    [0.67, "phantom_stalker"],
  ])(
    "preserves selected shadow stalkers variant %s through runtime",
    (monsterRoll, monsterId) => {
      const prepared = prepareUnexploredHunt(
        character([
          "start",
          "pool-shadow_stalkers",
          "enh-shadow_stalkers-frequency",
        ]),
        (() => {
          const rolls = [0.95, monsterRoll];
          return () => rolls.shift() ?? 0;
        })(),
      );

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(prepared.runtime.monsterId).toBe(monsterId);
    },
  );

  it.each([
    [0.34, "venom_sprayer"],
    [0.67, "corrosive_colony"],
  ])(
    "preserves selected venom colony variant %s through runtime",
    (monsterRoll, monsterId) => {
      const prepared = prepareUnexploredHunt(
        character([
          "start",
          "pool-venom_colony",
          "enh-venom_colony-frequency",
        ]),
        (() => {
          const rolls = [0.95, monsterRoll];
          return () => rolls.shift() ?? 0;
        })(),
      );

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(prepared.runtime.monsterId).toBe(monsterId);
    },
  );

  it.each([
    [0.34, "bloodtrail_pursuer"],
    [0.67, "severing_executioner"],
  ])(
    "preserves selected bloodstained dead variant %s through runtime",
    (monsterRoll, monsterId) => {
      const prepared = prepareUnexploredHunt(
        character([
          "start",
          "pool-bloodstained_dead",
          "enh-bloodstained_dead-frequency",
        ]),
        (() => {
          const rolls = [0.95, monsterRoll];
          return () => rolls.shift() ?? 0;
        })(),
      );

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(prepared.runtime.monsterId).toBe(monsterId);
    },
  );

  it.each([
    [0.34, "freezing_mage"],
    [0.67, "frozen_sentinel"],
  ])(
    "preserves selected frozen legion variant %s through runtime",
    (monsterRoll, monsterId) => {
      const prepared = prepareUnexploredHunt(
        character([
          "start",
          "pool-frozen_legion",
          "enh-frozen_legion-frequency",
        ]),
        (() => {
          const rolls = [0.95, monsterRoll];
          return () => rolls.shift() ?? 0;
        })(),
      );

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(prepared.runtime.monsterId).toBe(monsterId);
    },
  );

  it.each([
    [0.34, "ironwall_crusher"],
    [0.67, "crust_destroyer"],
  ])(
    "preserves selected crushing colossi variant %s through runtime",
    (monsterRoll, monsterId) => {
      const prepared = prepareUnexploredHunt(
        character([
          "start",
          "pool-crushing_colossi",
          "enh-crushing_colossi-frequency",
        ]),
        (() => {
          const rolls = [0.95, monsterRoll];
          return () => rolls.shift() ?? 0;
        })(),
      );

      expect(prepared.ok).toBe(true);
      if (!prepared.ok) return;
      expect(prepared.runtime.monsterId).toBe(monsterId);
    },
  );

  it("selects exactly one base monster for one hunt", () => {
    const prepared = prepareUnexploredHunt(character(["start"]), () => 0.999);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.runtime.kind).toBe("base");
    expect(prepared.runtime.monsterId).toBe("unexplored_dead_star_observer");
  });

  it("미개척지 승리 한 번은 전투 경험치와 무관하게 탐사 경험치 1만 기록한다", () => {
    const before = character(["start"]).unexplored;
    const result = applyUnexploredHuntProgress({
      rawSave: before,
      won: true,
      specialMonsterKilled: true,
      traces: { frozen_legion: 2 },
    });
    expect(result.save.explorationXp).toBe(1);
    expect(result.save.traces).toEqual({ frozen_legion: 2 });
    expect(result.save.achievementIds).toEqual([
      "first_unexplored_hunt",
      "first_special_kill",
    ]);
    expect(result.xpGained).toBe(1);
  });

  it("does not grant rewards or achievements on defeat", () => {
    const before = character(["start"]).unexplored;
    const result = applyUnexploredHuntProgress({
      rawSave: before,
      won: false,
      specialMonsterKilled: true,
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

  it("미개척지 최종 장비 발급에도 해방 최소 품질을 보존한다", () => {
    const equipment = mintUnexploredRewardEquipment(
      "v2_iron_sword",
      0,
      () => 0,
      10,
    );
    expect(
      rollQualityPct(V2_EQUIPMENT.v2_iron_sword, equipment.roll!),
    ).toBeGreaterThanOrEqual(10);
  });
});
