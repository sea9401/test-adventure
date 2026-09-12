import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  marketplaceListingsV2,
  v2Notifications,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  notifications: [] as Array<Record<string, unknown>>,
  failNotification: false,
  inTransaction: false,
  pushTransactionStates: [] as boolean[],
  sendPush: vi.fn(async () => undefined),
  currentIds: [] as number[],
  legacyIds: [] as number[],
  orderIds: [] as number[],
  transactionRows: [] as Array<Record<string, unknown>>,
  activeRow: null as Record<string, unknown> | null,
  topSelectIndex: 0,
  delivered: [] as Array<{ userId: string; listingId: number }>,
  listingCancellations: [] as Array<{
    listingId: number;
    reason: string;
    refundHighestBid: boolean;
  }>,
  orderCancellations: [] as Array<{ orderId: number; reason: string }>,
}));

vi.mock("@/lib/server/webPush", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/server/webPush")>(),
  sendWebPushToUser: mocks.sendPush,
}));

vi.mock("@/lib/server/cronAuth", () => ({
  requireCronAuth: vi.fn(() => null),
}));

vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
}));

vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(async () => ({})),
}));

vi.mock("@/lib/server/tradeSuspension", () => ({
  lockTradeParticipantStatuses: vi.fn(async (_tx, userIds: string[]) =>
    new Map(userIds.map((userId) => [userId, null])),
  ),
}));

vi.mock("@/lib/server/marketplaceV2Fulfillment", () => ({
  deliverMarketplaceListing: vi.fn(
    async (_tx, userId: string, listing: { id: number }) => {
      mocks.delivered.push({ userId, listingId: listing.id });
      return null;
    },
  ),
}));

vi.mock("@/lib/server/marketplaceEscrow", () => ({
  unresolvedMarketplaceHighestBidderId: vi.fn(
    (listing: { highestBidderId?: string | null; bidResolvedAt?: Date | null }) =>
      listing.bidResolvedAt ? null : listing.highestBidderId ?? null,
  ),
  cancelMarketplaceListingEscrow: vi.fn(
    async (
      _tx,
      listing: { id: number; highestBid?: number | null },
      options: { reason: string; refundHighestBid: boolean },
    ) => {
      mocks.listingCancellations.push({
        listingId: listing.id,
        reason: options.reason,
        refundHighestBid: options.refundHighestBid,
      });
      return {
        cancelled: true,
        refundedBidGold: options.refundHighestBid ? listing.highestBid ?? 0 : 0,
      };
    },
  ),
  cancelMarketplaceBuyOrderEscrow: vi.fn(
    async (_tx, order: { id: number; goldEscrow: number }, _now, reason: string) => {
      mocks.orderCancellations.push({ orderId: order.id, reason });
      return { cancelled: true, refundedGold: order.goldEscrow };
    },
  ),
}));

function topLevelSelect() {
  const index = mocks.topSelectIndex++;
  const ids =
    index === 0
      ? mocks.currentIds
      : index === 1
        ? mocks.legacyIds
        : mocks.orderIds;
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => ids.map((id) => ({ id })),
  };
  return chain;
}

function transactionSelect() {
  let table: unknown;
  const chain = {
    from: (value: unknown) => { table = value; return chain; },
    orderBy: () => chain,
    offset: () => chain,
    where: () => chain,
    limit: async () => (table !== v2Notifications && mocks.activeRow ? [mocks.activeRow] : []),
    for: async () => (mocks.activeRow ? [mocks.activeRow] : []),
  };
  return chain;
}

