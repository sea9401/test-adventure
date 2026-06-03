import { describe, expect, it } from "vitest";
import {
  V2_RECIPES,
  consumeIngredients,
  craftShortfall,
  recipeFor,
  salvageYield,
  type V2Recipe,
} from "./v2Recipes";
import { V2_EQUIPMENT } from "./v2Equipment";
import { V2_MATERIALS } from "./dungeonDrops";

// 2026-06-03: 제작 재설계 — 들판 제작 전용 7종만 등재(무기/목걸이 4 + 들가죽 세트 3).

const FIELD_CRAFT_IDS = [
  "v2_meadow_bow",
  "v2_spider_venom_dagger",
  "v2_wolffang_staff",
  "v2_fang_necklace",
  "v2_field_leather_armor",
  "v2_field_leather_gloves",
  "v2_field_leather_boots",
] as const;

// 들개 우두머리(필드 보스) 제작 — 우두머리의 송곳니로 제작하는 craftOnly 장비.
const BOSS_CRAFT_IDS = [
  "v2_alpha_fang_dagger",
  "v2_alpha_hide_armor",
  "v2_alpha_hide_gloves",
] as const;

const ALL_CRAFT_IDS = [...FIELD_CRAFT_IDS, ...BOSS_CRAFT_IDS];

describe("V2_RECIPES — 제작 10종 (들판 7 + 들개 우두머리 3)", () => {
  it("레시피 10종, result==key, 대상은 전부 craftOnly 장비", () => {
    expect(Object.keys(V2_RECIPES).sort()).toEqual([...ALL_CRAFT_IDS].sort());
    for (const id of ALL_CRAFT_IDS) {
      const r = recipeFor(id);
      expect(r, id).toBeDefined();
      expect(r!.result).toBe(id);
      expect(V2_EQUIPMENT[id].craftOnly, `${id} craftOnly`).toBe(true);
    }
  });

  it("레시피 재료 id 가 전부 V2_MATERIALS 에 존재 + 수량>0 + 골드>0", () => {
    for (const id of ALL_CRAFT_IDS) {
      const r = V2_RECIPES[id]!;
      expect(r.gold, id).toBeGreaterThan(0);
      expect(r.ingredients.length, id).toBeGreaterThan(0);
      for (const ing of r.ingredients) {
        expect(V2_MATERIALS[ing.id], `${id} → ${ing.id}`).toBeDefined();
        expect(ing.count, `${id} → ${ing.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("희귀 재료(fang/venom)는 단검·지팡이·목걸이만 + 수량 ≤ 2", () => {
    const RARE = new Set(["v2_field_fang", "v2_field_venom"]);
    const RARE_ITEMS = new Set([
      "v2_spider_venom_dagger",
      "v2_wolffang_staff",
      "v2_fang_necklace",
    ]);
    for (const id of ALL_CRAFT_IDS) {
      for (const ing of V2_RECIPES[id]!.ingredients) {
        if (!RARE.has(ing.id)) continue;
        expect(RARE_ITEMS.has(id), `${id} 가 희귀재료 사용`).toBe(true);
        expect(ing.count, `${id} → ${ing.id} 수량`).toBeLessThanOrEqual(2);
      }
    }
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
