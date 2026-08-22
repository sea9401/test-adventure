import { describe, expect, it } from "vitest";
import { emptyDangerousFishingState } from "./dangerousFishingState";
import {
  DANGEROUS_GEAR_ENHANCEMENT_COSTS,
  dangerousGearEnhancementLevel,
  enhanceDangerousGear,
  selectEnhancementMaterials,
} from "./dangerousFishingEnhancement";

function stateWithOwnedGear() {
  const state = emptyDangerousFishingState();
  return {
    ...state,
    ownedGear: {
      rods: [...state.ownedGear.rods, "breaker_rod" as const],
      reels: [...state.ownedGear.reels, "current_reel" as const],
      lines: [...state.ownedGear.lines, "braided_line" as const],
    },
  };
}

describe("위험 해역 장비 강화", () => {
  it("+1부터 +3까지 승인된 등급별 어획물과 낚시 코인 비용을 정의한다", () => {
    expect(DANGEROUS_GEAR_ENHANCEMENT_COSTS).toEqual({
      1: {
        materials: { common: 6, rare: 4 },
        fishingCoins: 1_000,
      },
      2: {
        materials: { rare: 8, epic: 5 },
        fishingCoins: 3_000,
      },
      3: {
        materials: { epic: 8, legendary: 3 },
        fishingCoins: 8_000,
      },
    });
  });

  it("장비 종류에 맞는 현재 강화도를 읽고 저장값은 0..3으로 제한한다", () => {
    const state = stateWithOwnedGear();
    state.gearEnhancements = {
      rods: { breaker_rod: 2 },
      reels: { current_reel: 9 },
      lines: { braided_line: -2 },
    };

    expect(dangerousGearEnhancementLevel(state, "rod", "breaker_rod")).toBe(2);
    expect(dangerousGearEnhancementLevel(state, "reel", "current_reel")).toBe(3);
    expect(dangerousGearEnhancementLevel(state, "line", "braided_line")).toBe(0);
    expect(dangerousGearEnhancementLevel(state, "rod", "unknown")).toBe(0);
  });

  it.each([
    ["rod", "breaker_rod"],
    ["reel", "current_reel"],
    ["line", "braided_line"],
  ] as const)("소유한 %s 장비를 항상 한 단계 높인다", (kind, gearId) => {
    const state = stateWithOwnedGear();
    state.gearEnhancements.rods.starter_rod = 2;
    const before = structuredClone(state);

    const result = enhanceDangerousGear(state, 1, kind, gearId);

    expect(result).toMatchObject({ ok: true, nextLevel: 1 });
    if (!result.ok) throw new Error("enhancement unexpectedly failed");
    expect(dangerousGearEnhancementLevel(result.state, kind, gearId)).toBe(1);
    expect(result.state.gearEnhancements.rods.starter_rod).toBe(2);
    expect(state).toEqual(before);
  });

  it.each([
    ["unknown", "breaker_rod", "invalid_kind"],
    ["rod", "unknown", "invalid_item"],
    ["rod", "breaker_rod", "not_owned"],
  ] as const)("유효하지 않은 강화 요청 %s/%s를 거부한다", (kind, gearId, error) => {
    const state = emptyDangerousFishingState();

    const result = enhanceDangerousGear(state, 1, kind, gearId);

    expect(result).toEqual({ ok: false, error });
    expect(state).toEqual(emptyDangerousFishingState());
  });

  it("최대 강화와 현재 단계 다음이 아닌 요청을 거부한다", () => {
    const state = stateWithOwnedGear();
    state.gearEnhancements.rods.breaker_rod = 3;

    expect(enhanceDangerousGear(state, 3, "rod", "breaker_rod")).toEqual({
      ok: false,
      error: "max_level",
    });

    state.gearEnhancements.rods.breaker_rod = 1;
    expect(enhanceDangerousGear(state, 3, "rod", "breaker_rod")).toEqual({
      ok: false,
      error: "invalid_level",
    });
    expect(state.gearEnhancements.rods.breaker_rod).toBe(1);
  });

  it("같은 등급 어획물은 보유량 우선 안정 순서로 섞어 정확한 비용을 고른다", () => {
    const materials = {
      danger_catch_storm_mackerel: 4,
      danger_catch_razor_sardine: 4,
      danger_catch_thunder_ray: 3,
      danger_catch_ironjaw_tuna: 3,
      danger_catch_lantern_eel: 2,
    };

    expect(selectEnhancementMaterials(materials, 1)).toEqual({
      danger_catch_razor_sardine: 4,
      danger_catch_storm_mackerel: 2,
      danger_catch_ironjaw_tuna: 3,
      danger_catch_thunder_ray: 1,
    });
    expect(materials).toEqual({
      danger_catch_storm_mackerel: 4,
      danger_catch_razor_sardine: 4,
      danger_catch_thunder_ray: 3,
      danger_catch_ironjaw_tuna: 3,
      danger_catch_lantern_eel: 2,
    });
  });

  it.each([
    [1, { danger_catch_razor_sardine: 5, danger_catch_ironjaw_tuna: 4 }],
    [1, { danger_catch_razor_sardine: 6, danger_catch_ironjaw_tuna: 3 }],
    [2, { danger_catch_ironjaw_tuna: 8, danger_catch_tempest_swordfish: 4 }],
    [3, { danger_catch_tempest_swordfish: 8, danger_catch_abyssal_crownfish: 2 }],
  ] as const)("+%i 강화의 등급별 어획물이 하나라도 부족하면 선택하지 않는다", (level, materials) => {
    expect(selectEnhancementMaterials(materials, level)).toBeNull();
  });

  it("자원을 함께 전달하면 정확히 차감하고 입력 자원은 바꾸지 않는다", () => {
    const state = stateWithOwnedGear();
    const materials = {
      danger_catch_razor_sardine: 6,
      danger_catch_ironjaw_tuna: 4,
      unrelated: 7,
    };
    const result = enhanceDangerousGear(state, 1, "rod", "breaker_rod", {
      fishingCoins: 1_500,
      materials,
    });

    expect(result).toMatchObject({
      ok: true,
      nextLevel: 1,
      fishingCoins: 500,
      materials: {
        danger_catch_razor_sardine: 0,
        danger_catch_ironjaw_tuna: 0,
        unrelated: 7,
      },
    });
    expect(materials).toEqual({
      danger_catch_razor_sardine: 6,
      danger_catch_ironjaw_tuna: 4,
      unrelated: 7,
    });
  });

  it("낚시 코인이나 어획물이 부족하면 어떤 입력도 바꾸지 않는다", () => {
    const state = stateWithOwnedGear();
    const materials = {
      danger_catch_razor_sardine: 6,
      danger_catch_ironjaw_tuna: 4,
    };
    const before = structuredClone(state);

    expect(
      enhanceDangerousGear(state, 1, "rod", "breaker_rod", {
        fishingCoins: 999,
        materials,
      }),
    ).toEqual({ ok: false, error: "insufficient_fishing_coins" });
    expect(
      enhanceDangerousGear(
        {
          ...state,
          gearEnhancements: {
            ...state.gearEnhancements,
            rods: { ...state.gearEnhancements.rods, breaker_rod: 1 },
          },
        },
        2,
        "rod",
        "breaker_rod",
        {
        fishingCoins: 3_000,
        materials,
        },
      ),
    ).toEqual({ ok: false, error: "insufficient_materials" });
    expect(state).toEqual(before);
    expect(materials).toEqual({
      danger_catch_razor_sardine: 6,
      danger_catch_ironjaw_tuna: 4,
    });
  });
});
