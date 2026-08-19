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
vi.mock("@/adventure/v2/cooking", () => ({
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
  const buyOrderUpdates: Array<Record<string, unknown>> = [];
  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        insertedInbox.push(values);
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          if (table === marketplaceListingsV2) {
            listingUpdates.push(values);
          } else {
            buyOrderUpdates.push(values);
          }
        }),
      })),
    })),
  };
  return { tx, insertedInbox, listingUpdates, buyOrderUpdates };
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

  it("최고 입찰을 반환하고 목록에서 지운다", async () => {
    const { tx, insertedInbox, listingUpdates } = transactionRecorder();
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
      bidResolvedAt: now,
    });
  });
});
