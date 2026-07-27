import type { DbExecutor } from "@/lib/server/savesKv";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { appendEquipInstances } from "@/lib/server/equipGrant";
import type { marketplaceListingsV2 } from "@/db/schema";
import { type V2EquipmentId } from "@/adventure/data/v2/v2Equipment";
import { mintListedEquipInstance } from "@/adventure/data/v2/v2EquipMint";
import { RARE_MAP_CAP, parseRareMaps } from "@/adventure/data/v2/rareMaps";
import {
  addMuseunCashItem,
  isMuseunCashItemId,
} from "@/adventure/data/v2/museunCashItems";
import {
  addCookingFood,
  isCookingFoodId,
} from "@/adventure/v2/cooking";
import { restoreMarketplaceRareMap } from "@/lib/server/marketplaceV2";

export type MarketplaceListingRow = typeof marketplaceListingsV2.$inferSelect;

type CharSave = {
  materials?: Record<string, number>;
  rareMaps?: unknown;
  cashItems?: unknown;
  [key: string]: unknown;
};

type InventorySave = Record<string, unknown> & {
  cookingFoods?: unknown;
};

export async function deliverMarketplaceListing(
  executor: DbExecutor,
  userId: string,
  listing: MarketplaceListingRow,
  options?: { enforceRareMapCap?: boolean },
): Promise<"rare_map_cap" | "invalid_item" | null> {
  if (listing.kind === "equip") {
    await appendEquipInstances(executor, userId, [
      mintListedEquipInstance(
        listing.itemId as V2EquipmentId,
        listing.instancePayload,
      ),
    ]);
    return null;
  }

  if (listing.kind === "consumable") {
    const charSave = await lockSaveForUpdate<CharSave>(
      executor,
      userId,
      "character.v2",
      {},
    );
    if (isMuseunCashItemId(listing.itemId)) {
      await upsertSave(executor, userId, "character.v2", {
        ...charSave,
        cashItems: addMuseunCashItem(
          charSave.cashItems,
          listing.itemId,
          listing.quantity,
        ),
      });
      return null;
    }
    if (isCookingFoodId(listing.itemId)) {
      const inventory = await lockSaveForUpdate<InventorySave>(
        executor,
        userId,
        "inventory.v2",
        {},
      );
      await upsertSave(executor, userId, "inventory.v2", {
        ...inventory,
        cookingFoods: addCookingFood(
          inventory.cookingFoods,
          listing.itemId,
          listing.quantity,
        ),
      });
      return null;
    }
    const current = parseRareMaps(charSave.rareMaps, Date.now());
    if (options?.enforceRareMapCap !== false && current.length >= RARE_MAP_CAP) {
      return "rare_map_cap";
    }
    const restored = restoreMarketplaceRareMap(
      listing.instancePayload,
      Date.now(),
    );
    if (!restored) return "invalid_item";
    await upsertSave(executor, userId, "character.v2", {
      ...charSave,
      rareMaps: [...current, restored],
    });
    return null;
  }

  const charSave = await lockSaveForUpdate<CharSave>(
    executor,
    userId,
    "character.v2",
    {},
  );
  const materials = { ...(charSave.materials ?? {}) };
  materials[listing.itemId] =
    Math.max(0, Math.floor(materials[listing.itemId] ?? 0)) + listing.quantity;
  await upsertSave(executor, userId, "character.v2", {
    ...charSave,
    materials,
  });
  return null;
}
