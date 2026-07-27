import {
  FARM_ITEMS,
  FARM_SAVE_KEY,
  emptyFarmState,
  parseFarmState,
  type FarmItemId,
  type FarmState,
} from "@/adventure/v2/farm";
import {
  FISHING_STOCK_KEY,
  emptyFishingStock,
  isFishingCatchItemId,
  parseFishingStock,
  spendFishingCatchItem,
} from "@/adventure/v2/fishingStock";
import type {
  GuildTradeItem,
  GuildTradeItemSource,
} from "@/adventure/data/v2/guildTrade";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
} from "./savesKv";

type LockedTradeItem = {
  owned: number;
  consume(quantity: number): Promise<void>;
};

type SourceReader = {
  readBalances(
    tx: DbExecutor,
    userId: string,
    items: readonly GuildTradeItem[],
    now: Date,
  ): Promise<Record<string, number>>;
  lockItem(
    tx: DbExecutor,
    userId: string,
    item: GuildTradeItem,
    now: Date,
  ): Promise<LockedTradeItem | null>;
};

function nonNegativeInt(raw: unknown): number {
  return Math.max(0, Math.floor(Number(raw) || 0));
}

const materialSource: SourceReader = {
  async readBalances(tx, userId, items) {
    const char = await readSave<{ materials?: unknown }>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials =
      char.materials && typeof char.materials === "object"
        ? (char.materials as Record<string, unknown>)
        : {};
    return Object.fromEntries(
      items.map((item) => [item.id, nonNegativeInt(materials[item.sourceItemId])]),
    );
  },

  async lockItem(tx, userId, item) {
    const char = await lockSaveForUpdate<Record<string, unknown>>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const materials =
      char.materials && typeof char.materials === "object"
        ? { ...(char.materials as Record<string, unknown>) }
        : {};
    return {
      owned: nonNegativeInt(materials[item.sourceItemId]),
      async consume(quantity) {
        const remaining = nonNegativeInt(materials[item.sourceItemId]) - quantity;
        if (remaining > 0) materials[item.sourceItemId] = remaining;
        else delete materials[item.sourceItemId];
        await upsertSave(tx, userId, "character.v2", { ...char, materials });
      },
    };
  },
};

function isFarmItemId(value: string): value is FarmItemId {
  return Object.prototype.hasOwnProperty.call(FARM_ITEMS, value);
}

const farmSource: SourceReader = {
  async readBalances(tx, userId, items, now) {
    const farm = parseFarmState(
      await readSave(tx, userId, FARM_SAVE_KEY, emptyFarmState(now.getTime())),
    );
    return Object.fromEntries(
      items.map((item) => [
        item.id,
        isFarmItemId(item.sourceItemId)
          ? farm.inventory[item.sourceItemId] ?? 0
          : 0,
      ]),
    );
  },

  async lockItem(tx, userId, item, now) {
    if (!isFarmItemId(item.sourceItemId)) return null;
    const farm = parseFarmState(
      await lockSaveForUpdate(
        tx,
        userId,
        FARM_SAVE_KEY,
        emptyFarmState(now.getTime()),
      ),
    );
    const itemId = item.sourceItemId;
    return {
      owned: farm.inventory[itemId] ?? 0,
      async consume(quantity) {
        const next: FarmState = { ...farm, inventory: { ...farm.inventory } };
        const remaining = (next.inventory[itemId] ?? 0) - quantity;
        if (remaining > 0) next.inventory[itemId] = remaining;
        else delete next.inventory[itemId];
        await upsertSave(tx, userId, FARM_SAVE_KEY, next);
      },
    };
  },
};

const fishingSource: SourceReader = {
  async readBalances(tx, userId, items) {
    const stock = parseFishingStock(
      await readSave(tx, userId, FISHING_STOCK_KEY, emptyFishingStock()),
    );
    return Object.fromEntries(
      items.map((item) => [
        item.id,
        isFishingCatchItemId(item.sourceItemId)
          ? stock.items[item.sourceItemId] ?? 0
          : 0,
      ]),
    );
  },

  async lockItem(tx, userId, item) {
    if (!isFishingCatchItemId(item.sourceItemId)) return null;
    const stock = parseFishingStock(
      await lockSaveForUpdate(tx, userId, FISHING_STOCK_KEY, emptyFishingStock()),
    );
    const itemId = item.sourceItemId;
    return {
      owned: stock.items[itemId] ?? 0,
      async consume(quantity) {
        const next = spendFishingCatchItem(stock, itemId, quantity);
        if (next) await upsertSave(tx, userId, FISHING_STOCK_KEY, next);
      },
    };
  },
};

const SOURCE_READERS: Record<GuildTradeItemSource, SourceReader> = {
  material: materialSource,
  farm: farmSource,
  fishing_item: fishingSource,
};

export async function readGuildTradeItemBalances(
  tx: DbExecutor,
  userId: string,
  items: readonly GuildTradeItem[],
  now: Date = new Date(),
): Promise<Record<string, number>> {
  const bySource = new Map<GuildTradeItemSource, GuildTradeItem[]>();
  for (const item of items) {
    const group = bySource.get(item.source) ?? [];
    group.push(item);
    bySource.set(item.source, group);
  }
  const records: Record<string, number>[] = [];
  // 이 함수는 transaction executor 로도 호출된다. 단일 pg client 에 쿼리를
  // 겹쳐 보내지 않도록 공급원별 잔액을 순서대로 읽는다.
  for (const [source, sourceItems] of bySource.entries()) {
    records.push(
      await SOURCE_READERS[source].readBalances(tx, userId, sourceItems, now),
    );
  }
  return Object.assign({}, ...records) as Record<string, number>;
}

export async function lockGuildTradeItem(
  tx: DbExecutor,
  userId: string,
  item: GuildTradeItem,
  now: Date = new Date(),
): Promise<LockedTradeItem | null> {
  return SOURCE_READERS[item.source].lockItem(tx, userId, item, now);
}
