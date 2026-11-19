import { describe, expect, it } from "vitest";
import { V2_MATERIALS } from "./dungeonDrops";
import { UNEXPLORED_MONSTER_POOLS } from "./unexploredMonsterPools";
import {
  UNEXPLORED_BASE_DROP_MATERIALS,
  UNEXPLORED_POOL_MATERIALS,
  grantUnexploredTrace,
  parseUnexploredTraces,
  rollUnexploredTraceAmount,
} from "./unexploredRewards";
import {
  UNEXPLORED_BOSS_CORE_MATERIAL,
  UNEXPLORED_SUMMON_STONE_MATERIALS,
} from "./unexploredBosses";

describe("unexplored rewards", () => {
  it("defines one shared material for every pool", () => {
    expect(Object.keys(UNEXPLORED_POOL_MATERIALS)).toHaveLength(12);
    expect(
      UNEXPLORED_POOL_MATERIALS.v2_unexplored_iron_legion_material.name,
    ).toBe("강화 철편");
    expect(
      UNEXPLORED_POOL_MATERIALS.v2_unexplored_crushing_colossi_material.name,
    ).toBe("거수 골편");
  });

  it("registers every pool material in the shared V2 catalog", () => {
    for (const [id, material] of Object.entries(
      UNEXPLORED_POOL_MATERIALS,
    )) {
      expect(V2_MATERIALS[id]).toEqual(material);
    }
  });

  it("registers five base monster material pairs in the shared V2 catalog", () => {
    expect(Object.keys(UNEXPLORED_BASE_DROP_MATERIALS)).toHaveLength(10);
    expect(
      UNEXPLORED_BASE_DROP_MATERIALS.v2_unexplored_star_sea_shell.name,
    ).toBe("성해 갑각");
    expect(
      UNEXPLORED_BASE_DROP_MATERIALS.v2_unexplored_dead_star_eye.name,
    ).toBe("죽은 별의 눈");
    for (const [id, material] of Object.entries(
      UNEXPLORED_BASE_DROP_MATERIALS,
    )) {
      expect(V2_MATERIALS[id]).toEqual(material);
    }
  });

  it("저장된 흔적은 가장 높은 보관 상한 5,000으로만 자르고, 받을 때는 기본 상한 2,500을 쓴다", () => {
    const parsed = parseUnexploredTraces({
      iron_legion: 2499.9,
      venom_colony: 999999,
      frozen_legion: -3,
      unknown: 50,
    });
    expect(parsed).toEqual({ iron_legion: 2499, venom_colony: 5000 });
    expect(grantUnexploredTrace(parsed, "iron_legion", 5)).toEqual({
      traces: { iron_legion: 2500, venom_colony: 5000 },
      granted: 1,
    });
  });

  it("탐사 등급으로 늘어난 보관 상한까지 흔적을 받는다", () => {
    expect(grantUnexploredTrace({ iron_legion: 2499 }, "iron_legion", 5, 3_500)).toEqual({
      traces: { iron_legion: 2504 },
      granted: 5,
    });
    expect(grantUnexploredTrace({ iron_legion: 3_499 }, "iron_legion", 5, 3_500)).toEqual({
      traces: { iron_legion: 3_500 },
      granted: 1,
    });
  });

  it("이미 상한보다 많이 가진 흔적은 줄이지 않는다", () => {
    expect(grantUnexploredTrace({ iron_legion: 3_000 }, "iron_legion", 2, 2_500)).toEqual({
      traces: { iron_legion: 3_000 },
      granted: 0,
    });
  });

  it("grants exactly one base trace for one defeated special monster", () => {
    const amount = rollUnexploredTraceAmount({
      defeatedSpecial: true,
      extraChancePct: 0,
      rng: () => 0,
    });
    expect(amount).toBe(1);
    expect(grantUnexploredTrace({}, "frozen_legion", amount)).toEqual({
      traces: { frozen_legion: 1 },
      granted: 1,
    });
  });

  it("allows at most one extra trace for a defeated special monster", () => {
    expect(
      rollUnexploredTraceAmount({
        defeatedSpecial: true,
        extraChancePct: 20,
        rng: () => 0.199999,
      }),
    ).toBe(2);
    expect(
      rollUnexploredTraceAmount({
        defeatedSpecial: true,
        extraChancePct: 95,
        rng: () => 0.949999,
      }),
    ).toBe(2);
    expect(
      rollUnexploredTraceAmount({
        defeatedSpecial: true,
        extraChancePct: 95,
        rng: () => 0.95,
      }),
    ).toBe(1);
    expect(
      rollUnexploredTraceAmount({
        defeatedSpecial: false,
        extraChancePct: 100,
        rng: () => 0,
      }),
    ).toBe(0);
  });

  it("keeps pool, material, and trace identifiers aligned", () => {
    for (const pool of UNEXPLORED_MONSTER_POOLS) {
      expect(UNEXPLORED_POOL_MATERIALS[pool.materialId]?.name).toBe(
        pool.materialName,
      );
      expect(grantUnexploredTrace({}, pool.id).traces[pool.id]).toBe(1);
    }
  });

  it("registers six summon stones and the shared boss core", () => {
    expect(Object.keys(UNEXPLORED_SUMMON_STONE_MATERIALS)).toHaveLength(6);
    for (const [id, material] of Object.entries(
      UNEXPLORED_SUMMON_STONE_MATERIALS,
    )) {
      expect(V2_MATERIALS[id]).toEqual(material);
    }
    expect(V2_MATERIALS[UNEXPLORED_BOSS_CORE_MATERIAL.id]).toEqual(
      UNEXPLORED_BOSS_CORE_MATERIAL,
    );
  });
});
