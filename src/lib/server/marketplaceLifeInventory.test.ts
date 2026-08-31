import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyFarmState } from "@/adventure/v2/farm";
import { emptyFishingStock } from "@/adventure/v2/fishingStock";
import { emptyCookingState } from "@/adventure/v2/cooking/state";

const store = vi.hoisted(() => new Map<string, unknown>());
const writes = vi.hoisted(() => [] as string[]);

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_executor, userId: string, key: string, fallback: unknown) =>
      store.get(`${userId}:${key}`) ?? fallback,
  ),
  upsertSave: vi.fn(
    async (_executor, userId: string, key: string, value: unknown) => {
      store.set(`${userId}:${key}`, value);
      writes.push(`${userId}:${key}`);
    },
  ),
}));

import {
  deliverMarketplaceLifeItem,
  withdrawMarketplaceLifeItem,
} from "./marketplaceLifeInventory";

const now = Date.parse("2026-08-28T03:00:00.000Z");
const executor = {} as Parameters<typeof withdrawMarketplaceLifeItem>[0];

function seedStores() {
  const farm = emptyFarmState(now);
  store.set("seller:farm.v2", {
    ...farm,
    seeds: { wheat: 2 },
    inventory: { golden_wheat: 2 },
  });
  store.set("seller:fishing-stock.v1", {
    ...emptyFishingStock(),
    items: { catch_common: 2 },
  });
  store.set("seller:cooking.v2", {
    ...emptyCookingState(now),
    kitchenItems: { "processed:flour": 2 },
  });
}

describe("거래소 생활 재료 저장", () => {
  beforeEach(() => {
    store.clear();
    writes.length = 0;
    seedStores();
  });

  it.each([
    ["farm_seed:wheat", "farm.v2"],
    ["farm_item:golden_wheat", "farm.v2"],
    ["fishing_catch:catch_common", "fishing-stock.v1"],
    ["cooking_kitchen:processed:flour", "cooking.v2"],
  ] as const)("%s를 원본 저장소에서 차감한다", async (itemId, saveKey) => {
    await expect(
      withdrawMarketplaceLifeItem(executor, "seller", itemId, 1, now),
    ).resolves.toBe("withdrawn");
    expect(writes).toEqual([`seller:${saveKey}`]);
  });

  it("수량이 부족하면 어떤 저장소도 쓰지 않는다", async () => {
    await expect(
      withdrawMarketplaceLifeItem(executor, "seller", "farm_seed:wheat", 3, now),
    ).resolves.toBe("insufficient");
    expect(writes).toEqual([]);
    expect(
      (store.get("seller:farm.v2") as ReturnType<typeof emptyFarmState>).seeds
        .wheat,
    ).toBe(2);
  });

  it("생활 거래 ID가 아니면 처리하지 않는다", async () => {
    await expect(
      withdrawMarketplaceLifeItem(executor, "seller", "iron_ore", 1, now),
    ).resolves.toBe("not_life_item");
    await expect(
      deliverMarketplaceLifeItem(executor, "buyer", "iron_ore", 1, now),
    ).resolves.toBe(false);
    expect(writes).toEqual([]);
  });

  it("구매자 각 원본 저장소에 기존 수량과 체결 수량을 합산한다", async () => {
    const buyerFarm = emptyFarmState(now);
    store.set("buyer:farm.v2", {
      ...buyerFarm,
      seeds: { wheat: 1 },
      inventory: { golden_wheat: 1 },
    });
    store.set("buyer:fishing-stock.v1", {
      ...emptyFishingStock(),
      items: { catch_common: 1 },
    });
    store.set("buyer:cooking.v2", {
      ...emptyCookingState(now),
      kitchenItems: { "processed:flour": 1 },
    });

    for (const itemId of [
      "farm_seed:wheat",
      "farm_item:golden_wheat",
      "fishing_catch:catch_common",
      "cooking_kitchen:processed:flour",
    ]) {
      await expect(
        deliverMarketplaceLifeItem(executor, "buyer", itemId, 2, now),
      ).resolves.toBe(true);
    }

    const farm = store.get("buyer:farm.v2") as ReturnType<typeof emptyFarmState>;
    expect(farm.seeds.wheat).toBe(3);
    expect(farm.inventory.golden_wheat).toBe(3);
    expect(store.get("buyer:fishing-stock.v1")).toMatchObject({
      items: { catch_common: 3 },
    });
    expect(store.get("buyer:cooking.v2")).toMatchObject({
      kitchenItems: { "processed:flour": 3 },
    });
  });
});
