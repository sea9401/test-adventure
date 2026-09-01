import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  marketplaceBuyOrdersV2,
  marketplaceListingsV2,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  operationOrder: [] as string[],
  inboxRows: [] as Array<{ userId: string; gold: number }>,
  lockTradeParticipantStatuses: vi.fn(async (_tx: unknown, userIds: string[]) => {
    mocks.operationOrder.push(...userIds.map((userId) => `lock:user:${userId}`));
    return new Map(userIds.map((userId) => [userId, null]));
  }),
  cancelMarketplaceListingEscrow: vi.fn(
    async (_tx: unknown, listing: Listing) => {
      if (listing.status !== "active") {
        return { cancelled: false, refundedBidGold: 0 };
      }
      mocks.operationOrder.push(`listing:${listing.id}`);
      listing.status = "cancelled";
      const refundedBidGold = listing.highestBid ?? 0;
      if (listing.highestBidderId && refundedBidGold > 0) {
        mocks.inboxRows.push({
          userId: listing.highestBidderId,
          gold: refundedBidGold,
        });
      }
      listing.highestBid = null;
      listing.highestBidderId = null;
      return { cancelled: true, refundedBidGold };
    },
  ),
  cancelMarketplaceBuyOrderEscrow: vi.fn(
    async (_tx: unknown, order: BuyOrder) => {
      if (order.status !== "active") {
        return { cancelled: false, refundedGold: 0 };
      }
      mocks.operationOrder.push(`buy-order:${order.id}`);
      order.status = "cancelled";
      const refundedGold = order.goldEscrow;
      order.goldEscrow = 0;
      if (refundedGold > 0) {
        mocks.inboxRows.push({ userId: order.buyerId, gold: refundedGold });
      }
      return { cancelled: true, refundedGold };
    },
  ),
  clearMarketplaceHighestBid: vi.fn(
    async (_tx: unknown, listing: Listing) => {
      if (
        listing.status !== "active" ||
        !listing.highestBidderId ||
        !listing.highestBid
      ) {
        return { cleared: false, refundedGold: 0 };
      }
      mocks.operationOrder.push(`highest-bid:${listing.id}`);
      if (listing.bidResolvedAt) {
        listing.highestBid = null;
        listing.highestBidderId = null;
        return { cleared: false, refundedGold: 0 };
      }
      const refundedGold = listing.highestBid;
      mocks.inboxRows.push({
        userId: listing.highestBidderId,
        gold: refundedGold,
      });
      listing.highestBid = null;
      listing.highestBidderId = null;
      return { cleared: true, refundedGold };
    },
  ),
  unresolvedMarketplaceHighestBidderId: vi.fn((listing: Listing) =>
    !listing.bidResolvedAt &&
    listing.highestBidderId &&
    (listing.highestBid ?? 0) > 0
      ? listing.highestBidderId
      : null,
  ),
}));

vi.mock("@/lib/server/tradeSuspension", () => ({
  lockTradeParticipantStatuses: mocks.lockTradeParticipantStatuses,
}));
vi.mock("@/lib/server/marketplaceEscrow", () => ({
  cancelMarketplaceListingEscrow: mocks.cancelMarketplaceListingEscrow,
  cancelMarketplaceBuyOrderEscrow: mocks.cancelMarketplaceBuyOrderEscrow,
  clearMarketplaceHighestBid: mocks.clearMarketplaceHighestBid,
  unresolvedMarketplaceHighestBidderId:
    mocks.unresolvedMarketplaceHighestBidderId,
}));

import {
  clearActiveTradeExposure,
  lockActiveTradeExposure,
} from "./tradeSuspensionCleanup";

type Listing = typeof marketplaceListingsV2.$inferSelect;
type BuyOrder = typeof marketplaceBuyOrdersV2.$inferSelect;

const now = new Date("2026-08-20T12:00:00.000Z");

