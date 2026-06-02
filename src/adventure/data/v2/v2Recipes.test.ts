import { describe, expect, it } from "vitest";
import {
  V2_RECIPES,
  consumeIngredients,
  craftShortfall,
  recipeFor,
  salvageYield,
  type V2Recipe,
} from "./v2Recipes";

// 2026-06-03: 제작 시스템 보류 — V2_RECIPES 카탈로그 비움(대장간 제작 불가). 순수 헬퍼
// (craftShortfall/consumeIngredients/salvageYield)는 휴면 보존 — 합성 레시피로 계약 회귀 가드.

describe("V2_RECIPES — 제작 보류", () => {
  it("레시피 카탈로그가 비어 있음", () => {
    expect(Object.keys(V2_RECIPES)).toHaveLength(0);
  });

  it("recipeFor 는 어떤 장비든 undefined", () => {
    expect(recipeFor("v2_iron_sword")).toBeUndefined();
  });
});

// 합성 레시피 — 헬퍼 계약 검증용(카탈로그 비의존). T1 형태(거친광석×2 + 약초×2, 골드 225).
const RECIPE: V2Recipe = {
  result: "v2_iron_sword",
  ingredients: [
    { id: "v2_rough_ore", count: 2 },
    { id: "v2_herb", count: 2 },
  ],
  gold: 225,
};

describe("craftShortfall", () => {
  it("재료·골드 충분하면 ok", () => {
    const r = craftShortfall(RECIPE, { v2_rough_ore: 5, v2_herb: 5 }, 10_000);
    expect(r.ok).toBe(true);
    expect(r.missingMaterials).toEqual([]);
    expect(r.goldShort).toBe(0);
  });

  it("재료 부족 → missingMaterials 에 need/have", () => {
    const r = craftShortfall(RECIPE, { v2_rough_ore: 1 }, 10_000);
    expect(r.ok).toBe(false);
    expect(r.missingMaterials.find((m) => m.id === "v2_rough_ore")).toEqual({
      id: "v2_rough_ore",
      need: 2,
      have: 1,
    });
    expect(r.missingMaterials.some((m) => m.id === "v2_herb")).toBe(true);
  });

  it("골드 부족 → goldShort", () => {
    const r = craftShortfall(RECIPE, { v2_rough_ore: 5, v2_herb: 5 }, 100);
    expect(r.ok).toBe(false);
    expect(r.goldShort).toBe(RECIPE.gold - 100);
  });

  it("손상 입력(materials 객체 아님)은 빈 보유로 간주", () => {
    const r = craftShortfall(RECIPE, null, 10_000);
    expect(r.ok).toBe(false);
    expect(r.missingMaterials.length).toBe(2);
  });

  it("같은 재료가 여러 줄이면 필요량 합산(중복 안전)", () => {
    const dup: V2Recipe = {
      result: "v2_iron_sword",
      ingredients: [
        { id: "v2_herb", count: 2 },
        { id: "v2_herb", count: 3 },
      ],
      gold: 0,
    };
    const r = craftShortfall(dup, { v2_herb: 4 }, 0);
    expect(r.ok).toBe(false);
    expect(r.missingMaterials).toEqual([{ id: "v2_herb", need: 5, have: 4 }]);
    expect(craftShortfall(dup, { v2_herb: 5 }, 0).ok).toBe(true);
  });
});

describe("consumeIngredients", () => {
  it("정확히 소진하면 키 제거", () => {
    expect(consumeIngredients({ v2_rough_ore: 2, v2_herb: 2 }, RECIPE)).toEqual(
      {},
    );
  });

  it("부분 차감 — 남은 양 유지", () => {
    expect(consumeIngredients({ v2_rough_ore: 5, v2_herb: 5 }, RECIPE)).toEqual({
      v2_rough_ore: 3,
      v2_herb: 3,
    });
  });

  it("레시피 무관 재료는 보존", () => {
    expect(
      consumeIngredients(
        { v2_rough_ore: 2, v2_herb: 2, v2_mithril_ore: 9 },
        RECIPE,
      ),
    ).toEqual({ v2_mithril_ore: 9 });
  });

  it("입력 불변(원본 맵 미변경)", () => {
    const src = { v2_rough_ore: 5, v2_herb: 5 };
    consumeIngredients(src, RECIPE);
    expect(src).toEqual({ v2_rough_ore: 5, v2_herb: 5 });
  });

  it("같은 id 여러 줄도 누적 차감", () => {
    const dup: V2Recipe = {
      result: "v2_iron_sword",
      ingredients: [
        { id: "v2_herb", count: 2 },
        { id: "v2_herb", count: 3 },
      ],
      gold: 0,
    };
    expect(consumeIngredients({ v2_herb: 5, v2_rough_ore: 1 }, dup)).toEqual({
      v2_rough_ore: 1,
    });
  });
});

describe("salvageYield (분해 환수)", () => {
  it("재료별 floor(count × 0.5), 0 은 생략", () => {
    expect(salvageYield(RECIPE)).toEqual({ v2_rough_ore: 1, v2_herb: 1 });
  });

  it("count 1 재료는 환수 0(생략)", () => {
    const steel: V2Recipe = {
      result: "v2_steel_sword",
      ingredients: [
        { id: "v2_rough_ore", count: 3 },
        { id: "v2_steel_ingot", count: 1 },
        { id: "v2_slime_shard", count: 2 },
      ],
      gold: 0,
    };
    const y = salvageYield(steel);
    expect(y.v2_steel_ingot).toBeUndefined();
    expect(y.v2_rough_ore).toBe(1);
    expect(y.v2_slime_shard).toBe(1);
  });
});
