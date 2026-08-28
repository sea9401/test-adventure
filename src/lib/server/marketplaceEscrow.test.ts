import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  marketplaceBuyOrdersV2,
  marketplaceListingsV2,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  lockSaveForUpdate: vi.fn(),
  upsertSave: vi.fn(async () => undefined),
  appendEquipInstances: vi.fn(async () => undefined),
  mintListedEquipInstance: vi.fn(() => ({ iid: "restored-equip" })),
  isMuseunCashItemId: vi.fn(() => false),
  addMuseunCashItem: vi.fn(() => ({ restoredCash: true })),
  isCookingFoodId: vi.fn(() => false),
  addCookingFood: vi.fn(() => ({ restoredFood: true })),
  parseRareMaps: vi.fn(() => []),
  restoreMarketplaceRareMap: vi.fn(() => ({ iid: "preserved-map" })),
  deliverFishSpecimenStack: vi.fn(async () => false),
  deliverMarketplaceLifeItem: vi.fn(async () => false),
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: mocks.lockSaveForUpdate,
  upsertSave: mocks.upsertSave,
}));
vi.mock("@/lib/server/equipGrant", () => ({
  appendEquipInstances: mocks.appendEquipInstances,
}));
vi.mock("@/adventure/data/v2/v2EquipMint", () => ({
  mintListedEquipInstance: mocks.mintListedEquipInstance,
}));
vi.mock("@/adventure/data/v2/museunCashItems", () => ({
  isMuseunCashItemId: mocks.isMuseunCashItemId,
  addMuseunCashItem: mocks.addMuseunCashItem,
}));
vi.mock("@/adventure/v2/cooking/food", () => ({
  isCookingFoodId: mocks.isCookingFoodId,
  addCookingFood: mocks.addCookingFood,
}));
vi.mock("@/adventure/data/v2/rareMaps", () => ({
  parseRareMaps: mocks.parseRareMaps,
}));
vi.mock("@/lib/server/marketplaceV2", () => ({
  restoreMarketplaceRareMap: mocks.restoreMarketplaceRareMap,
}));
vi.mock("@/lib/server/marketplaceV2Fulfillment", () => ({
  deliverFishSpecimenStack: mocks.deliverFishSpecimenStack,
}));
vi.mock("@/lib/server/marketplaceLifeInventory", () => ({
  deliverMarketplaceLifeItem: mocks.deliverMarketplaceLifeItem,
}));

import {
  cancelMarketplaceBuyOrderEscrow,
  cancelMarketplaceListingEscrow,
  clearMarketplaceHighestBid,
} from "./marketplaceEscrow";

type Listing = typeof marketplaceListingsV2.$inferSelect;
type BuyOrder = typeof marketplaceBuyOrdersV2.$inferSelect;

const now = new Date("2026-08-20T12:00:00.000Z");

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 71,
    sellerId: "seller-1",
    sellerName: "판매자",
    kind: "material",
    itemId: "iron_ore",
    itemName: "철광석",
    quantity: 3,
    price: 900,
    instancePayload: null,
    status: "active",
    createdAt: new Date("2026-08-20T10:00:00.000Z"),
    bidEndsAt: new Date("2026-08-20T11:00:00.000Z"),
    expiresAt: new Date("2026-08-21T10:00:00.000Z"),
    highestBid: null,
    highestBidderId: null,
    bidCount: 0,
    bidResolvedAt: null,
    closedAt: null,
    buyerId: null,
    ...overrides,
  };
}

function buyOrder(overrides: Partial<BuyOrder> = {}): BuyOrder {
  return {
    id: 82,
    buyerId: "buyer-1",
    kind: "material",
    itemId: "iron_ore",
    itemName: "철광석",
    unitPrice: 900,
    quantityInitial: 5,
    quantityRemaining: 5,
    goldEscrow: 4500,
    minPower: null,
    minQualityPct: null,
    status: "active",
    createdAt: new Date("2026-08-20T10:00:00.000Z"),
    expiresAt: new Date("2026-08-21T10:00:00.000Z"),
    closedAt: null,
    ...overrides,
  };
}

function transactionRecorder() {
  const insertedInbox: Array<Record<string, unknown>> = [];
  const listingUpdates: Array<Record<string, unknown>> = [];
  const listingConditions: unknown[] = [];
  const buyOrderUpdates: Array<Record<string, unknown>> = [];
  let bidClaimed = false;
  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        insertedInbox.push(values);
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn((condition: unknown) => {
          if (table === marketplaceListingsV2) {
            listingConditions.push(condition);
          }
          let recorded = false;
          const record = () => {
            if (recorded) return;
            recorded = true;
            if (table === marketplaceListingsV2) {
              listingUpdates.push(values);
            } else {
              buyOrderUpdates.push(values);
            }
          };
          return {
            returning: vi.fn(async () => {
              record();
              if (bidClaimed) return [];
              bidClaimed = true;
              return [{ id: 71 }];
            }),
            then<TResult1 = void>(
              onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((reason: unknown) => never) | null,
            ) {
              record();
              return Promise.resolve().then(onfulfilled, onrejected);
            },
          };
        }),
      })),
    })),
  };
  return {
    tx,
    insertedInbox,
    listingUpdates,
    listingConditions,
    buyOrderUpdates,
  };
}

