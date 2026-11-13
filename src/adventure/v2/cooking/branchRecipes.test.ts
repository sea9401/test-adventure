import { describe, expect, it } from "vitest";
import { FARM_CROPS, FARM_ITEMS } from "../farm";
import { FISHING_CATCH_ITEMS } from "../fishingStock";
import { COOKING_BRANCHES, COOKING_BRANCH_BY_ID, cookingBranchCovers } from "./branch";
import {
  COOKING_BRANCH_RECIPES,
  COOKING_BRANCH_RECIPE_BY_ID,
  cookingBranchRecipesFor,
} from "./branchRecipes";
import { COOKING_PUBLIC_RECIPES, COOKING_PUBLIC_RECIPE_BY_ID } from "./catalog";
import { cookingFoodDefinition } from "./food";
import { COOKING_PANTRY_ITEMS, COOKING_PROCESSING_RECIPES } from "./kitchen";
import type { CookingEffect } from "./types";

const RARE_IDS = new Set(Object.values(FARM_CROPS).map((crop) => `farm:${crop.rareItemId}`));
const KITCHEN_IDS = new Set<string>([
  ...COOKING_PANTRY_ITEMS.map((item) => item.id),
  ...COOKING_PROCESSING_RECIPES.map((item) => item.outputId),
]);

// 설계 문서 5절 효과 표. [랭크 1, 랭크 3, 랭크 5]
const EFFECTS: Record<string, [CookingEffect, CookingEffect, CookingEffect]> = {
  hearth_grill: [
    { combatFlat: { atk: 160, accuracy: 25 } },
    { combatFlat: { atk: 220, accuracy: 50 } },
    { combatFlat: { atk: 300, accuracy: 80 } },
  ],
  hearth_fry: [
    { combatFlat: { accuracy: 160 }, primaryFlat: { dex: 6 } },
    { combatFlat: { accuracy: 220 }, primaryFlat: { dex: 10 } },
    { combatFlat: { accuracy: 300 }, primaryFlat: { dex: 16 } },
  ],
  hearth_stir: [
    { primaryFlat: { str: 16, dex: 6 } },
    { primaryFlat: { str: 24, dex: 10 } },
    { primaryFlat: { str: 32, dex: 16 } },
  ],
  pot_soup: [
    { combatFlat: { maxHp: 1_200, def: 50 } },
    { combatFlat: { maxHp: 2_000, def: 100 } },
    { combatFlat: { maxHp: 3_000, def: 160 } },
  ],
  pot_steam: [
    { combatFlat: { def: 160, magicDef: 50 } },
    { combatFlat: { def: 220, magicDef: 100 } },
    { combatFlat: { def: 300, magicDef: 160 } },
  ],
  baking_pastry: [
    { combatFlat: { magicAtk: 160, accuracy: 25 } },
    { combatFlat: { magicAtk: 220, accuracy: 50 } },
    { combatFlat: { magicAtk: 300, accuracy: 80 } },
  ],
  baking_bread: [
    { combatFlat: { maxMp: 400 }, primaryFlat: { int: 6 } },
    { combatFlat: { maxMp: 670 }, primaryFlat: { int: 10 } },
    { combatFlat: { maxMp: 1_000 }, primaryFlat: { int: 16 } },
  ],
  baking_steamed: [
    { huntGoldPct: 10, primaryFlat: { luk: 6 } },
    { huntGoldPct: 12, primaryFlat: { luk: 10 } },
    { huntGoldPct: 15, primaryFlat: { luk: 16 } },
  ],
  seafood_fire: [
    { combatFlat: { atk: 80, magicAtk: 80 }, primaryFlat: { dex: 6 } },
    { combatFlat: { atk: 110, magicAtk: 110 }, primaryFlat: { dex: 10 } },
    { combatFlat: { atk: 150, magicAtk: 150 }, primaryFlat: { dex: 16 } },
  ],
  seafood_stew: [
    { huntExpPct: 10, combatFlat: { maxHp: 300 } },
    { huntExpPct: 12, combatFlat: { maxHp: 700 } },
    { huntExpPct: 15, combatFlat: { maxHp: 1_200 } },
  ],
  seafood_pickle: [
    { combatFlat: { accuracy: 160, magicAtk: 50 } },
    { combatFlat: { accuracy: 220, magicAtk: 100 } },
    { combatFlat: { accuracy: 300, magicAtk: 160 } },
  ],
  medicinal_tea: [
    { primaryFlat: { spi: 16 }, combatFlat: { magicDef: 50 } },
    { primaryFlat: { spi: 24 }, combatFlat: { magicDef: 100 } },
    { primaryFlat: { spi: 32 }, combatFlat: { magicDef: 160 } },
  ],
  medicinal_ferment: [
    { combatFlat: { magicDef: 160, maxHp: 300 } },
    { combatFlat: { magicDef: 220, maxHp: 700 } },
    { combatFlat: { magicDef: 300, maxHp: 1_200 } },
  ],
  medicinal_meal: [
    { primaryFlat: { int: 16, spi: 6 } },
    { primaryFlat: { int: 24, spi: 10 } },
    { primaryFlat: { int: 32, spi: 16 } },
  ],
};

