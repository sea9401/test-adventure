import type { EquippedCookingBonuses } from "@/adventure/data/v2/v2Skills";
import type { FarmItemDefinition, FarmItemInventory } from "../farm";
import type { FishingCatchItem, FishingCatchItemId } from "../fishingStock";
import type { CookingDeliveryRequest } from "./delivery";
import type { CookingFoodInventory } from "./food";
import type { CookingPantryItem, CookingProcessingRecipe } from "./kitchen";
import type { CookingStateV2 } from "./state";
import type {
  CookingIngredientId,
  CookingMethod,
  CookingRecipePublic,
  CookingRecipeSecret,
} from "./types";

export type CookingFirstDiscoveryView = {
  recipeId: string;
  actorName: string;
  discoveredAt: number;
  mine: boolean;
};

export type CookingFailedResearchView = {
  method: CookingMethod;
  ingredientIds: CookingIngredientId[];
  createdAt: number;
};

export type CookingResponse = {
  ok: boolean;
  now: number;
  cooking: CookingStateV2;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number | null;
  recipes: CookingRecipePublic[];
  knownRecipes: CookingRecipeSecret[];
  firstDiscoveries: CookingFirstDiscoveryView[];
  failedResearches: CookingFailedResearchView[];
  requests: { daily: CookingDeliveryRequest[]; weekly: CookingDeliveryRequest };
  cookingFoods: CookingFoodInventory;
  failedCookingDishes: number;
  cookingPrepSets: number;
  farmItems: FarmItemInventory;
  farmItemDefinitions: Record<string, FarmItemDefinition>;
  farmReputation: number;
  fishingItems: Partial<Record<FishingCatchItemId, number>>;
  fishingItemDefinitions: Record<string, FishingCatchItem>;
  kitchenItems: CookingStateV2["kitchenItems"];
  pantryItems: CookingPantryItem[];
  processingRecipes: CookingProcessingRecipe[];
  cookingJobId: string | null;
  cookingJobName: string | null;
  cookingJobTier: number;
  cookingSkillBonuses: EquippedCookingBonuses;
  result?: Record<string, unknown>;
};

export type CookingMutationResult = { error: string } | undefined;

export type CookingMutation = (
  body: Record<string, unknown>,
) => Promise<CookingMutationResult>;