function sqlColumnNames(value: unknown, seen = new Set<object>()): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => sqlColumnNames(entry, seen));
  }
  if (!value || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  if (
    "columnType" in value &&
    "name" in value &&
    typeof value.name === "string"
  ) {
    return [value.name];
  }
  if ("queryChunks" in value) {
    return sqlColumnNames(value.queryChunks, seen);
  }
  return [];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lockSaveForUpdate.mockResolvedValue({ materials: { iron_ore: 2 } });
});

describe("거래소 에스크로 취소", () => {
  it("장비를 판매자에게 복원하고 비활성 행은 두 번째 반환을 막는다", async () => {
    const { tx, listingUpdates } = transactionRecorder();
    const active = listing({ kind: "equip", itemId: "bronze_sword", quantity: 1 });

    await expect(
      cancelMarketplaceListingEscrow(tx as never, active, {
        now,
        refundHighestBid: false,
        reason: "user_cancel",
      }),
    ).resolves.toEqual({ cancelled: true, refundedBidGold: 0 });
    expect(mocks.appendEquipInstances).toHaveBeenCalledWith(
      tx,
      active.sellerId,
      [{ iid: "restored-equip" }],
    );
    expect(listingUpdates).toContainEqual({ status: "cancelled", closedAt: now });

    await expect(
      cancelMarketplaceListingEscrow(tx as never, { ...active, status: "cancelled" }, {
        now,
        refundHighestBid: false,
        reason: "user_cancel",
      }),
    ).resolves.toEqual({ cancelled: false, refundedBidGold: 0 });
    expect(mocks.appendEquipInstances).toHaveBeenCalledTimes(1);
  });

  it("재료를 기존 수량에 더한다", async () => {
    const { tx } = transactionRecorder();
    await cancelMarketplaceListingEscrow(tx as never, listing(), {
      now,
      refundHighestBid: false,
      reason: "user_cancel",
    });

    expect(mocks.upsertSave).toHaveBeenCalledWith(
      tx,
      "seller-1",
      "character.v2",
      { materials: { iron_ore: 5 } },
    );
  });

  it("생활 재료를 판매자의 원본 생활 저장소로 복원한다", async () => {
    const { tx } = transactionRecorder();
    mocks.deliverMarketplaceLifeItem.mockResolvedValueOnce(true);

    await cancelMarketplaceListingEscrow(
      tx as never,
      listing({ itemId: "farm_seed:wheat", itemName: "밀 씨앗", quantity: 1 }),
      {
        now,
        refundHighestBid: false,
        reason: "user_cancel",
      },
    );

    expect(mocks.deliverMarketplaceLifeItem).toHaveBeenCalledWith(
      tx,
      "seller-1",
      "farm_seed:wheat",
      1,
      now.getTime(),
    );
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });

  it("현금 아이템, 음식, 표본, 레어맵을 각각 본래 저장소로 복원한다", async () => {
    const { tx } = transactionRecorder();
    mocks.isMuseunCashItemId.mockImplementation(((itemId: string) => itemId === "cash-item") as never);
    mocks.isCookingFoodId.mockImplementation(((itemId: string) => itemId === "food-item") as never);
    mocks.deliverFishSpecimenStack.mockImplementation((async (_tx: unknown, _userId: string, itemId: string) => itemId === "fish_specimen_salmon") as never);
    mocks.lockSaveForUpdate.mockImplementation(async (_tx: unknown, _userId: string, key: string) =>
      key === "inventory.v2" ? { cookingFoods: {} } : { cashItems: {}, rareMaps: [] },
    );

    for (const itemId of ["cash-item", "food-item", "fish_specimen_salmon", "rare-map"]) {
      await cancelMarketplaceListingEscrow(tx as never, listing({ kind: "consumable", itemId }), {
        now,
        refundHighestBid: false,
        reason: "user_cancel",
      });
    }

    expect(mocks.addMuseunCashItem).toHaveBeenCalled();
    expect(mocks.addCookingFood).toHaveBeenCalled();
    expect(mocks.deliverFishSpecimenStack).toHaveBeenCalledWith(
      tx,
      "seller-1",
      "fish_specimen_salmon",
      3,
    );
    expect(mocks.restoreMarketplaceRareMap).toHaveBeenCalledWith(
      null,
      now.getTime(),
      { preserveIid: true },
    );
  });

  it("구매 주문 골드를 한 번만 반환하며 사용자 취소 문구와 상태 전이를 보존한다", async () => {
    const { tx, insertedInbox, buyOrderUpdates } = transactionRecorder();
    const activeOrder = buyOrder();

    await expect(
      cancelMarketplaceBuyOrderEscrow(tx as never, activeOrder, now, "user_cancel"),
    ).resolves.toMatchObject({ cancelled: true, refundedGold: 4500 });
    expect(insertedInbox).toContainEqual(expect.objectContaining({
      userId: activeOrder.buyerId,
      kind: "buy_order_refund",
      message: "철광석 구매 주문 취소 · 4,500골드 반환",
    }));
    expect(buyOrderUpdates).toContainEqual({
      status: "cancelled",
      goldEscrow: 0,
      closedAt: now,
    });

    await expect(
      cancelMarketplaceBuyOrderEscrow(tx as never, { ...activeOrder, status: "cancelled" }, now, "trade_suspension"),
    ).resolves.toEqual({ cancelled: false, refundedGold: 0 });
    expect(insertedInbox).toHaveLength(1);
  });

  it("거래 제재 최고 입찰 반환은 활성 경매의 후속 입찰과 정산을 위해 미정산 상태를 보존한다", async () => {
    const { tx, insertedInbox, listingUpdates, listingConditions } =
      transactionRecorder();
    const active = listing({ highestBid: 7000, highestBidderId: "bidder-1", bidCount: 2 });

    await expect(
      clearMarketplaceHighestBid(tx as never, active, now, "trade_suspension"),
    ).resolves.toMatchObject({ cleared: true, refundedGold: active.highestBid });
    expect(insertedInbox).toContainEqual(expect.objectContaining({
      userId: "bidder-1",
      kind: "bid_refund",
    }));
    expect(listingUpdates).toContainEqual({
      highestBid: null,
      highestBidderId: null,
      bidResolvedAt: null,
    });
    expect(listingUpdates.at(-1)).not.toHaveProperty("bidCount");
    expect(sqlColumnNames(listingConditions[0])).toContain("bid_count");
  });

  it("만료 최고 입찰 반환은 경매 정산 완료 시각을 기록한다", async () => {
    const { tx, listingUpdates } = transactionRecorder();
    const active = listing({
      highestBid: 7000,
      highestBidderId: "bidder-1",
      bidCount: 2,
    });

    await expect(
      clearMarketplaceHighestBid(tx as never, active, now, "expired"),
    ).resolves.toEqual({ cleared: true, refundedGold: 7000 });
    expect(listingUpdates).toContainEqual({
      highestBid: null,
      highestBidderId: null,
      bidResolvedAt: now,
    });
  });

  it("같은 미정산 최고 입찰 스냅샷을 두 번 처리해도 반환 우편은 한 번만 만든다", async () => {
    const { tx, insertedInbox } = transactionRecorder();
    const active = listing({
      highestBid: 7000,
      highestBidderId: "bidder-1",
      bidCount: 2,
    });

    await clearMarketplaceHighestBid(tx as never, active, now, "expired");
    await clearMarketplaceHighestBid(tx as never, active, now, "expired");

    expect(insertedInbox).toHaveLength(1);
  });

  it("이미 정산된 활성 최고 입찰은 다시 환불하지 않고 낡은 캐시만 지운다", async () => {
    const { tx, insertedInbox, listingUpdates } = transactionRecorder();
    const resolved = listing({
      highestBid: 7000,
      highestBidderId: "bidder-1",
      bidCount: 2,
      bidResolvedAt: new Date("2026-08-20T11:05:00.000Z"),
    });

    await expect(
      clearMarketplaceHighestBid(tx as never, resolved, now, "trade_suspension"),
    ).resolves.toEqual({ cleared: false, refundedGold: 0 });
    await expect(
      cancelMarketplaceListingEscrow(tx as never, resolved, {
        now,
        refundHighestBid: true,
        reason: "trade_suspension",
      }),
    ).resolves.toEqual({ cancelled: true, refundedBidGold: 0 });
    expect(insertedInbox).toHaveLength(0);
    expect(listingUpdates).toContainEqual(expect.objectContaining({
      highestBid: null,
      highestBidderId: null,
    }));
  });

  it("비활성 매물의 최고 입찰 정리는 아무 반환도 하지 않는다", async () => {
    const { tx, insertedInbox, listingUpdates } = transactionRecorder();
    await expect(
      clearMarketplaceHighestBid(
        tx as never,
        listing({
          status: "cancelled",
          highestBid: 7000,
          highestBidderId: "bidder-1",
        }),
        now,
        "trade_suspension",
      ),
    ).resolves.toEqual({ cleared: false, refundedGold: 0 });
    expect(insertedInbox).toHaveLength(0);
    expect(listingUpdates).toHaveLength(0);
  });

  it("만료 사유는 목록과 구매 주문의 기존 expired 상태를 보존한다", async () => {
    const listingTx = transactionRecorder();
    const orderTx = transactionRecorder();

    await cancelMarketplaceListingEscrow(
      listingTx.tx as never,
      listing(),
      { now, refundHighestBid: false, reason: "expired" },
    );
    await cancelMarketplaceBuyOrderEscrow(
      orderTx.tx as never,
      buyOrder(),
      now,
      "expired",
    );

    expect(listingTx.listingUpdates).toContainEqual({ status: "expired", closedAt: now });
    expect(orderTx.buyOrderUpdates).toContainEqual({
      status: "expired",
      goldEscrow: 0,
      closedAt: now,
    });
  });
});
