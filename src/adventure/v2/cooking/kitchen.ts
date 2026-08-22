import type { FarmItemId, FarmItemInventory } from "../farm";
import { spendGold } from "../../data/v2/coreLoopConfig";
import type { CookingKitchenItemId, CookingStateV2 } from "./state";

export type CookingPantryItem = {
  id: Extract<CookingKitchenItemId, `pantry:${string}`>;
  name: string;
  icon: string;
  price: number;
};

export type CookingProcessingRecipe = {
  outputId: Extract<CookingKitchenItemId, `processed:${string}`>;
  name: string;
  icon: string;
  farmIngredients: Partial<Record<FarmItemId, number>>;
};

export const COOKING_PANTRY_ITEMS: readonly CookingPantryItem[] = [
  { id: "pantry:salt", name: "소금", icon: "🧂", price: 50 },
  { id: "pantry:pepper", name: "후추", icon: "⚫", price: 80 },
  { id: "pantry:oil", name: "조리용 기름", icon: "🫙", price: 100 },
  { id: "pantry:vinegar", name: "숙성 식초", icon: "🍶", price: 120 },
  { id: "pantry:spice", name: "향신료", icon: "🌶️", price: 180 },
  { id: "pantry:yeast", name: "효모", icon: "🫧", price: 150 },
];

export const COOKING_PROCESSING_RECIPES: readonly CookingProcessingRecipe[] = [
  { outputId: "processed:flour", name: "밀가루", icon: "🥣", farmIngredients: { wheat: 3 } },
  { outputId: "processed:butter", name: "버터", icon: "🧈", farmIngredients: { milk: 3 } },
  { outputId: "processed:cheese", name: "치즈", icon: "🧀", farmIngredients: { milk: 4 } },
  { outputId: "processed:broth", name: "진한 육수", icon: "🍲", farmIngredients: { pork: 2, onion: 2 } },
  { outputId: "processed:sauce", name: "만능 소스", icon: "🥫", farmIngredients: { tomato: 2, soybean: 2 } },
  { outputId: "processed:cream", name: "생크림", icon: "🍦", farmIngredients: { milk: 3, sugarcane: 1 } },
];

export const COOKING_PANTRY_BY_ID = new Map(
  COOKING_PANTRY_ITEMS.map((entry) => [entry.id, entry]),
);
export const COOKING_PROCESSING_BY_ID = new Map(
  COOKING_PROCESSING_RECIPES.map((entry) => [entry.outputId, entry]),
);

function positiveQuantity(raw: number): number {
  const quantity = Math.floor(Number(raw) || 0);
  if (quantity < 1 || quantity > 100) throw new Error("invalid_quantity");
  return quantity;
}

export function buyCookingPantryItem(
  current: {
    gold: number;
    bankedGold: number;
    kitchenItems: CookingStateV2["kitchenItems"];
  },
  itemId: CookingPantryItem["id"],
  rawQuantity: number,
): {
  gold: number;
  bankedGold: number;
  kitchenItems: CookingStateV2["kitchenItems"];
} {
  const item = COOKING_PANTRY_BY_ID.get(itemId);
  if (!item) throw new Error("invalid_pantry_item");
  const quantity = positiveQuantity(rawQuantity);
  const total = item.price * quantity;
  const payment = spendGold(current.gold, current.bankedGold, total);
  if (!payment.ok) throw new Error("not_enough_gold");
  return {
    gold: payment.gold,
    bankedGold: payment.bankedGold,
    kitchenItems: {
      ...current.kitchenItems,
      [item.id]: (current.kitchenItems[item.id] ?? 0) + quantity,
    },
  };
}

export function processCookingIngredient(
  current: {
    farmItems: FarmItemInventory;
    kitchenItems: CookingStateV2["kitchenItems"];
  },
  outputId: CookingProcessingRecipe["outputId"],
  rawQuantity: number,
): {
  farmItems: FarmItemInventory;
  kitchenItems: CookingStateV2["kitchenItems"];
} {
  const recipe = COOKING_PROCESSING_BY_ID.get(outputId);
  if (!recipe) throw new Error("invalid_processing_recipe");
  const quantity = positiveQuantity(rawQuantity);
  const farmItems = { ...current.farmItems };
  for (const [itemId, count] of Object.entries(recipe.farmIngredients)) {
    if ((farmItems[itemId as FarmItemId] ?? 0) < Number(count) * quantity) {
      throw new Error("not_enough_farm_items");
    }
  }
  for (const [itemId, count] of Object.entries(recipe.farmIngredients)) {
    const id = itemId as FarmItemId;
    const next = (farmItems[id] ?? 0) - Number(count) * quantity;
    if (next > 0) farmItems[id] = next;
    else delete farmItems[id];
  }
  return {
    farmItems,
    kitchenItems: {
      ...current.kitchenItems,
      [recipe.outputId]: (current.kitchenItems[recipe.outputId] ?? 0) + quantity,
    },
  };
}