const tx = {
  select: vi.fn(() => transactionSelect()),
  insert: vi.fn((table: unknown) => ({ values: vi.fn(async (values: Record<string, unknown>) => {
    if (table === v2Notifications) {
      if (mocks.failNotification) throw new Error("notification unavailable");
      mocks.notifications.push(values);
    }
  }) })),
  update: vi.fn((table: unknown) => ({
    set: vi.fn((values: Record<string, unknown>) => ({
      where: vi.fn(async () => {
        if (table === marketplaceListingsV2 && mocks.activeRow) {
          Object.assign(mocks.activeRow, values);
        }
      }),
    })),
  })),
};

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => topLevelSelect()),
    transaction: vi.fn(
      async (callback: (executor: typeof tx) => Promise<unknown>) => {
        mocks.activeRow = mocks.transactionRows.shift() ?? null;
        const snapshot = mocks.activeRow ? { ...mocks.activeRow } : null;
        const deliveredCount = mocks.delivered.length;
        const notificationCount = mocks.notifications.length;
        mocks.inTransaction = true;
        try {
          return await callback(tx);
        } catch (error) {
          if (snapshot && mocks.activeRow) Object.assign(mocks.activeRow, snapshot);
          mocks.delivered.length = deliveredCount;
          mocks.notifications.length = notificationCount;
          throw error;
        } finally {
          mocks.inTransaction = false;
        }
      },
    ),
  },
}));

import { POST } from "./route";

function currentListing(highestBid: number | null) {
  return {
    id: 1,
    sellerId: "seller-a",
    sellerName: "판매자",
    kind: "material",
    itemId: "v2_iron_ore",
    itemName: "철광석",
    quantity: 4,
    price: 500,
    auctionModeVersion: 1,
    instancePayload: null,
    status: "active",
    createdAt: new Date("2026-08-31T00:00:00.000Z"),
    bidEndsAt: new Date("2026-08-31T06:00:00.000Z"),
    expiresAt: new Date("2026-08-31T06:00:00.001Z"),
    highestBid,
    highestBidderId: highestBid == null ? null : "bidder-a",
    bidCount: highestBid == null ? 0 : 1,
    bidResolvedAt: null,
    closedAt: null,
    buyerId: null,
  };
}

