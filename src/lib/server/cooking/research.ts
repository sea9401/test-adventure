import "server-only";

import { createHash } from "node:crypto";
import { FARM_ITEMS } from "@/adventure/v2/farm";
import { FISHING_CATCH_ITEMS } from "@/adventure/v2/fishingStock";
import {
  cookingLevelForXp,
  type CookingKitchenItemId,
  type CookingStateV2,
} from "@/adventure/v2/cooking/state";
import {
  COOKING_METHOD_UNLOCK_LEVEL,
  type CookingIngredientId,
  type CookingMethod,
  type CookingRecipeSecret,
} from "@/adventure/v2/cooking/types";
import {
  canonicalCookingCombination,
  findSecretRecipe,
} from "./recipes";

export type CookingIngredientBalances = {
  farm: Record<string, number>;
  fishing: Record<string, number>;
  kitchen: Record<string, number>;
};

export type CookingResearchResult = {
  kind: "success" | "failure";
  recipe: CookingRecipeSecret | null;
  state: CookingStateV2;
  balances: CookingIngredientBalances;
  comboHash: string;
  failedDishCount: number;
};

const KITCHEN_ITEM_IDS = new Set<CookingKitchenItemId>([
  "pantry:salt",
  "pantry:pepper",
  "pantry:oil",
  "pantry:vinegar",
  "pantry:spice",
  "pantry:yeast",
  "processed:flour",
  "processed:butter",
  "processed:cheese",
  "processed:broth",
  "processed:sauce",
  "processed:cream",
]);

export function researchSlotLimitForLevel(level: number): 2 | 3 | 4 | 5 {
  if (level >= 35) return 5;
  if (level >= 20) return 4;
  if (level >= 10) return 3;
  return 2;
}

export function cookingCombinationHash(
  method: CookingMethod,
  ingredientIds: readonly CookingIngredientId[],
): string {
  const canonical = canonicalCookingCombination(method, ingredientIds);
  if (!canonical) throw new Error("invalid_combination");
  return createHash("sha256").update(canonical).digest("hex");
}

function isKnownIngredient(id: CookingIngredientId): boolean {
  const [kind, itemId, extra] = id.split(":");
  if (!itemId || extra !== undefined) return false;
  if (kind === "farm") return Object.hasOwn(FARM_ITEMS, itemId);
  if (kind === "fishing") return Object.hasOwn(FISHING_CATCH_ITEMS, itemId);
  return KITCHEN_ITEM_IDS.has(id as CookingKitchenItemId);
}

function consumeResearchIngredients(
  balances: CookingIngredientBalances,
  ingredientIds: readonly CookingIngredientId[],
): CookingIngredientBalances {
  const next: CookingIngredientBalances = {
    farm: { ...balances.farm },
    fishing: { ...balances.fishing },
    kitchen: { ...balances.kitchen },
  };
  for (const id of ingredientIds) {
    const [kind, itemId] = id.split(":");
    const bucket = kind === "farm"
      ? next.farm
      : kind === "fishing"
        ? next.fishing
        : next.kitchen;
    const key = kind === "farm" || kind === "fishing" ? itemId : id;
    const held = Math.max(0, Math.floor(Number(bucket[key]) || 0));
    if (held < 1) throw new Error("not_enough_ingredients");
    if (held === 1) delete bucket[key];
    else bucket[key] = held - 1;
  }
  return next;
}

export function resolveCookingResearch(args: {
  state: CookingStateV2;
  method: CookingMethod;
  ingredientIds: readonly CookingIngredientId[];
  balances: CookingIngredientBalances;
  failedBefore: boolean;
}): CookingResearchResult {
  if (!Object.hasOwn(COOKING_METHOD_UNLOCK_LEVEL, args.method)) {
    throw new Error("invalid_method");
  }
  const level = cookingLevelForXp(args.state.xp);
  if (level < COOKING_METHOD_UNLOCK_LEVEL[args.method]) {
    throw new Error("method_locked");
  }
  if (args.ingredientIds.length < 2) throw new Error("too_few_ingredients");
  if (args.ingredientIds.length > researchSlotLimitForLevel(level)) {
    throw new Error("too_many_ingredients");
  }
  if (!args.ingredientIds.every(isKnownIngredient)) {
    throw new Error("invalid_ingredient");
  }
  const comboHash = cookingCombinationHash(args.method, args.ingredientIds);
  if (args.failedBefore) throw new Error("duplicate_combination");
  const recipe = findSecretRecipe(args.method, args.ingredientIds);
  if (recipe && args.state.discoveredRecipeIds.includes(recipe.id)) {
    throw new Error("recipe_already_known");
  }
  if (recipe && level < recipe.requiredLevel) throw new Error("recipe_locked");
  const balances = consumeResearchIngredients(args.balances, args.ingredientIds);
  if (!recipe || recipe.discovery === "basic") {
    return {
      kind: "failure",
      recipe: null,
      balances,
      comboHash,
      failedDishCount: 1,
      state: {
        ...args.state,
        xp: args.state.xp + args.ingredientIds.length * 2,
        stats: {
          ...args.state.stats,
          researchFailures: args.state.stats.researchFailures + 1,
        },
      },
    };
  }
  const specialty = args.state.specialty && args.state.specialty.field === recipe.field
    ? {
        ...args.state.specialty,
        xp: args.state.specialty.xp + recipe.tier * 50,
      }
    : args.state.specialty;
  return {
    kind: "success",
    recipe,
    balances,
    comboHash,
    failedDishCount: 0,
    state: {
      ...args.state,
      xp: args.state.xp + recipe.researchXp,
      discoveredRecipeIds: [...args.state.discoveredRecipeIds, recipe.id],
      researchScore: args.state.researchScore + recipe.tier * 10,
      specialty,
      stats: {
        ...args.state.stats,
        researchSuccesses: args.state.stats.researchSuccesses + 1,
      },
    },
  };
}
