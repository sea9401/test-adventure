import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  marketplaceBidsV2,
  marketplaceInbox,
  marketplaceListingsV2,
} from "@/db/schema";

const mocks = vi.hoisted(() => {
  class TradeSuspendedError extends Error {}
  return {
    TradeSuspendedError,
    listing: null as Record<string, unknown> | null,
    listingUpdates: [] as Array<Record<string, unknown>>,
    bidWrites: [] as Array<Record<string, unknown>>,
    inboxWrites: [] as Array<Record<string, unknown>>,
    wallet: { gold: 10_000, bankedGold: 0 } as Record<string, unknown>,
    upsertSave: vi.fn(async (_tx, _userId, _key, value: unknown) => {
      mocks.wallet = structuredClone(value as Record<string, unknown>);
    }),
  };
});

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "bidder-a"),
}));

vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
}));

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async () => structuredClone(mocks.wallet)),
  upsertSave: mocks.upsertSave,
}));

vi.mock("@/lib/server/tradeSuspension", () => ({
  TradeSuspendedError: mocks.TradeSuspendedError,
  requireTradeParticipants: vi.fn(async () => undefined),
  tradeSuspendedResponse: vi.fn(() =>
    Response.json({ ok: false, error: "trade_suspended" }, { status: 403 }),
  ),
}));

function selectQuery(selection?: Record<string, unknown>) {
  const probe = selection != null && "sellerId" in selection;
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: async () => {
      if (!mocks.listing) return [];
      if (!probe) return [mocks.listing];
      return [
        {
          sellerId: mocks.listing.sellerId,
          highestBidderId: mocks.listing.highestBidderId,
          highestBid: mocks.listing.highestBid,
          bidResolvedAt: mocks.listing.bidResolvedAt,
        },
      ];
    },
    for: async () => (mocks.listing ? [mocks.listing] : []),
  };
  return builder;
}

const tx = {
  select: vi.fn((selection?: Record<string, unknown>) => selectQuery(selection)),
  insert: vi.fn((table: unknown) => ({
    values: vi.fn(async (values: Record<string, unknown>) => {
      if (table === marketplaceBidsV2) mocks.bidWrites.push(values);
      if (table === marketplaceInbox) mocks.inboxWrites.push(values);
    }),
  })),
  update: vi.fn((table: unknown) => ({
    set: vi.fn((values: Record<string, unknown>) => ({
      where: vi.fn(async () => {
        if (table === marketplaceListingsV2 && mocks.listing) {
          mocks.listingUpdates.push(values);
          Object.assign(mocks.listing, values);
        }
      }),
    })),
  })),
};

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(
      async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  },
}));

import { POST } from "./route";

function listing() {
  return {
    id: 71,
    sellerId: "seller-z",
    sellerName: "판매자",
    kind: "material",
    itemId: "v2_iron_ore",
    itemName: "철광석",
    quantity: 3,
    price: 500,
    auctionModeVersion: 1,
    instancePayload: null,
    status: "active",
    createdAt: new Date("2026-08-31T00:00:00.000Z"),
    bidEndsAt: new Date("2026-08-31T06:00:00.000Z"),
    expiresAt: new Date("2026-08-31T06:00:00.001Z"),
    highestBid: null,
    highestBidderId: null,
    bidCount: 0,
    bidResolvedAt: null,
    closedAt: null,
    buyerId: null,
  };
}

function bidRequest(amount: number) {
  return new Request("http://test/api/v2/marketplace/bid", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ listingId: 71, amount }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-31T05:55:00.000Z"));
  vi.clearAllMocks();
  mocks.listing = listing();
  mocks.listingUpdates.length = 0;
  mocks.bidWrites.length = 0;
  mocks.inboxWrites.length = 0;
  mocks.wallet = { gold: 10_000, bankedGold: 0 };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("전 품목 입찰", () => {
  it("첫 입찰이 묶음 전체 시작가보다 낮으면 거절한다", async () => {
    const response = await POST(bidRequest(499));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "bid_too_low",
      nextBid: 500,
    });
    expect(mocks.bidWrites).toHaveLength(0);
    expect(mocks.upsertSave).not.toHaveBeenCalled();
  });

  it("남은 시간이 10분 미만이면 기존 종료 시각에 10분을 더한다", async () => {
    const response = await POST(bidRequest(500));

    expect(response.status).toBe(200);
    expect(mocks.listingUpdates).toContainEqual(
      expect.objectContaining({
        highestBid: 500,
        bidEndsAt: new Date("2026-08-31T06:10:00.000Z"),
        expiresAt: new Date("2026-08-31T06:10:00.001Z"),
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      highestBid: 500,
      nextBid: 525,
      bidEndsAt: "2026-08-31T06:10:00.000Z",
      extended: true,
    });
  });

  it("레거시 판매 등록에는 입찰하지 못한다", async () => {
    mocks.listing = { ...listing(), auctionModeVersion: 0 };

    const response = await POST(bidRequest(500));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "not_available",
    });
    expect(mocks.bidWrites).toHaveLength(0);
  });
});
