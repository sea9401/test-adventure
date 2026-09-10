import "server-only";

import { db } from "@/db";
import {
  parseEquipmentSave,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { V2_MATERIALS, type V2MaterialId } from "@/adventure/data/v2/dungeonDrops";
import {
  V2_REFORGE_ENABLED,
  isReforgeStoneMaterialId,
} from "@/adventure/data/v2/v2EquipVariance";
import { parseRareMaps, type RareMapInstance } from "@/adventure/data/v2/rareMaps";
import {
  parseMuseunCashItems,
  type MuseunCashItemCounts,
} from "@/adventure/data/v2/museunCashItems";
import {
  cookingFoodDefinitions,
  parseCookingFoodInventory,
} from "@/adventure/v2/cooking/food";
import type {
  CookingFoodDefinitionMap,
  CookingFoodInventory,
} from "@/adventure/v2/cooking/foodShared";
import { FARM_SAVE_KEY } from "@/adventure/v2/farm";
import { FISHING_STOCK_KEY } from "@/adventure/v2/fishingStock";
import { COOKING_SAVE_KEY } from "@/adventure/v2/cooking/state";
import {
  FISH_SPECIMEN_SAVE_KEY,
  parseFishSpecimenInventory,
  type FishSpecimenInventory,
} from "@/adventure/v2/fishSpecimens";
import { marketplaceLifeItemHoldings } from "@/lib/server/marketplaceLifeInventory";
import { readSaves } from "@/lib/server/savesKv";

const SELL_OVERVIEW_FALLBACKS: Record<string, unknown> = {
  "equipment.v2": {},
  "character.v2": {},
  "inventory.v2": {},
  [FARM_SAVE_KEY]: {},
  [FISHING_STOCK_KEY]: {},
  [COOKING_SAVE_KEY]: {},
  [FISH_SPECIMEN_SAVE_KEY]: {},
};

export type MarketplaceSellOverview = {
  owned: V2EquipInstance[];
  equipped: Partial<Record<V2EquipSlot, string>>;
  materials: Partial<Record<V2MaterialId | string, number>>;
  rareMaps: RareMapInstance[];
  cashItems: MuseunCashItemCounts;
  cookingFoods: CookingFoodInventory;
  cookingFoodDefinitions: CookingFoodDefinitionMap;
  specimens: FishSpecimenInventory["items"];
};

export function marketplaceSellOverviewFromSaves(
  saves: Record<string, unknown>,
  now = Date.now(),
): MarketplaceSellOverview {
  const equipment = parseEquipmentSave(saves["equipment.v2"]);
  const character = (saves["character.v2"] ?? {}) as {
    materials?: Record<string, unknown>;
    rareMaps?: unknown;
    cashItems?: unknown;
  };
  const inventory = (saves["inventory.v2"] ?? {}) as {
    cookingFoods?: unknown;
  };

  const rawMaterials =
    character.materials && typeof character.materials === "object"
      ? character.materials
      : {};
  const materials: Record<string, number> = {};
  for (const id of Object.keys(V2_MATERIALS) as V2MaterialId[]) {
    if (!V2_REFORGE_ENABLED && isReforgeStoneMaterialId(id)) continue;
    const count = rawMaterials[id];
    if (typeof count === "number" && Number.isFinite(count) && count > 0) {
      materials[id] = Math.floor(count);
    }
  }
  Object.assign(
    materials,
    marketplaceLifeItemHoldings(
      {
        farmRaw: saves[FARM_SAVE_KEY],
        fishingRaw: saves[FISHING_STOCK_KEY],
        cookingRaw: saves[COOKING_SAVE_KEY],
      },
      now,
    ),
  );

  return {
    owned: equipment.owned,
    equipped: equipment.equipped,
    materials,
    rareMaps: parseRareMaps(character.rareMaps, now),
    cashItems: parseMuseunCashItems(character.cashItems),
    cookingFoods: parseCookingFoodInventory(inventory.cookingFoods),
    cookingFoodDefinitions: cookingFoodDefinitions(inventory.cookingFoods),
    specimens: parseFishSpecimenInventory(saves[FISH_SPECIMEN_SAVE_KEY]).items,
  };
}

export async function readMarketplaceSellOverview(
  userId: string,
  now = Date.now(),
): Promise<MarketplaceSellOverview> {
  const saves = await readSaves(db, userId, SELL_OVERVIEW_FALLBACKS);
  return marketplaceSellOverviewFromSaves(saves, now);
}
