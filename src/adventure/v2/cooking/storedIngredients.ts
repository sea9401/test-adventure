import type { FishingCatchItemId } from "../fishingStock";
import { isFishingCatchItemId } from "../fishingStock";
import type { CookingFarmIngredientId } from "./researchIngredients";
import { isCookingFarmIngredientId } from "./researchIngredients";
import { isCookingKitchenItemId } from "./kitchen";
import type { CookingKitchenItemId } from "./state";

export type CookingStoredIngredientId =
  | `farm:${CookingFarmIngredientId}`
  | `fishing:${FishingCatchItemId}`
  | CookingKitchenItemId;

export type CookingStoredIngredient =
  | {
      ingredientId: `farm:${CookingFarmIngredientId}`;
      kind: "farm";
      itemId: CookingFarmIngredientId;
    }
  | {
      ingredientId: `fishing:${FishingCatchItemId}`;
      kind: "fishing";
      itemId: FishingCatchItemId;
    }
  | {
      ingredientId: CookingKitchenItemId;
      kind: "kitchen";
      itemId: CookingKitchenItemId;
    };

export function parseCookingStoredIngredientId(
  value: unknown,
): CookingStoredIngredient | null {
  if (typeof value !== "string") return null;
  if (isCookingKitchenItemId(value)) {
    return { ingredientId: value, kind: "kitchen", itemId: value };
  }

  const [kind, itemId, extra] = value.split(":");
  if (!itemId || extra !== undefined) return null;
  if (kind === "farm" && isCookingFarmIngredientId(itemId)) {
    return {
      ingredientId: `farm:${itemId}`,
      kind: "farm",
      itemId,
    };
  }
  if (kind === "fishing" && isFishingCatchItemId(itemId)) {
    return {
      ingredientId: `fishing:${itemId}`,
      kind: "fishing",
      itemId,
    };
  }
  return null;
}

export function isCookingStoredIngredientId(
  value: unknown,
): value is CookingStoredIngredientId {
  return parseCookingStoredIngredientId(value) !== null;
}
