import { beforeEach, describe, expect, it, vi } from "vitest";

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

let listingRows = rows;
const queryCalls = vi.hoisted(() => ({ where: vi.fn(), orderBy: vi.fn() }));

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
            : listingRows;
      const chain = {
        from: () => chain,
        where: (condition: unknown) => { queryCalls.where(condition); return chain; },
        orderBy: (...order: unknown[]) => { queryCalls.orderBy(...order); return chain; },
        limit: (limit: number) => Promise.resolve(result.slice(0, limit)),
        groupBy: () => Promise.resolve(result),
      };
      return chain;
    }),
  },
}));

import { GET } from "./route";

describe("경매장 조회", () => {
  beforeEach(() => {
    listingRows = rows;
    vi.clearAllMocks();
  });

  it("현재 경매 버전만 노출하고 6시간·10분 정책을 반환한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_788_426_000_000);
    const response = await GET(
      new Request("http://test/api/v2/marketplace/browse?kind=material"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      viewerGold: 321,
      serverNow: 1_788_426_000_000,
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

  it("활성 매물 조회 상한을 500건까지 적용한다", async () => {
    listingRows = Array.from({ length: 501 }, (_, index) => ({
      ...rows[0],
      id: index + 1,
      createdAt: new Date(Date.UTC(2026, 7, 31, 0, 0, index)),
    }));

    const response = await GET(
      new Request("http://test/api/v2/marketplace/browse?kind=material"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.listings).toHaveLength(500);
    expect(body.listings.at(-1)?.id).toBe(500);
  });
});


it("마감순과 관심 등록 번호를 조회 제한보다 먼저 DB에 적용한다", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  queryCalls.where.mockClear();
  queryCalls.orderBy.mockClear();
  await GET(new Request("http://test/api/v2/marketplace/browse?sort=ending_asc&watchIds=1,9999"));
  const dialect = new PgDialect();
  const filter = dialect.sqlToQuery(queryCalls.where.mock.calls[0][0]);
  expect(filter.params).toEqual(["active", 1, 1, 9999]);
  const order = dialect.sqlToQuery(queryCalls.orderBy.mock.calls[0][0]);
  expect(order.sql).toContain('"bid_ends_at" asc');
});

it("빈 관심 목록은 전체 조회가 되지 않고 잘못된 번호는 거부한다", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  queryCalls.where.mockClear();
  await GET(new Request("http://test/api/v2/marketplace/browse?watchIds="));
  expect(new PgDialect().sqlToQuery(queryCalls.where.mock.calls[0][0]).sql).toContain("false");
  for (const value of ["-1", "1.2", "abc", "2147483648", Array.from({ length: 201 }, (_, i) => i + 1).join(",")]) {
    expect((await GET(new Request(`http://test/api/v2/marketplace/browse?watchIds=${value}`))).status).toBe(400);
  }
});
