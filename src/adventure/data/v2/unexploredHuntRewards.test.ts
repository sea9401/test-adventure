import { describe, expect, it } from "vitest";
import type { UnexploredEffects } from "./unexploredTree";
import { deriveUnexploredEffects } from "./unexploredTree";
import {
  buildUnexploredRewardPlan,
  rollUnexploredHuntRewards,
} from "./unexploredHuntRewards";
import { unexploredMonsterAtDifficulty } from "./unexploredMonsters";
import { emptyEquippedLiberationEffects } from "./equipmentLiberationEffects";

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

  it("uses the same iron legion material rule for every active variant", () => {
    const rules = [
      "armored_shieldman",
      "armored_spearman",
      "armored_crusher",
    ].map((monsterId) =>
      buildUnexploredRewardPlan(
        unexploredMonsterAtDifficulty({
          source: "special",
          poolId: "iron_legion",
          monsterId,
          focused: false,
          difficulty: 95,
        }),
        effects(),
      ).rolls,
    );

    expect(rules).toEqual([
      [
        {
          id: "v2_unexplored_iron_legion_material",
          tag: "special",
          chance: 0.01,
          amount: 1,
        },
      ],
      [
        {
          id: "v2_unexplored_iron_legion_material",
          tag: "special",
          chance: 0.01,
          amount: 1,
        },
      ],
      [
        {
          id: "v2_unexplored_iron_legion_material",
          tag: "special",
          chance: 0.01,
          amount: 1,
        },
      ],
    ]);
  });

  it("앞쪽 여섯 풀은 일반 0.1%·집중 0.2%의 공유 개척자 무기를 가진다", () => {
    const rows = [
      ["iron_legion", "v2_pioneer_ironstar_greatsword"],
      ["mana_barrier", "v2_pioneer_barrier_amplifier_staff"],
      ["regenerating_swarm", "v2_pioneer_pulsing_devourer_dagger"],
      ["red_berserkers", "v2_pioneer_bloodstar_greatsword"],
      ["crystal_artillery", "v2_pioneer_refracting_crystal_staff"],
      ["precision_hunters", "v2_pioneer_flawless_longbow"],
    ] as const;

    for (const [poolId, equipmentId] of rows) {
      const normal = buildUnexploredRewardPlan(
        unexploredMonsterAtDifficulty({ source: "special", poolId, focused: false, difficulty: 95 }),
        effects(),
      );
      const focused = buildUnexploredRewardPlan(
        unexploredMonsterAtDifficulty({ source: "special", poolId, focused: true, difficulty: 95 }),
        effects(),
      );
      expect(normal.rareWeapon, poolId).toEqual({ id: equipmentId, chance: 0.001 });
      expect(focused.rareWeapon, poolId).toEqual({ id: equipmentId, chance: 0.002 });

      const normalHit = rollUnexploredHuntRewards(normal, sequence(0.999, 0.000999));
      expect(normalHit.droppedUniques, `${poolId} normal hit`).toEqual([equipmentId]);
      const normalMiss = rollUnexploredHuntRewards(normal, sequence(0.999, 0.001));
      expect(normalMiss.droppedUniques, `${poolId} normal boundary`).toEqual([]);
      const focusedHit = rollUnexploredHuntRewards(focused, sequence(0.999, 0.001999));
      expect(focusedHit.droppedUniques, `${poolId} focused hit`).toEqual([equipmentId]);
      const focusedMiss = rollUnexploredHuntRewards(focused, sequence(0.999, 0.002));
      expect(focusedMiss.droppedUniques, `${poolId} focused boundary`).toEqual([]);
    }
  });

  it("개척자 무기는 희귀 추가 복사만 받고 공용 장비·풀 전리품 배율은 받지 않는다", () => {
    const monster = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "iron_legion",
      focused: false,
      difficulty: 95,
    });
    const boosted = effects({
      rewardPct: { equipment: 500 } as UnexploredEffects["rewardPct"],
      poolLootPctByPool: { iron_legion: 500 },
      rareCopyChancePct: 100,
    });
    const result = rollUnexploredHuntRewards(
      buildUnexploredRewardPlan(monster, boosted),
      sequence(0.999, 0.000999, 0.5),
    );

    expect(result.droppedUniques).toEqual([
      "v2_pioneer_ironstar_greatsword",
      "v2_pioneer_ironstar_greatsword",
    ]);
    expect(result.grants).toEqual([
      {
        kind: "unique",
        id: "v2_pioneer_ironstar_greatsword",
        amount: 1,
        tag: "rare",
        source: "unexplored_monster_drop",
      },
      {
        kind: "unique",
        id: "v2_pioneer_ironstar_greatsword",
        amount: 1,
        tag: "rare",
        source: "unexplored_node_bonus",
      },
    ]);
  });

  it("기본 몬스터와 뒤쪽 보스 연결 풀에는 개척자 무기 슬롯이 없다", () => {
    const base = unexploredMonsterAtDifficulty({
      source: "base",
      poolId: null,
      monsterId: "unexplored_star_sea_warden",
      focused: false,
      difficulty: 95,
    });
    const bossPool = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "runaway_machines",
      focused: false,
      difficulty: 95,
    });
    expect(buildUnexploredRewardPlan(base, effects()).rareWeapon).toBeNull();
    expect(buildUnexploredRewardPlan(bossPool, effects()).rareWeapon).toBeNull();
  });

  it("uses the same mana barrier material rule for every active variant", () => {
    const rules = [
      "barrier_guardian",
      "rune_executor",
      "seal_watcher",
    ].map((monsterId) =>
      buildUnexploredRewardPlan(
        unexploredMonsterAtDifficulty({
          source: "special",
          poolId: "mana_barrier",
          monsterId,
          focused: false,
          difficulty: 95,
        }),
        effects(),
      ).rolls,
    );

    for (const rule of rules) {
      expect(rule).toEqual([
        {
          id: "v2_unexplored_mana_barrier_material",
          tag: "special",
          chance: 0.01,
          amount: 1,
        },
      ]);
    }
  });

  it("uses the same regenerating swarm material rule for every active variant", () => {
    const rules = [
      "regenerating_spore",
      "devouring_regenerator",
      "proliferating_core",
    ].map((monsterId) =>
      buildUnexploredRewardPlan(
        unexploredMonsterAtDifficulty({
          source: "special",
          poolId: "regenerating_swarm",
          monsterId,
          focused: false,
          difficulty: 95,
        }),
        effects(),
      ).rolls,
    );

    for (const rule of rules) {
      expect(rule).toEqual([
        {
          id: "v2_unexplored_regenerating_swarm_material",
          tag: "special",
          chance: 0.01,
          amount: 1,
        },
      ]);
    }
  });

  it("uses the same red berserkers material rule for every active variant", () => {
    const rules = [
      "red_berserker",
      "blood_duelist",
      "red_executioner",
    ].map((monsterId) =>
      buildUnexploredRewardPlan(
        unexploredMonsterAtDifficulty({
          source: "special",
          poolId: "red_berserkers",
          monsterId,
          focused: false,
          difficulty: 95,
        }),
        effects(),
      ).rolls,
    );

    for (const rule of rules) {
      expect(rule).toEqual([
        {
          id: "v2_unexplored_red_berserkers_material",
          tag: "special",
          chance: 0.01,
          amount: 1,
        },
      ]);
    }
  });

  it("uses the same crystal artillery material rule for every active variant", () => {
    const rules = [
      "crystal_mage",
      "refraction_artillery",
      "crystal_sentinel",
    ].map((monsterId) =>
      buildUnexploredRewardPlan(
        unexploredMonsterAtDifficulty({
          source: "special",
          poolId: "crystal_artillery",
          monsterId,
          focused: false,
          difficulty: 95,
        }),
        effects(),
      ).rolls,
    );

    for (const rule of rules) {
      expect(rule).toEqual([
        {
          id: "v2_unexplored_crystal_artillery_material",
          tag: "special",
          chance: 0.01,
          amount: 1,
        },
      ]);
    }
  });

  it("uses the same precision hunters material rule for every active variant", () => {
    const rules = [
      "precision_scout",
      "lethal_sniper",
      "armor_hunter",
    ].map((monsterId) =>
      buildUnexploredRewardPlan(
        unexploredMonsterAtDifficulty({
          source: "special",
          poolId: "precision_hunters",
          monsterId,
          focused: false,
          difficulty: 95,
        }),
        effects(),
      ).rolls,
    );

    for (const rule of rules) {
      expect(rule).toEqual([
        {
          id: "v2_unexplored_precision_hunters_material",
          tag: "special",
          chance: 0.01,
          amount: 1,
        },
      ]);
    }
  });

  it("uses the same runaway machines material rule for every active variant", () => {
    const rules = [
      "rushing_machine",
      "combo_automaton",
      "overheated_enforcer",
    ].map((monsterId) =>
      buildUnexploredRewardPlan(
        unexploredMonsterAtDifficulty({
          source: "special",
          poolId: "runaway_machines",
          monsterId,
          focused: false,
          difficulty: 95,
        }),
        effects(),
      ).rolls,
    );

    for (const rule of rules) {
      expect(rule).toEqual([
        {
          id: "v2_unexplored_runaway_machines_material",
          tag: "special",
          chance: 0.01,
          amount: 1,
        },
      ]);
    }
  });

  it("uses the same shadow stalkers material rule for every active variant", () => {
    const rules = [
      "shadow_scout",
      "night_assassin",
      "phantom_stalker",
    ].map((monsterId) =>
      buildUnexploredRewardPlan(
        unexploredMonsterAtDifficulty({
          source: "special",
          poolId: "shadow_stalkers",
          monsterId,
          focused: false,
          difficulty: 95,
        }),
        effects(),
      ).rolls,
    );

    for (const rule of rules) {
      expect(rule).toEqual([
        {
          id: "v2_unexplored_shadow_stalkers_material",
          tag: "special",
          chance: 0.01,
          amount: 1,
        },
      ]);
    }
  });

  it("uses the same venom colony material rule for every active variant", () => {
    const rules = [
      "venom_fang_devourer",
      "venom_sprayer",
      "corrosive_colony",
    ].map((monsterId) =>
      buildUnexploredRewardPlan(
        unexploredMonsterAtDifficulty({
          source: "special",
          poolId: "venom_colony",
          monsterId,
          focused: false,
          difficulty: 95,
        }),
        effects(),
      ).rolls,
    );

    for (const rule of rules) {
      expect(rule).toEqual([
        {
          id: "v2_unexplored_venom_colony_material",
          tag: "special",
          chance: 0.01,
          amount: 1,
        },
      ]);
    }
  });

  it("uses the same bloodstained dead material rule for every active variant", () => {
    const rules = [
      "hooked_dead",
      "bloodtrail_pursuer",
      "severing_executioner",
    ].map((monsterId) =>
      buildUnexploredRewardPlan(
        unexploredMonsterAtDifficulty({
          source: "special",
          poolId: "bloodstained_dead",
          monsterId,
          focused: false,
          difficulty: 95,
        }),
        effects(),
      ).rolls,
    );

    for (const rule of rules) {
      expect(rule).toEqual([
        {
          id: "v2_unexplored_bloodstained_dead_material",
          tag: "special",
          chance: 0.01,
          amount: 1,
        },
      ]);
    }
  });

  it("uses the same frozen legion material rule for every active variant", () => {
    const rules = [
      "frost_toucher",
      "freezing_mage",
      "frozen_sentinel",
    ].map((monsterId) =>
      buildUnexploredRewardPlan(
        unexploredMonsterAtDifficulty({
          source: "special",
          poolId: "frozen_legion",
          monsterId,
          focused: false,
          difficulty: 95,
        }),
        effects(),
      ).rolls,
    );

    for (const rule of rules) {
      expect(rule).toEqual([
        {
          id: "v2_unexplored_frozen_legion_material",
          tag: "special",
          chance: 0.01,
          amount: 1,
        },
      ]);
    }
  });

  it("uses the same crushing colossi material rule for every active variant", () => {
    const rules = [
      "bedrock_colossus",
      "ironwall_crusher",
      "crust_destroyer",
    ].map((monsterId) =>
      buildUnexploredRewardPlan(
        unexploredMonsterAtDifficulty({
          source: "special",
          poolId: "crushing_colossi",
          monsterId,
          focused: false,
          difficulty: 95,
        }),
        effects(),
      ).rolls,
    );

    for (const rule of rules) {
      expect(rule).toEqual([
        {
          id: "v2_unexplored_crushing_colossi_material",
          tag: "special",
          chance: 0.01,
          amount: 1,
        },
      ]);
    }
  });

  it("해방 일반·특화·희귀 재료 배율을 각 확률에만 곱한다", () => {
    const hunt = emptyEquippedLiberationEffects().hunt;
    const boosted = {
      ...hunt,
      normalMaterialDropPct: 20,
      specialMaterialDropPct: 30,
      rareMaterialDropPct: 40,
    };
    const baseMonster = unexploredMonsterAtDifficulty({
      source: "base",
      poolId: null,
      monsterId: "unexplored_star_sea_warden",
      focused: false,
      difficulty: 95,
    });
    const specialMonster = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "iron_legion",
      focused: false,
      difficulty: 95,
    });

    expect(buildUnexploredRewardPlan(baseMonster, effects(), boosted).rolls)
      .toEqual([
        expect.objectContaining({ tag: "base", chance: 0.036 }),
        expect.objectContaining({ tag: "rare", chance: 0.0014 }),
      ]);
    const specialRule = buildUnexploredRewardPlan(
      specialMonster,
      effects(),
      boosted,
    ).rolls[0];
    expect(specialRule).toMatchObject({ tag: "special" });
    expect(specialRule?.chance).toBeCloseTo(0.013);
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
    const result = rollUnexploredHuntRewards(plan, sequence(0.999, 0.999, 0, 0), {
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
