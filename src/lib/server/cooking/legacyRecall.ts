import "server-only";

import type { FarmItemId } from "@/adventure/v2/farm";
import type { FishingCatchItemId } from "@/adventure/v2/fishingStock";
import { LEGACY_COOKING_RECIPE_COSTS } from "./legacyRecipes";

export type LegacyCookingRefund = {
  farm: Partial<Record<FarmItemId, number>>;
  fishing: Partial<Record<FishingCatchItemId, number>>;
  recalledFoods: number;
};

type ParsedLegacyFoodId = {
  recipeId: string;
  usedRare: boolean;
};

export function parseLegacyCookingFoodId(raw: unknown): ParsedLegacyFoodId | null {
  if (typeof raw !== "string") return null;
  const [prefix, recipeId, quality, rare, duration, extra] = raw.split(":");
  const recipe = LEGACY_COOKING_RECIPE_COSTS[recipeId];
  if (
    prefix !== "food" ||
    extra !== undefined ||
    !recipe ||
    (quality !== "normal" && quality !== "careful" && quality !== "masterpiece") ||
    (rare !== "base" && rare !== "rare") ||
    (duration !== "standard" && duration !== "extended") ||
    (rare === "rare" && !recipe.rare)
  ) {
    return null;
  }
  return { recipeId, usedRare: rare === "rare" };
}

function add<K extends string>(
  target: Partial<Record<K, number>>,
  key: K,
  count: number,
): void {
  target[key] = (target[key] ?? 0) + count;
}

export function legacyCookingRefund(
  ...foodInventories: readonly unknown[]
): LegacyCookingRefund {
  const farmTotals: Partial<Record<FarmItemId, number>> = {};
  const fishingTotals: Partial<Record<FishingCatchItemId, number>> = {};
  let recalledFoods = 0;
  for (const raw of foodInventories) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    for (const [foodId, rawCount] of Object.entries(raw)) {
      const food = parseLegacyCookingFoodId(foodId);
      const count = Math.max(0, Math.floor(Number(rawCount) || 0));
      if (!food || count < 1) continue;
      const recipe = LEGACY_COOKING_RECIPE_COSTS[food.recipeId];
      recalledFoods += count;
      for (const [id, perDish] of Object.entries(recipe.farm)) {
        add(farmTotals, id as FarmItemId, (perDish ?? 0) * count);
      }
      for (const [id, perDish] of Object.entries(recipe.fishing ?? {})) {
        add(fishingTotals, id as FishingCatchItemId, (perDish ?? 0) * count);
      }
      if (food.usedRare && recipe.rare) add(farmTotals, recipe.rare, count);
    }
  }
  const farm = Object.fromEntries(
    Object.entries(farmTotals).flatMap(([id, total]) => {
      const refund = Math.floor((total ?? 0) * 0.5);
      return refund > 0 ? [[id, refund]] : [];
    }),
  ) as LegacyCookingRefund["farm"];
  const fishing = Object.fromEntries(
    Object.entries(fishingTotals).flatMap(([id, total]) => {
      const refund = Math.floor((total ?? 0) * 0.5);
      return refund > 0 ? [[id, refund]] : [];
    }),
  ) as LegacyCookingRefund["fishing"];
  return { farm, fishing, recalledFoods };
}
