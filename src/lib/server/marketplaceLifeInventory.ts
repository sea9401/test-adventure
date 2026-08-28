import "server-only";

import {
  FARM_SAVE_KEY,
  emptyFarmState,
  parseFarmState,
  type FarmCropId,
  type FarmItemId,
} from "@/adventure/v2/farm";
import {
  FISHING_STOCK_KEY,
  emptyFishingStock,
  parseFishingStock,
  type FishingCatchItemId,
} from "@/adventure/v2/fishingStock";
import {
  COOKING_SAVE_KEY,
  emptyCookingState,
  parseCookingState,
  type CookingKitchenItemId,
} from "@/adventure/v2/cooking/state";
import { marketplaceLifeItemDefinition } from "@/adventure/v2/marketplace/lifeItemCatalog";
import type { DbExecutor } from "@/lib/server/savesKv";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";

export type MarketplaceLifeWithdrawalResult =
  | "withdrawn"
  | "insufficient"
  | "not_life_item";

function validQuantity(quantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity > 0;
}

function addCount(current: number | undefined, quantity: number): number {
  return Math.max(0, Math.floor(Number(current) || 0)) + quantity;
}

export async function withdrawMarketplaceLifeItem(
  executor: DbExecutor,
  userId: string,
  itemId: string,
  quantity: number,
  now = Date.now(),
): Promise<MarketplaceLifeWithdrawalResult> {
  const definition = marketplaceLifeItemDefinition(itemId);
  if (!definition) return "not_life_item";
  if (!validQuantity(quantity)) return "insufficient";

  if (definition.source === "farm_seed" || definition.source === "farm_item") {
    const farm = parseFarmState(
      await lockSaveForUpdate(
        executor,
        userId,
        FARM_SAVE_KEY,
        emptyFarmState(now),
      ),
      now,
    );
    const source =
      definition.source === "farm_seed" ? farm.seeds : farm.inventory;
    const held = Math.max(
      0,
      Math.floor(
        Number((source as Record<string, number | undefined>)[definition.sourceItemId]) ||
          0,
      ),
    );
    if (held < quantity) return "insufficient";
    const nextSource = { ...source } as Record<string, number>;
    const next = held - quantity;
    if (next > 0) nextSource[definition.sourceItemId] = next;
    else delete nextSource[definition.sourceItemId];
    await upsertSave(executor, userId, FARM_SAVE_KEY, {
      ...farm,
      ...(definition.source === "farm_seed"
        ? { seeds: nextSource }
        : { inventory: nextSource }),
    });
    return "withdrawn";
  }

  if (definition.source === "fishing_catch") {
    const fishing = parseFishingStock(
      await lockSaveForUpdate(
        executor,
        userId,
        FISHING_STOCK_KEY,
        emptyFishingStock(),
      ),
    );
    const sourceItemId = definition.sourceItemId as FishingCatchItemId;
    const held = Math.max(0, Math.floor(Number(fishing.items[sourceItemId]) || 0));
    if (held < quantity) return "insufficient";
    const items = { ...fishing.items };
    const next = held - quantity;
    if (next > 0) items[sourceItemId] = next;
    else delete items[sourceItemId];
    await upsertSave(executor, userId, FISHING_STOCK_KEY, {
      ...fishing,
      items,
    });
    return "withdrawn";
  }

  const cooking = parseCookingState(
    await lockSaveForUpdate(
      executor,
      userId,
      COOKING_SAVE_KEY,
      emptyCookingState(now),
    ),
    now,
  );
  const sourceItemId = definition.sourceItemId as CookingKitchenItemId;
  const held = Math.max(
    0,
    Math.floor(Number(cooking.kitchenItems[sourceItemId]) || 0),
  );
  if (held < quantity) return "insufficient";
  const kitchenItems = { ...cooking.kitchenItems };
  const next = held - quantity;
  if (next > 0) kitchenItems[sourceItemId] = next;
  else delete kitchenItems[sourceItemId];
  await upsertSave(executor, userId, COOKING_SAVE_KEY, {
    ...cooking,
    kitchenItems,
  });
  return "withdrawn";
}

export async function deliverMarketplaceLifeItem(
  executor: DbExecutor,
  userId: string,
  itemId: string,
  quantity: number,
  now = Date.now(),
): Promise<boolean> {
  const definition = marketplaceLifeItemDefinition(itemId);
  if (!definition || !validQuantity(quantity)) return false;

  if (definition.source === "farm_seed" || definition.source === "farm_item") {
    const farm = parseFarmState(
      await lockSaveForUpdate(
        executor,
        userId,
        FARM_SAVE_KEY,
        emptyFarmState(now),
      ),
      now,
    );
    if (definition.source === "farm_seed") {
      const sourceItemId = definition.sourceItemId as FarmCropId;
      await upsertSave(executor, userId, FARM_SAVE_KEY, {
        ...farm,
        seeds: {
          ...farm.seeds,
          [sourceItemId]: addCount(farm.seeds[sourceItemId], quantity),
        },
      });
    } else {
      const sourceItemId = definition.sourceItemId as FarmItemId;
      await upsertSave(executor, userId, FARM_SAVE_KEY, {
        ...farm,
        inventory: {
          ...farm.inventory,
          [sourceItemId]: addCount(farm.inventory[sourceItemId], quantity),
        },
      });
    }
    return true;
  }

  if (definition.source === "fishing_catch") {
    const fishing = parseFishingStock(
      await lockSaveForUpdate(
        executor,
        userId,
        FISHING_STOCK_KEY,
        emptyFishingStock(),
      ),
    );
    const sourceItemId = definition.sourceItemId as FishingCatchItemId;
    await upsertSave(executor, userId, FISHING_STOCK_KEY, {
      ...fishing,
      items: {
        ...fishing.items,
        [sourceItemId]: addCount(fishing.items[sourceItemId], quantity),
      },
    });
    return true;
  }

  const cooking = parseCookingState(
    await lockSaveForUpdate(
      executor,
      userId,
      COOKING_SAVE_KEY,
      emptyCookingState(now),
    ),
    now,
  );
  const sourceItemId = definition.sourceItemId as CookingKitchenItemId;
  await upsertSave(executor, userId, COOKING_SAVE_KEY, {
    ...cooking,
    kitchenItems: {
      ...cooking.kitchenItems,
      [sourceItemId]: addCount(cooking.kitchenItems[sourceItemId], quantity),
    },
  });
  return true;
}
