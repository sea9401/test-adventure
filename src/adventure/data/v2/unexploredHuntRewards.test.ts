import { describe, expect, it } from "vitest";
import type { UnexploredEffects } from "./unexploredTree";
import { deriveUnexploredEffects } from "./unexploredTree";
import {
  buildUnexploredRewardPlan,
  rollUnexploredHuntRewards,
} from "./unexploredHuntRewards";
import { unexploredMonsterAtDifficulty } from "./unexploredMonsters";

function sequence(...rolls: number[]): () => number {
  let index = 0;
  return () => rolls[index++] ?? 0.999999;
}

function effects(patch: Partial<UnexploredEffects> = {}): UnexploredEffects {
  const base = deriveUnexploredEffects([]);
  return {
    ...base,
    ...patch,
    rewardPct: { ...base.rewardPct, ...patch.rewardPct },
  };
}

describe("unexplored hunt rewards", () => {
  it("builds the two fixed base-monster rolls with exactly one tag each", () => {
    const monster = unexploredMonsterAtDifficulty({
      source: "base",
      poolId: null,
      monsterId: "unexplored_star_sea_warden",
      focused: false,
      difficulty: 95,
    });
    const plan = buildUnexploredRewardPlan(monster, effects());

    expect(plan.rolls).toEqual([
      {
        id: "v2_unexplored_star_sea_shell",
        tag: "base",
        chance: 0.03,
        amount: 1,
      },
      {
        id: "v2_unexplored_star_sea_core",
        tag: "rare",
        chance: 0.001,
        amount: 1,
      },
    ]);
    expect(plan.rolls.every((rule) => typeof rule.tag === "string")).toBe(true);
  });

  it("scales special material chance to 2.15% or focused 3.225%", () => {
    const normal = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "iron_legion",
      focused: false,
      difficulty: 95,
    });
    const focused = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "iron_legion",
      focused: true,
      difficulty: 95,
    });
    const boosted = effects({
      rewardPct: { specialMaterial: 115 } as UnexploredEffects["rewardPct"],
    });

    expect(buildUnexploredRewardPlan(normal, boosted).rolls[0]).toMatchObject({
      tag: "special",
      chance: 0.0215,
    });
    expect(buildUnexploredRewardPlan(focused, boosted).rolls[0]).toMatchObject({
      tag: "special",
      chance: 0.03225,
    });
  });

  it("uses strict probability boundaries and only rare drops receive rare copies", () => {
    const monster = unexploredMonsterAtDifficulty({
      source: "base",
      poolId: null,
      monsterId: "unexplored_star_sea_warden",
      focused: false,
      difficulty: 95,
    });
    const plan = buildUnexploredRewardPlan(
      monster,
      effects({ rareCopyChancePct: 55 }),
    );
    const hit = rollUnexploredHuntRewards(
      plan,
      sequence(0.029999, 0.000999, 0.549999),
    );
    expect(hit.drops).toEqual({
      v2_unexplored_star_sea_shell: 1,
      v2_unexplored_star_sea_core: 2,
    });
    expect(
      hit.grants.filter(
        (grant) => grant.source === "unexplored_node_bonus",
      ),
    ).toEqual([
      expect.objectContaining({
        id: "v2_unexplored_star_sea_core",
        tag: "rare",
        amount: 1,
      }),
    ]);

    const miss = rollUnexploredHuntRewards(
      plan,
      sequence(0.03, 0.001),
    );
    expect(miss.drops).toEqual({});
  });

  it("caps combined trace bonus at 95% and storage at 2500", () => {
    const monster = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "frozen_legion",
      focused: false,
      difficulty: 120,
    });
    const plan = buildUnexploredRewardPlan(
      monster,
      effects({
        traceEnabled: true,
        traceExtraChancePct: 75,
        traceExtraChancePctByPool: { frozen_legion: 20 },
      }),
    );
    expect(plan.trace).toMatchObject({ extraChance: 0.95 });

    const hit = rollUnexploredHuntRewards(plan, sequence(0.999, 0.949999), {
      existingTraces: { frozen_legion: 2499 },
    });
    expect(hit.traces).toEqual({ frozen_legion: 2500 });
    expect(hit.traceGranted).toBe(1);

    const miss = rollUnexploredHuntRewards(plan, sequence(0.999, 0.95), {
      existingTraces: {},
    });
    expect(miss.traces).toEqual({ frozen_legion: 1 });
    expect(miss.traceGranted).toBe(1);
  });

  it.each([
    ["deep-gold", { gold: 30, material: -50, equipment: -50, special: -50 }],
    ["deep-collector", { gold: -50, material: 80, equipment: -50, special: 80 }],
    ["deep-armory", { gold: -50, material: -50, equipment: 80, special: -50 }],
    ["deep-contract", { gold: 5, material: 15, equipment: 15, special: 15 }],
    ["deep-tracking", { gold: 0, material: -25, equipment: -25, special: 30 }],
  ])("combines %s modifiers additively", (nodeId, expected) => {
    const baseMonster = unexploredMonsterAtDifficulty({
      source: "base",
      poolId: null,
      focused: false,
      difficulty: 95,
    });
    const specialMonster = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "iron_legion",
      focused: false,
      difficulty: 95,
    });
    const selected = deriveUnexploredEffects([nodeId]);
    const basePlan = buildUnexploredRewardPlan(baseMonster, selected);
    const specialPlan = buildUnexploredRewardPlan(specialMonster, selected);

    expect(basePlan.commonBonusPct).toMatchObject({
      gold: expected.gold + (nodeId === "deep-tracking" ? -25 : 0),
      material: expected.material,
      equipment: expected.equipment,
    });
    expect(specialPlan.specialMaterialBonusPct).toBe(expected.special);
  });

  it("adds front-pool loot search to common gold and equipment only", () => {
    const monster = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "iron_legion",
      focused: false,
      difficulty: 95,
    });
    const plan = buildUnexploredRewardPlan(
      monster,
      deriveUnexploredEffects(["enh-iron_legion-loot"]),
    );
    expect(plan.commonBonusPct).toMatchObject({
      gold: 20,
      material: 0,
      equipment: 20,
    });
    expect(plan.specialMaterialBonusPct).toBe(0);
  });

  it("marks duplicated common rewards as exploration-node bonuses", () => {
    const monster = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "iron_legion",
      focused: false,
      difficulty: 95,
    });
    const plan = buildUnexploredRewardPlan(
      monster,
      effects({
        rewardPct: {
          gold: 20,
          equipment: 20,
          baseMaterial: 20,
        } as UnexploredEffects["rewardPct"],
      }),
    );
    const result = rollUnexploredHuntRewards(plan, sequence(0.999, 0, 0, 0), {
      common: {
        gold: 100,
        drops: { v2_enhance_stone_red: 1 },
        droppedEquipments: ["v2_iron_sword"],
        droppedUniques: [],
      },
    });
    expect(result.gold).toBe(120);
    expect(result.drops.v2_enhance_stone_red).toBe(2);
    expect(result.droppedEquipments).toEqual([
      "v2_iron_sword",
      "v2_iron_sword",
    ]);
    expect(
      result.grants.filter(
        (grant) => grant.source === "unexplored_node_bonus",
      ),
    ).toHaveLength(3);
  });
});
