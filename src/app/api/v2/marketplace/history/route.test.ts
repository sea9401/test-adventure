import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    rows: [] as Array<Record<string, unknown>>,
    selection: {} as Record<string, unknown>,
  };
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  builder.from.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.orderBy.mockReturnValue(builder);
  builder.limit.mockImplementation(async () =>
    state.rows.map((row) =>
      Object.fromEntries(
        Object.keys(state.selection).map((key) => [key, row[key]]),
      ),
    ),
  );
  return {
    state,
    builder,
    ensureUser: vi.fn(async () => "viewer-id"),
    rateLimit: vi.fn(() => null),
  };
});

vi.mock("@/db", () => ({
  db: {
    select: vi.fn((selection: Record<string, unknown>) => {
      mocks.state.selection = selection;
      return mocks.builder;
    }),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: mocks.rateLimit,
}));

import { GET } from "./route";

const soldRow = {
  id: 41,
  sellerId: "seller-id",
  sellerName: "판매자",
  buyerId: "viewer-id",
  kind: "material",
  itemId: "iron_ore",
  itemName: "철광석",
  quantity: 5,
  price: 500,
  instancePayload: null,
  closedAt: new Date("2026-08-17T01:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.rows = [soldRow];
  mocks.builder.from.mockReturnValue(mocks.builder);
  mocks.builder.where.mockReturnValue(mocks.builder);
  mocks.builder.orderBy.mockReturnValue(mocks.builder);
  mocks.builder.limit.mockImplementation(async () =>
    mocks.state.rows.map((row) =>
      Object.fromEntries(
        Object.keys(mocks.state.selection).map((key) => [key, row[key]]),
      ),
    ),
  );
});

describe("거래소 최근 체결 API", () => {
  it("전체 최신 100건에서 판매자·구매자와 거래 방향을 공개하지 않는다", async () => {
    const response = await GET(
      new Request("http://localhost/api/v2/marketplace/history"),
    );
    const payload = (await response.json()) as {
      trades: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(mocks.builder.limit).toHaveBeenCalledWith(100);
    expect(payload.trades).toEqual([
      {
        id: 41,
        kind: "material",
        itemId: "iron_ore",
        itemName: "철광석",
        quantity: 5,
        price: 500,
        instancePayload: null,
        closedAt: "2026-08-17T01:00:00.000Z",
      },
    ]);
    expect(payload.trades[0]).not.toHaveProperty("sellerId");
    expect(payload.trades[0]).not.toHaveProperty("sellerName");
    expect(payload.trades[0]).not.toHaveProperty("buyerId");
    expect(payload.trades[0]).not.toHaveProperty("side");
  });

  it("본인 거래는 계정 식별자 없이 구매·판매 방향만 파생한다", async () => {
    mocks.state.rows = [
      soldRow,
      { ...soldRow, id: 42, sellerId: "viewer-id", buyerId: "buyer-id" },
    ];

    const response = await GET(
      new Request("http://localhost/api/v2/marketplace/history?mine=1"),
    );
    const payload = (await response.json()) as {
      trades: Array<Record<string, unknown>>;
    };

    expect(mocks.builder.limit).toHaveBeenCalledWith(100);
    expect(payload.trades.map((trade) => trade.side)).toEqual(["buy", "sell"]);
    for (const trade of payload.trades) {
      expect(trade).not.toHaveProperty("sellerId");
      expect(trade).not.toHaveProperty("buyerId");
    }
  });
});

it("미판매 조회는 판매자 본인의 만료·취소 건만 조건에 포함한다", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  mocks.state.rows = [{ ...soldRow, sellerId: "viewer-id", status: "expired" }];
  const response = await GET(new Request("http://localhost/api/v2/marketplace/history?mine=1&status=unsold"));
  const query = new PgDialect().sqlToQuery(mocks.builder.where.mock.calls[0][0]);
  expect(query.params).toEqual(["expired", "cancelled", "viewer-id"]);
  expect(query.sql).not.toContain('"buyer_id"');
  expect((await response.json()).trades[0]).toMatchObject({ status: "expired", side: "sell", price: 500 });
});


it("미판매 조회 결과를 공개 이력 캐시에 넣지 않는다", async () => {
  mocks.state.rows = [{ ...soldRow, id: 99, sellerId: "viewer-id", status: "cancelled" }];
  await GET(new Request("http://localhost/api/v2/marketplace/history?mine=1&status=unsold"));
  mocks.state.rows = [soldRow];
  const response = await GET(new Request("http://localhost/api/v2/marketplace/history?status=unsold"));
  const body = await response.json();
  expect(body.trades[0].id).toBe(41);
  expect(body.trades[0]).not.toHaveProperty("status");
  expect(body.trades[0]).not.toHaveProperty("side");
});

it("인증 없이 미판매 내역을 조회할 수 없다", async () => {
  mocks.ensureUser.mockResolvedValueOnce("");
  const response = await GET(new Request("http://localhost/api/v2/marketplace/history?mine=1&status=unsold"));
  expect(response.status).toBe(401);
  expect(mocks.builder.where).not.toHaveBeenCalled();
});