describe("요리 특화 전용 요리", () => {
  it("특화마다 랭크 1·3·5 요리가 하나씩 있다", () => {
    expect(COOKING_BRANCH_RECIPES).toHaveLength(42);
    expect(COOKING_BRANCH_RECIPE_BY_ID.size).toBe(42);
    for (const branch of COOKING_BRANCHES) {
      const dishes = cookingBranchRecipesFor(branch.id);
      expect(dishes.map((dish) => dish.requiredRank)).toEqual([1, 3, 5]);
      expect(dishes.map((dish) => dish.tier)).toEqual([3, 4, 5]);
      expect(dishes.map((dish) => dish.id)).toEqual([
        `branch_${branch.id}_1`,
        `branch_${branch.id}_2`,
        `branch_${branch.id}_3`,
      ]);
    }
  });

  it("공통 필드", () => {
    for (const dish of COOKING_BRANCH_RECIPES) {
      const branch = COOKING_BRANCH_BY_ID.get(dish.branchId)!;
      expect(dish.field).toBe(branch.field);
      expect(cookingBranchCovers(branch, dish)).toBe(true);
      expect(dish.discovery).toBe("branch");
      expect(dish.requiredLevel).toBe(20);
      expect(dish.imageSrc).toBe(`/images/items/cooking/${dish.id}.webp`);
      expect(dish.craftXp).toBe(dish.tier * 20);
      expect(dish.researchXp).toBe(0);
      expect(dish.effectTags.length).toBeGreaterThan(0);
      expect(dish.name.length).toBeGreaterThan(0);
      expect(dish.description).toContain(branch.name);
      expect(dish.icon.length).toBeGreaterThan(0);
    }
  });

  it("id 와 이름이 기존 요리와 겹치지 않는다", () => {
    const existingIds = new Set(COOKING_PUBLIC_RECIPES.map((recipe) => recipe.id));
    const existingNames = new Set(COOKING_PUBLIC_RECIPES.map((recipe) => recipe.name));
    const names = COOKING_BRANCH_RECIPES.map((dish) => dish.name);
    expect(new Set(names).size).toBe(42);
    expect(COOKING_BRANCH_RECIPES.filter((dish) => existingIds.has(dish.id))).toEqual([]);
    expect(names.filter((name) => existingNames.has(name))).toEqual([]);
  });

  it("효과가 설계 표와 같다", () => {
    for (const branch of COOKING_BRANCHES) {
      expect(cookingBranchRecipesFor(branch.id).map((dish) => dish.effect)).toEqual(
        EFFECTS[branch.id],
      );
    }
  });

  it("재료 칸 수와 수량 규칙", () => {
    for (const dish of COOKING_BRANCH_RECIPES) {
      const step = dish.requiredRank === 1 ? 0 : dish.requiredRank === 3 ? 1 : 2;
      expect(dish.ingredients).toHaveLength([4, 5, 5][step]);
      expect(new Set(dish.ingredients.map((entry) => entry.id)).size).toBe(dish.ingredients.length);
      const rare = dish.ingredients.filter((entry) => RARE_IDS.has(entry.id));
      expect(rare).toHaveLength(step === 2 ? 1 : 0);
      for (const entry of dish.ingredients) {
        const [kind, shortId] = entry.id.split(":");
        if (RARE_IDS.has(entry.id)) {
          expect(entry.count).toBe(2);
        } else if (kind === "farm") {
          expect(Object.hasOwn(FARM_ITEMS, shortId)).toBe(true);
          expect(entry.count).toBe([12, 15, 18][step]);
        } else if (kind === "fishing") {
          expect(Object.hasOwn(FISHING_CATCH_ITEMS, shortId)).toBe(true);
          expect(entry.count).toBe([3, 3, 6][step]);
        } else {
          expect(KITCHEN_IDS.has(entry.id)).toBe(true);
          expect(entry.count).toBe([3, 6, 6][step]);
        }
      }
    }
  });

  it("해산물 특화 요리에는 어획물이 들어간다", () => {
    for (const dish of COOKING_BRANCH_RECIPES.filter((entry) => entry.field === "seafood")) {
      expect(dish.ingredients.some((entry) => entry.id.startsWith("fishing:"))).toBe(true);
    }
  });

  it("설계 표의 이름과 재료 일부", () => {
    const dish = (id: string) => COOKING_BRANCH_RECIPE_BY_ID.get(id)!;
    expect(dish("branch_hearth_grill_1")).toMatchObject({
      name: "장작 돼지 통구이",
      method: "grill",
      ingredients: [
        { id: "farm:pork", count: 12 },
        { id: "farm:onion", count: 12 },
        { id: "farm:herb", count: 12 },
        { id: "pantry:salt", count: 3 },
      ],
    });
    expect(dish("branch_baking_bread_3")).toMatchObject({
      name: "제빵장의 황금 밀 브리오슈",
      method: "ferment",
      ingredients: [
        { id: "farm:wheat", count: 18 },
        { id: "farm:egg", count: 18 },
        { id: "farm:milk", count: 18 },
        { id: "processed:butter", count: 6 },
        { id: "farm:golden_wheat", count: 2 },
      ],
    });
    expect(dish("branch_seafood_stew_3")).toMatchObject({
      name: "항구 잔칫날 해물찜",
      method: "steam",
      ingredients: [
        { id: "fishing:catch_quality", count: 6 },
        { id: "farm:rice", count: 18 },
        { id: "farm:soybean", count: 18 },
        { id: "processed:broth", count: 6 },
        { id: "farm:silverleaf", count: 2 },
      ],
    });
    expect(dish("branch_medicinal_tea_2").name).toBe("은은한 카카오 약차");
    expect(dish("branch_seafood_fire_2").method).toBe("stir_fry");
    expect(dish("branch_medicinal_meal_2").method).toBe("steam");
  });

  it("조회 맵이 전용 요리를 돌려주고 연구 대상 500종은 그대로다", () => {
    expect(COOKING_PUBLIC_RECIPES).toHaveLength(500);
    expect(COOKING_PUBLIC_RECIPES.some((recipe) => recipe.id.startsWith("branch_"))).toBe(false);
    const found = COOKING_PUBLIC_RECIPE_BY_ID.get("branch_hearth_grill_3");
    expect(found).toMatchObject({ name: "화덕장의 통구이 만찬", tier: 5, discovery: "branch" });
    // 공개 맵에는 재료를 싣지 않는다(기존 요리와 같은 모양).
    expect(found && "ingredients" in found).toBe(false);
  });

  it("전용 요리 음식의 효과를 품질에 맞춰 계산한다", () => {
    expect(
      cookingFoodDefinition("food2:branch_hearth_grill_3:masterpiece:o0:s5")?.effect,
    ).toEqual({ combatFlat: { atk: 375, accuracy: 100 } });
    expect(
      cookingFoodDefinition("food2:branch_hearth_grill_3:normal:o0:s0")?.effect,
    ).toEqual({ combatFlat: { atk: 300, accuracy: 80 } });
    // 사냥 골드는 15% 상한이라 품질로 더 오르지 않는다.
    expect(
      cookingFoodDefinition("food2:branch_baking_steamed_3:masterpiece:o0:s5")?.effect,
    ).toEqual({ huntGoldPct: 15, primaryFlat: { luk: 20 } });
  });
});
