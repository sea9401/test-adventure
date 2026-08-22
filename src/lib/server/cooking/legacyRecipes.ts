import "server-only";

import { createRequire } from "node:module";
import type { FarmItemId } from "@/adventure/v2/farm";
import type { FishingCatchItemId } from "@/adventure/v2/fishingStock";

export type LegacyCookingRecipeCost = {
  farm: Partial<Record<FarmItemId, number>>;
  fishing?: Partial<Record<FishingCatchItemId, number>>;
  rare?: FarmItemId;
};

/** 개편 시 회수 계산만을 위한 2026-08-22 직전 레시피 비용 스냅샷. */
const require = createRequire(import.meta.url);
const rawCosts: unknown = require("./legacy-recipes.json");
export const LEGACY_COOKING_RECIPE_COSTS = rawCosts as Record<
  string,
  LegacyCookingRecipeCost
>;