function listing(overrides: Partial<Listing>): Listing {
  return {
    id: 1,
    sellerId: "u-seller",
    sellerName: "판매자",
    kind: "material",
    itemId: "iron_ore",
    itemName: "철광석",
    quantity: 1,
    price: 1_000,
    instancePayload: null,
    auctionModeVersion: 1,
    status: "active",
    createdAt: new Date("2026-08-20T10:00:00.000Z"),
    bidEndsAt: new Date("2026-08-20T13:00:00.000Z"),
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

function buyOrder(overrides: Partial<BuyOrder>): BuyOrder {
  return {
    id: 1,
    buyerId: "u-target",
    kind: "material",
    itemId: "iron_ore",
    itemName: "철광석",
    unitPrice: 1_000,
    quantityInitial: 6,
    quantityRemaining: 6,
    goldEscrow: 6_000,
    minPower: null,
    minQualityPct: null,
    status: "active",
    createdAt: new Date("2026-08-20T10:00:00.000Z"),
    expiresAt: new Date("2026-08-21T10:00:00.000Z"),
    closedAt: null,
    ...overrides,
  };
}

function fakeTransaction(
  listings: Listing[],
  buyOrders: BuyOrder[],
  options: { includeHistoricalReferences?: boolean } = {},
) {
  let listingLockCount = 0;
  const rowsFor = (table: unknown) => {
    if (table === marketplaceBuyOrdersV2) {
      return buyOrders
        .filter(
          (order) => order.buyerId === "u-target" && order.status === "active",
        )
        .sort((a, b) => a.id - b.id);
    }
    return listings
      .filter((row) =>
        options.includeHistoricalReferences
          ? row.sellerId === "u-target" ||
            row.highestBidderId === "u-target" ||
            row.buyerId === "u-target"
          : row.status === "active" &&
            (row.sellerId === "u-target" ||
              (row.sellerId !== "u-target" &&
                row.highestBidderId === "u-target" &&
                (row.highestBid ?? 0) > 0)),
      )
      .sort((a, b) => a.id - b.id);
  };
  const tx = {
    select: vi.fn(() => {
      let table: unknown;
      const query = {
        from(selected: unknown) {
          table = selected;
          return query;
        },
        where() {
          return query;
        },
        orderBy() {
          return query;
        },
        async for() {
          if (table === marketplaceListingsV2) listingLockCount += 1;
          return rowsFor(table);
        },
        then<TResult1 = Array<Listing | BuyOrder>>(
          onfulfilled?: (
            value: Array<Listing | BuyOrder>,
          ) => TResult1 | PromiseLike<TResult1>,
          onrejected?: (reason: unknown) => never,
        ) {
          return Promise.resolve(rowsFor(table)).then(onfulfilled, onrejected);
        },
      };
      return query;
    }),
  };
  return { tx, listingLockCount: () => listingLockCount };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.operationOrder.length = 0;
  mocks.inboxRows.length = 0;
});

describe("거래 제재 활성 노출 정리", () => {
  it("유저를 먼저 잠그고 매물·구매주문·외부 최고 입찰을 ID 오름차순으로 한 번만 정리한다", async () => {
    const listings = [
      listing({ id: 11, sellerId: "u-target" }),
      listing({
        id: 30,
        sellerId: "u-other",
        highestBid: 4_000,
        highestBidderId: "u-target",
        bidCount: 3,
      }),
      listing({
        id: 10,
        sellerId: "u-target",
        highestBid: 2_000,
        highestBidderId: "u-bidder",
        bidCount: 2,
      }),
      listing({
        id: 31,
        sellerId: "u-resolved-seller",
        highestBid: 3_000,
        highestBidderId: "u-target",
        bidCount: 1,
        bidResolvedAt: new Date("2026-08-20T11:05:00.000Z"),
      }),
    ];
    const buyOrders = [buyOrder({ id: 20 })];
    const { tx, listingLockCount } = fakeTransaction(listings, buyOrders);

    await expect(
      clearActiveTradeExposure(tx as never, "u-target", now),
    ).resolves.toEqual({
      listingsCancelled: 2,
      buyOrdersCancelled: 1,
      highestBidsCleared: 1,
      refundedGold: 12_000,
      economyEvents: [
        expect.objectContaining({
          userId: "u-target",
          eventType: "marketplace.trade_cleanup.listing_return",
          itemKind: "material",
          itemId: "iron_ore",
          quantity: 1,
          detail: { listingId: 10 },
        }),
        expect.objectContaining({
          userId: "u-bidder",
          eventType: "marketplace.trade_cleanup.bid_refund",
          goldDelta: 2_000,
          detail: { listingId: 10 },
        }),
        expect.objectContaining({
          userId: "u-target",
          eventType: "marketplace.trade_cleanup.listing_return",
          detail: { listingId: 11 },
        }),
        expect.objectContaining({
          userId: "u-target",
          eventType: "marketplace.trade_cleanup.buy_order_refund",
          goldDelta: 6_000,
          detail: { orderId: 20 },
        }),
        expect.objectContaining({
          userId: "u-target",
          eventType: "marketplace.trade_cleanup.bid_refund",
          goldDelta: 4_000,
          detail: { listingId: 30 },
        }),
      ],
    });
    expect(mocks.lockTradeParticipantStatuses).toHaveBeenCalledWith(
      tx,
      ["u-bidder", "u-other", "u-resolved-seller", "u-target"],
      now,
    );
    expect(mocks.operationOrder).toEqual([
      "lock:user:u-bidder",
      "lock:user:u-other",
      "lock:user:u-resolved-seller",
      "lock:user:u-target",
      "listing:10",
      "listing:11",
      "buy-order:20",
      "highest-bid:30",
      "highest-bid:31",
    ]);
    expect(listingLockCount()).toBe(1);
    expect(listings.find((row) => row.id === 30)).toMatchObject({
      status: "active",
      highestBid: null,
      highestBidderId: null,
      bidCount: 3,
    });
    expect(listings.find((row) => row.id === 31)).toMatchObject({
      status: "active",
      highestBid: null,
      highestBidderId: null,
      bidResolvedAt: new Date("2026-08-20T11:05:00.000Z"),
    });
    const inboxCount = mocks.inboxRows.length;

    await expect(
      clearActiveTradeExposure(tx as never, "u-target", now),
    ).resolves.toEqual({
      listingsCancelled: 0,
      buyOrdersCancelled: 0,
      highestBidsCleared: 0,
      refundedGold: 0,
      economyEvents: [],
    });
    expect(mocks.inboxRows).toHaveLength(inboxCount);
  });

  it("계정 삭제 모드는 종료 매물의 판매자·입찰자·구매자까지 같은 순서로 잠근다", async () => {
    const listings = [
      listing({
        id: 41,
        sellerId: "u-seller",
        status: "sold",
        highestBid: 5_000,
        highestBidderId: "u-target",
        buyerId: "u-target",
        bidResolvedAt: new Date("2026-08-20T11:05:00.000Z"),
      }),
      listing({
        id: 42,
        sellerId: "u-target",
        status: "sold",
        highestBid: 7_000,
        highestBidderId: "u-bidder",
        buyerId: "u-buyer",
        bidResolvedAt: new Date("2026-08-20T11:06:00.000Z"),
      }),
    ];
    const { tx, listingLockCount } = fakeTransaction(listings, [], {
      includeHistoricalReferences: true,
    });

    await expect(
      lockActiveTradeExposure(tx as never, "u-target", now, {
        includeHistoricalReferences: true,
      }),
    ).resolves.toMatchObject({
      participantUserIds: [
        "u-bidder",
        "u-buyer",
        "u-seller",
        "u-target",
      ],
      listings: [{ id: 41 }, { id: 42 }],
    });
    expect(mocks.lockTradeParticipantStatuses).toHaveBeenCalledWith(
      tx,
      ["u-bidder", "u-buyer", "u-seller", "u-target"],
      now,
    );
    expect(listingLockCount()).toBe(1);
  });
});
