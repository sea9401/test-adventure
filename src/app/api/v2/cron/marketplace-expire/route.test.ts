import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  marketplaceListingsV2,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
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
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => (mocks.activeRow ? [mocks.activeRow] : []),
    for: async () => (mocks.activeRow ? [mocks.activeRow] : []),
  };
  return chain;
}

const tx = {
  select: vi.fn(() => transactionSelect()),
  insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
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
        return callback(tx);
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
