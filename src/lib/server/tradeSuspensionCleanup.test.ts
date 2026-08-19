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
}));

vi.mock("@/lib/server/tradeSuspension", () => ({
  lockTradeParticipantStatuses: mocks.lockTradeParticipantStatuses,
}));
vi.mock("@/lib/server/marketplaceEscrow", () => ({
  cancelMarketplaceListingEscrow: mocks.cancelMarketplaceListingEscrow,
  cancelMarketplaceBuyOrderEscrow: mocks.cancelMarketplaceBuyOrderEscrow,
  clearMarketplaceHighestBid: mocks.clearMarketplaceHighestBid,
}));

import { clearActiveTradeExposure } from "./tradeSuspensionCleanup";

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
) {
  let listingQueryCount = 0;
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
          if (table === marketplaceBuyOrdersV2) {
            return buyOrders
              .filter((order) => order.buyerId === "u-target" && order.status === "active")
              .sort((a, b) => a.id - b.id);
          }
          listingQueryCount += 1;
          const ownedQuery = listingQueryCount % 2 === 1;
          return listings
            .filter((row) =>
              ownedQuery
                ? row.sellerId === "u-target" && row.status === "active"
                : row.sellerId !== "u-target" &&
                  row.highestBidderId === "u-target" &&
                  row.status === "active",
            )
            .sort((a, b) => a.id - b.id);
        },
      };
      return query;
    }),
  };
  return tx;
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
    ];
    const buyOrders = [buyOrder({ id: 20 })];
    const tx = fakeTransaction(listings, buyOrders);

    await expect(
      clearActiveTradeExposure(tx as never, "u-target", now),
    ).resolves.toEqual({
      listingsCancelled: 2,
      buyOrdersCancelled: 1,
      highestBidsCleared: 1,
      refundedGold: 12_000,
    });
    expect(mocks.operationOrder).toEqual([
      "lock:user:u-target",
      "listing:10",
      "listing:11",
      "buy-order:20",
      "highest-bid:30",
    ]);
    expect(listings.find((row) => row.id === 30)).toMatchObject({
      status: "active",
      highestBid: null,
      highestBidderId: null,
      bidCount: 3,
    });
    const inboxCount = mocks.inboxRows.length;

    await expect(
      clearActiveTradeExposure(tx as never, "u-target", now),
    ).resolves.toEqual({
      listingsCancelled: 0,
      buyOrdersCancelled: 0,
      highestBidsCleared: 0,
      refundedGold: 0,
    });
    expect(mocks.inboxRows).toHaveLength(inboxCount);
  });
});
