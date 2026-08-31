import {
  FARM_CROP_LIST,
  FARM_ITEMS,
  type FarmCropId,
} from "@/adventure/v2/farm";
import {
  COOKING_FARM_INGREDIENT_IDS,
  type CookingFarmIngredientId,
} from "@/adventure/v2/cooking/researchIngredients";
import {
  FISHING_CATCH_ITEM_LIST,
  type FishingCatchItemId,
} from "@/adventure/v2/fishingStock";
import {
  COOKING_PANTRY_ITEMS,
  COOKING_PROCESSING_RECIPES,
} from "@/adventure/v2/cooking/kitchen";
import type { CookingKitchenItemId } from "@/adventure/v2/cooking/state";

export type MarketplaceLifeItemId =
  | `farm_seed:${FarmCropId}`
  | `farm_item:${CookingFarmIngredientId}`
  | `fishing_catch:${FishingCatchItemId}`
  | `cooking_kitchen:${CookingKitchenItemId}`;

export type MarketplaceLifeItemDefinition = {
  id: MarketplaceLifeItemId;
  name: string;
  source: "farm_seed" | "farm_item" | "fishing_catch" | "cooking_kitchen";
  sourceItemId: string;
};

const DEFINITIONS: readonly MarketplaceLifeItemDefinition[] = [
  ...FARM_CROP_LIST.map((crop) => ({
    id: `farm_seed:${crop.id}` as const,
    name: crop.seedName,
    source: "farm_seed" as const,
    sourceItemId: crop.id,
  })),
  ...COOKING_FARM_INGREDIENT_IDS.map((itemId) => ({
    id: `farm_item:${itemId}` as const,
    name: FARM_ITEMS[itemId].name,
    source: "farm_item" as const,
    sourceItemId: itemId,
  })),
  ...FISHING_CATCH_ITEM_LIST.map((item) => ({
    id: `fishing_catch:${item.id}` as const,
    name: item.name,
    source: "fishing_catch" as const,
    sourceItemId: item.id,
  })),
  ...COOKING_PANTRY_ITEMS.map((item) => ({
    id: `cooking_kitchen:${item.id}` as const,
    name: item.name,
    source: "cooking_kitchen" as const,
    sourceItemId: item.id,
  })),
  ...COOKING_PROCESSING_RECIPES.map((recipe) => ({
    id: `cooking_kitchen:${recipe.outputId}` as const,
    name: recipe.name,
    source: "cooking_kitchen" as const,
    sourceItemId: recipe.outputId,
  })),
];

const DEFINITION_BY_ID = new Map(
  DEFINITIONS.map((definition) => [definition.id, definition]),
);

export const MARKETPLACE_LIFE_ITEM_IDS = Object.freeze(
  DEFINITIONS.map((definition) => definition.id),
);

export function marketplaceLifeItemDefinition(
  value: unknown,
): MarketplaceLifeItemDefinition | null {
  return typeof value === "string" ? (DEFINITION_BY_ID.get(value as MarketplaceLifeItemId) ?? null) : null;
}

export function isMarketplaceLifeItemId(
  value: unknown,
): value is MarketplaceLifeItemId {
  return marketplaceLifeItemDefinition(value) !== null;
}
