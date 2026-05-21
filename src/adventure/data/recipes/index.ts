export * from "./types";

import { ITEMS, type EquipItem, type ItemId } from "../items";
import {
  applyCraftTier,
  type CraftedEquipItem,
  type CraftTier,
} from "../craftQuality";
import type { Recipe } from "./types";
import { HOMELAND_RECIPES } from "./homeland";
import { UNBONG_RECIPES } from "./unbong";
import { PHOENIX_RECIPES } from "./phoenix";
import { SPIRE_RECIPES } from "./spire";
import { CORRIDOR_RECIPES } from "./corridor";
import { AETHER_RECIPES } from "./aether";
import { ROAD_RECIPES } from "./road";
import { THRONE_RECIPES } from "./throne";
import { STARLIT_RECIPES } from "./starlit";
import { MIDGAME_RECIPES } from "./midgame";
import { COAST_RECIPES } from "./coast";
import { WESTERN_RECIPES } from "./western";
import { DRAGONSCALE_RECIPES } from "./dragonscale";

export const RECIPES: Recipe[] = [
  ...HOMELAND_RECIPES,
  ...UNBONG_RECIPES,
  ...PHOENIX_RECIPES,
  ...SPIRE_RECIPES,
  ...CORRIDOR_RECIPES,
  ...AETHER_RECIPES,
  ...ROAD_RECIPES,
  ...THRONE_RECIPES,
  ...STARLIT_RECIPES,
  ...MIDGAME_RECIPES,
  ...COAST_RECIPES,
  ...WESTERN_RECIPES,
  ...DRAGONSCALE_RECIPES,
];

export function getRecipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

// 결과가 그 장비인 레시피 — 제작산 등급 인스턴스를 EquipItem 으로 재구성할 때 variance 조회.
const RECIPE_BY_RESULT_ITEM: Map<ItemId, Recipe> = new Map();
for (const r of RECIPES) {
  if (r.result.kind === "equipment") RECIPE_BY_RESULT_ITEM.set(r.result.itemId, r);
}


// 제작산 등급 인스턴스(itemId + 등급) → 등급 반영된 EquipItem(+ craftTier 마커).
// 레시피가 없거나 변동 정의가 없으면 베이스 그대로(+ 마커).
export function resolveCraftedItem(
  itemId: ItemId,
  tier: CraftTier,
): CraftedEquipItem {
  const base: EquipItem = ITEMS[itemId];
  return applyCraftTier(base, RECIPE_BY_RESULT_ITEM.get(itemId) ?? {}, tier);
}

