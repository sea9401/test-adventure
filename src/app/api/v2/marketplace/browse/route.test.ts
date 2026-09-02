import { describe, expect, it, vi } from "vitest";

const rows = [
  {
    id: 1,
    sellerId: "seller-current",
    kind: "material",
    itemId: "v2_iron_ore",
    itemName: "철광석",
    quantity: 3,
    price: 900,
    auctionModeVersion: 1,
    instancePayload: null,
    createdAt: new Date("2026-08-31T00:00:00.000Z"),
    bidEndsAt: new Date("2026-08-31T06:00:00.000Z"),
    expiresAt: new Date("2026-08-31T06:00:00.001Z"),
    highestBid: null,
    highestBidderId: null,
    bidCount: 0,
    bidResolvedAt: null,
  },
  {
    id: 2,
    sellerId: "seller-legacy",
    kind: "material",
    itemId: "v2_iron_ore",
    itemName: "철광석",
    quantity: 10,
    price: 1_000,
    auctionModeVersion: 0,
    instancePayload: null,
    createdAt: new Date("2026-08-30T00:00:00.000Z"),
    bidEndsAt: new Date("2026-08-30T02:00:00.000Z"),
    expiresAt: new Date("2026-08-31T02:00:00.000Z"),
    highestBid: null,
    highestBidderId: null,
    bidCount: 0,
    bidResolvedAt: null,
  },
];

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "viewer"),
}));

vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn((selection: Record<string, unknown>) => {
      const result =
        "value" in selection
          ? [{ value: { gold: 321 } }]
          : "listingId" in selection && Object.keys(selection).length === 1
            ? [{ listingId: 1 }]
            : rows;
      const chain = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => Promise.resolve(result),
        groupBy: () => Promise.resolve(result),
      };
      return chain;
    }),
  },
}));

import { GET } from "./route";

describe("경매장 조회", () => {
  it("현재 경매 버전만 노출하고 6시간·10분 정책을 반환한다", async () => {
    const response = await GET(
      new Request("http://test/api/v2/marketplace/browse?kind=material"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      viewerGold: 321,
      auctionHours: 6,
      bidExtensionWindowMinutes: 10,
      bidExtensionMinutes: 10,
      listings: [
        expect.objectContaining({
          id: 1,
          quantity: 3,
          price: 900,
          nextBid: 900,
          hasMyBid: true,
        }),
      ],
    });
  });
});
