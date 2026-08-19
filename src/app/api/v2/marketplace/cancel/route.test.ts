import { beforeEach, describe, expect, it, vi } from "vitest";
import { marketplaceListingsV2 } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(async () => "seller-1"),
  enforceUserAndIpRateLimit: vi.fn(() => null),
  recordEconomyEventSoon: vi.fn(),
  lockSaveForUpdate: vi.fn(async () => ({ materials: {} })),
  upsertSave: vi.fn(async () => undefined),
  requireTradeParticipants: vi.fn(async () => {
    throw new Error("strict trade guard must not run for cancellation");
  }),
}));

let selectedListing: typeof marketplaceListingsV2.$inferSelect | undefined;

const tx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        for: vi.fn(async () => (selectedListing ? [selectedListing] : [])),
      })),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  })),
};

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (executor: typeof tx) => unknown) => callback(tx)) },
}));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: mocks.enforceUserAndIpRateLimit,
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: mocks.recordEconomyEventSoon,
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: mocks.lockSaveForUpdate,
  upsertSave: mocks.upsertSave,
}));
vi.mock("@/lib/server/tradeSuspension", () => ({
  requireTradeParticipants: mocks.requireTradeParticipants,
}));

import { requireTradeParticipants } from "@/lib/server/tradeSuspension";
import { POST } from "./route";

function activeListing(
  overrides: Partial<typeof marketplaceListingsV2.$inferSelect> = {},
) {
  return {
    id: 401,
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
  } as typeof marketplaceListingsV2.$inferSelect;
}

function request(listingId = 401) {
  return new Request("http://localhost/api/v2/marketplace/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  selectedListing = activeListing();
});

describe("내 매물 취소", () => {
  it("소유자는 입찰 없는 활성 매물을 취소할 수 있고 엄격 거래 가드를 호출하지 않는다", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.upsertSave).toHaveBeenCalledWith(
      tx,
      "seller-1",
      "character.v2",
      { materials: { iron_ore: 3 } },
    );
    expect(requireTradeParticipants).not.toHaveBeenCalled();
  });

  it("활성 경매에 입찰이 있으면 기존 has_bids 오류를 유지한다", async () => {
    selectedListing = activeListing({ bidCount: 1, highestBid: 1000, highestBidderId: "bidder-1" });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "has_bids" });
    expect(mocks.upsertSave).not.toHaveBeenCalled();
    expect(requireTradeParticipants).not.toHaveBeenCalled();
  });
});
