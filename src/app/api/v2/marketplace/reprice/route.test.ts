import { beforeEach, describe, expect, it, vi } from "vitest";
import { marketplaceListingsV2 } from "@/db/schema";

const mocks = vi.hoisted(() => {
  class TradeSuspendedError extends Error {}
  return {
    TradeSuspendedError,
    requireTradeParticipants: vi.fn(async () => {
      throw new TradeSuspendedError();
    }),
    update: vi.fn(() => ({
      set: () => ({ where: async () => undefined }),
    })),
  };
});

const listing = {
  id: 71,
  sellerId: "seller-1",
  sellerName: "판매자",
  kind: "material",
  itemId: "iron_ore",
  itemName: "철광석",
  quantity: 2,
  price: 100,
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
} as typeof marketplaceListingsV2.$inferSelect;

const tx = {
  select: () => ({
    from: () => ({ where: () => ({ for: async () => [listing] }) }),
  }),
  update: mocks.update,
};

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (executor: typeof tx) => unknown) => callback(tx)) },
}));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: vi.fn(async () => "seller-1") }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/server/economyLog", () => ({ recordEconomyEventSoon: vi.fn() }));
vi.mock("@/lib/server/marketplaceBuyOrdersV2", () => ({
  matchMarketplaceBuyOrdersForItem: vi.fn(async () => []),
  recordMarketplaceAutoMatchFills: vi.fn(),
  triggerMarketplacePriceAlertsForListing: vi.fn(),
}));
vi.mock("@/lib/server/tradeSuspension", () => ({
  TradeSuspendedError: mocks.TradeSuspendedError,
  requireTradeParticipants: mocks.requireTradeParticipants,
  tradeSuspendedResponse: () => Response.json({ ok: false, error: "trade_suspended" }, { status: 403 }),
}));

import { POST } from "./route";

function request() {
  return new Request("http://localhost/api/v2/marketplace/reprice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ listingId: 71, price: 200 }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("매물 가격 변경 거래 제한", () => {
  it("거래 정지 판매자는 매물 가격을 변경하지 못한다", async () => {
    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "trade_suspended" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
