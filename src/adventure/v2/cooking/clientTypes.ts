import type { EquippedCookingBonuses } from "@/adventure/data/v2/v2Skills";
import type { FarmItemDefinition, FarmItemInventory } from "../farm";
import type { FishingCatchItem, FishingCatchItemId } from "../fishingStock";
import type { CookingDeliveryRequest } from "./delivery";
import type { CookingFoodDefinitionMap, CookingFoodInventory } from "./foodShared";
import type { CookingPantryItem, CookingProcessingRecipe } from "./kitchen";
import type { CookingStateV2 } from "./state";
import type {
  CookingIngredientId,
  CookingMethod,
  CookingRecipeSecret,
} from "./types";

export type PublicCookingDiscovery = {
  recipeName: string;
  imageSrc: string;
  actorName: string;
  discoveredAt: number;
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
  recipeTotal: number;
  knownRecipes: CookingRecipeSecret[];
  publicDiscoveries: PublicCookingDiscovery[];
  failedResearches: CookingFailedResearchView[];
  requests: { daily: CookingDeliveryRequest[]; weekly: CookingDeliveryRequest };
  cookingFoods: CookingFoodInventory;
  cookingFoodDefinitions: CookingFoodDefinitionMap;
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
