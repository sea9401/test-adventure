import type { EquippedCookingBonuses } from "@/adventure/data/v2/v2Skills";
import type { FarmItemDefinition, FarmItemInventory } from "../farm";
import type { FishingCatchItem, FishingCatchItemId } from "../fishingStock";
import type { CookingBranchId } from "./branch";
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
  codexRegistered: boolean;
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
  failedResearchKeys: string[];
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
  branch: CookingBranchView;
  signature: {
    unlocked: boolean;
    /** 요리의 전공 역할 — 잠긴 이유 안내용. */
    role: "major" | "minor" | null;
    stage: number;
    requiredStage: number;
    products: { crop: number; catch: number };
  };
};

export type CookingBranchView = {
  /** 전문 분야 랭크 5 여서 특화를 고를 수 있는지. */
  eligible: boolean;
  current: CookingBranchId | null;
  /** 지금 고른 특화의 랭크. 고르지 않았으면 0. */
  rank: number;
  xp: number;
  nextRankXp: number | null;
  xpByBranch: Partial<Record<CookingBranchId, number>>;
  /** 특화를 다시 바꿀 수 있는 시각. 지금 바꿀 수 있으면 null. */
  nextChangeAt: number | null;
  masterpieceBonusPct: number;
};

export type CookingMutationResult = { error: string } | undefined;

export type CookingMutation = (
  body: Record<string, unknown>,
) => Promise<CookingMutationResult>;
