import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    rows: [] as Array<Record<string, unknown>>,
    finalSelection: {} as Record<string, unknown>,
    selectCount: 0,
  };
  const aggregateAlias = {
    listingId: { name: "listing_id" },
    myHighestBid: { name: "my_highest_bid" },
    lastBidAt: { name: "last_bid_at" },
  };
  const aggregateBuilder = {
    from: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn(),
    as: vi.fn(),
  };
  aggregateBuilder.from.mockReturnValue(aggregateBuilder);
  aggregateBuilder.where.mockReturnValue(aggregateBuilder);
  aggregateBuilder.groupBy.mockReturnValue(aggregateBuilder);
  aggregateBuilder.as.mockReturnValue(aggregateAlias);

  const finalBuilder = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  finalBuilder.from.mockReturnValue(finalBuilder);
  finalBuilder.innerJoin.mockReturnValue(finalBuilder);
  finalBuilder.orderBy.mockReturnValue(finalBuilder);
  finalBuilder.limit.mockImplementation(async () =>
    state.rows.map((row) =>
      Object.fromEntries(
        Object.keys(state.finalSelection).map((key) => [key, row[key]]),
      ),
    ),
  );

  return {
    state,
    aggregateBuilder,
    finalBuilder,
    aggregateAlias,
    ensureUser: vi.fn<() => Promise<string | null>>(async () => "viewer-id"),
    rateLimit: vi.fn(() => null),
  };
});

vi.mock("@/db", () => ({
  db: {
    select: vi.fn((selection: Record<string, unknown>) => {
      mocks.state.selectCount += 1;
      if (mocks.state.selectCount === 1) return mocks.aggregateBuilder;
      mocks.state.finalSelection = selection;
      return mocks.finalBuilder;
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

const aggregatedRow = {
  id: 41,
  sellerId: "seller-id",
  buyerId: null,
  highestBidderId: "viewer-id",
  kind: "material",
  itemId: "iron_ore",
  itemName: "철광석",
  quantity: 5,
  price: 2_000,
  instancePayload: null,
  status: "active",
  createdAt: new Date("2026-09-02T06:00:00.000Z"),
  bidEndsAt: new Date("2026-09-02T08:00:00.000Z"),
  expiresAt: new Date("2026-09-02T10:00:00.000Z"),
  closedAt: null,
  highestBid: 1_200,
  bidResolvedAt: null,
  myHighestBid: 1_200,
  lastBidAt: new Date("2026-09-02T06:05:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.rows = [aggregatedRow];
  mocks.state.finalSelection = {};
  mocks.state.selectCount = 0;
  mocks.ensureUser.mockResolvedValue("viewer-id");
  mocks.rateLimit.mockReturnValue(null);
  mocks.aggregateBuilder.from.mockReturnValue(mocks.aggregateBuilder);
  mocks.aggregateBuilder.where.mockReturnValue(mocks.aggregateBuilder);
  mocks.aggregateBuilder.groupBy.mockReturnValue(mocks.aggregateBuilder);
  mocks.aggregateBuilder.as.mockReturnValue(mocks.aggregateAlias);
  mocks.finalBuilder.from.mockReturnValue(mocks.finalBuilder);
  mocks.finalBuilder.innerJoin.mockReturnValue(mocks.finalBuilder);
  mocks.finalBuilder.orderBy.mockReturnValue(mocks.finalBuilder);
});

describe("내 입찰 목록 API", () => {
  it("매물별로 집계한 최근 입찰을 참여자 식별자 없이 반환한다", async () => {
    const response = await GET(
      new Request("http://localhost/api/v2/marketplace/my-bids"),
    );
    const payload = (await response.json()) as {
      bids: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(payload.bids).toEqual([
      {
        id: 41,
        kind: "material",
        itemId: "iron_ore",
        itemName: "철광석",
        quantity: 5,
        price: 2_000,
        instancePayload: null,
        status: "active",
        createdAt: "2026-09-02T06:00:00.000Z",
        bidEndsAt: "2026-09-02T08:00:00.000Z",
        expiresAt: "2026-09-02T10:00:00.000Z",
        closedAt: null,
        highestBid: 1_200,
        bidResolvedAt: null,
        myHighestBid: 1_200,
        lastBidAt: "2026-09-02T06:05:00.000Z",
        isHighestBidder: true,
        isBuyer: false,
        nextBid: 1_260,
      },
    ]);
    expect(payload.bids[0]).not.toHaveProperty("sellerId");
    expect(payload.bids[0]).not.toHaveProperty("buyerId");
    expect(payload.bids[0]).not.toHaveProperty("highestBidderId");
    expect(mocks.aggregateBuilder.groupBy).toHaveBeenCalledTimes(1);
    expect(mocks.finalBuilder.limit).toHaveBeenCalledWith(50);
  });

  it("로그인하지 않은 요청은 입찰 내역을 조회하지 않는다", async () => {
    mocks.ensureUser.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/v2/marketplace/my-bids"),
    );

    expect(response.status).toBe(401);
    expect(mocks.state.selectCount).toBe(0);
  });
});