function cronRequest() {
  return new Request("http://test/api/v2/cron/marketplace-expire", {
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notifications.length = 0;
  mocks.failNotification = false;
  mocks.inTransaction = false;
  mocks.pushTransactionStates.length = 0;
  mocks.sendPush.mockReset().mockImplementation(async () => {
    mocks.pushTransactionStates.push(mocks.inTransaction);
  });
  mocks.currentIds.length = 0;
  mocks.legacyIds.length = 0;
  mocks.orderIds.length = 0;
  mocks.transactionRows.length = 0;
  mocks.activeRow = null;
  mocks.topSelectIndex = 0;
  mocks.delivered.length = 0;
  mocks.listingCancellations.length = 0;
  mocks.orderCancellations.length = 0;
});

describe("입찰 전용 경매 정산", () => {
  it("시작가와 같은 최고 입찰도 묶음 전체 낙찰로 정산한다", async () => {
    const listing = currentListing(500);
    mocks.currentIds.push(1);
    mocks.transactionRows.push(listing);

    const response = await POST(cronRequest());

    await expect(response.json()).resolves.toMatchObject({ auctionsSold: 1 });
    expect(mocks.delivered).toEqual([{ userId: "bidder-a", listingId: 1 }]);
    expect(listing).toMatchObject({
      status: "sold",
      buyerId: "bidder-a",
      price: 500,
    });
  });

  it("입찰 없는 경매는 고정가 단계 없이 즉시 판매자에게 반환한다", async () => {
    mocks.currentIds.push(1);
    mocks.transactionRows.push(currentListing(null));

    const response = await POST(cronRequest());

    await expect(response.json()).resolves.toMatchObject({ auctionsReturned: 1 });
    expect(mocks.listingCancellations).toEqual([
      { listingId: 1, reason: "expired", refundHighestBid: true },
    ]);
  });

  it("기존 판매 등록과 만료 전 구매 주문도 전액 반환한다", async () => {
    mocks.legacyIds.push(2);
    mocks.orderIds.push(3);
    mocks.transactionRows.push(
      { ...currentListing(700), id: 2, auctionModeVersion: 0 },
      {
        id: 3,
        buyerId: "buyer-order",
        itemName: "철광석",
        status: "active",
        goldEscrow: 2_000,
      },
    );

    const response = await POST(cronRequest());

    await expect(response.json()).resolves.toMatchObject({
      legacyListingsReturned: 1,
      legacyBidsRefunded: 700,
      legacyOrdersRefunded: 2_000,
    });
    expect(mocks.listingCancellations).toEqual([
      { listingId: 2, reason: "feature_retired", refundHighestBid: true },
    ]);
    expect(mocks.orderCancellations).toEqual([
      { orderId: 3, reason: "feature_retired" },
    ]);
  });
});

vi.mock("@/lib/server/marketplaceMaintenance", () => ({
  marketplaceMaintenanceFlagExists: vi.fn(() => false),
  lockMarketplaceMaintenance: vi.fn(async () => false),
}));


it("점검 시작이 조회와 정산 사이에 끼어들어도 낙찰·반환을 보류한다", async () => {
  const { lockMarketplaceMaintenance } = await import("@/lib/server/marketplaceMaintenance");
  vi.mocked(lockMarketplaceMaintenance).mockResolvedValueOnce(true);
  mocks.currentIds.push(1);
  mocks.transactionRows.push(currentListing(700));
  const response = await POST(cronRequest());
  await expect(response.json()).resolves.toMatchObject({auctionsSold: 0, auctionsReturned: 0});
  expect(mocks.delivered).toHaveLength(0);
  expect(mocks.listingCancellations).toHaveLength(0);
});

describe("낙찰 구매자 알림", () => {
  it("지급한 품목·수량·최종 가격을 구매자에게 한 번 알리고 커밋 후 푸시한다", async () => {
    const listing = currentListing(1500);
    mocks.currentIds.push(1);
    mocks.transactionRows.push(listing);
    await POST(cronRequest());
    expect(mocks.notifications).toEqual([{
      userId: "bidder-a",
      type: "auction_won",
      payload: { listingId: 1, itemName: "철광석", quantity: 4, totalPrice: 1500 },
    }]);
    expect(mocks.sendPush).toHaveBeenCalledWith("bidder-a", expect.objectContaining({
      title: "거래소 낙찰", tag: "auction-won-1",
    }));
    expect(mocks.pushTransactionStates).toEqual([false]);
    mocks.topSelectIndex = 0;
    mocks.transactionRows.push(listing);
    await POST(cronRequest());
    expect(mocks.notifications).toHaveLength(1);
    expect(mocks.delivered).toHaveLength(1);
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
  });

  it("유찰에는 구매자 알림을 만들지 않는다", async () => {
    mocks.currentIds.push(1);
    mocks.transactionRows.push(currentListing(null));
    await POST(cronRequest());
    expect(mocks.notifications).toEqual([]);
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("지급 실패에는 낙찰 알림을 만들지 않는다", async () => {
    const { deliverMarketplaceListing } = await import("@/lib/server/marketplaceV2Fulfillment");
    vi.mocked(deliverMarketplaceListing).mockResolvedValueOnce("invalid_item");
    const listing = currentListing(500);
    mocks.currentIds.push(1);
    mocks.transactionRows.push(listing);
    await POST(cronRequest());
    expect(listing.status).toBe("active");
    expect(mocks.notifications).toEqual([]);
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("알림 저장 실패 시 지급과 정산을 롤백하고 푸시하지 않는다", async () => {
    const listing = currentListing(500);
    mocks.currentIds.push(1);
    mocks.transactionRows.push(listing);
    mocks.failNotification = true;
    await expect(POST(cronRequest())).rejects.toThrow("notification unavailable");
    expect(listing.status).toBe("active");
    expect(mocks.delivered).toEqual([]);
    expect(mocks.sendPush).not.toHaveBeenCalled();
  });

  it("푸시 실패 후에도 지급과 영속 알림은 성공으로 유지한다", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mocks.sendPush.mockRejectedValueOnce(new Error("push unavailable"));
      mocks.currentIds.push(1);
      mocks.transactionRows.push(currentListing(500));
      const response = await POST(cronRequest());
      await expect(response.json()).resolves.toMatchObject({ auctionsSold: 1 });
      expect(mocks.notifications).toHaveLength(1);
      expect(mocks.delivered).toHaveLength(1);
      expect(warning).toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });
});
