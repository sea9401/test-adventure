import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { marketplaceInbox, marketplaceListingsV2 } from "@/db/schema";

const mocks = vi.hoisted(() => {
  class TradeSuspendedError extends Error {}
  return {
    TradeSuspendedError,
    userId: "buyer-a",
    restrictedId: null as string | null,
    listing: null as Record<string, unknown> | null,
    lockedParticipants: [] as string[],
    inboxWrites: [] as Array<Record<string, unknown>>,
    wallets: new Map<string, Record<string, unknown>>(),
    upsertSave: vi.fn(async (_tx, userId: string, key: string, value: unknown) => {
      if (key === "character.v2") {
        mocks.wallets.set(userId, structuredClone(value as Record<string, unknown>));
      }
    }),
    deliverMarketplaceListing: vi.fn(async () => null),
    transaction: vi.fn(),
  };
});

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, userId: string) =>
    structuredClone(mocks.wallets.get(userId) ?? {}),
  ),
  readSave: vi.fn(async () => ({})),
  upsertSave: mocks.upsertSave,
}));
vi.mock("@/lib/server/marketplaceV2Fulfillment", () => ({
  deliverMarketplaceListing: mocks.deliverMarketplaceListing,
}));
vi.mock("@/lib/server/tradeSuspension", () => ({
  TradeSuspendedError: mocks.TradeSuspendedError,
  requireTradeParticipants: vi.fn(async (_tx: unknown, userIds: string[]) => {
    const ordered = [...new Set(userIds)].sort();
    mocks.lockedParticipants.push(...ordered);
    if (mocks.restrictedId && ordered.includes(mocks.restrictedId)) {
      throw new mocks.TradeSuspendedError();
    }
  }),
  tradeSuspendedResponse: vi.fn(() =>
    Response.json({ ok: false, error: "trade_suspended" }, { status: 403 }),
  ),
}));
vi.mock("@/lib/server/marketplaceV2", () => ({
  isMarketKind: vi.fn((value: unknown) =>
    value === "equip" || value === "material" || value === "consumable"
  ),
  isStackableMarketplaceItem: vi.fn(() => true),
  isTradableMaterial: vi.fn(() => true),
  isValidMaterialQty: vi.fn((value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
  ),
  isValidPrice: vi.fn((value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
  ),
  marketplaceListingPhase: vi.fn(() => "fixed"),
  marketplaceNextBidMinimum: vi.fn((current: number | null) =>
    current == null ? 1 : current + 1
  ),
  marketplacePartialPrice: vi.fn(
    (price: number, quantity: number, take: number) =>
      take === quantity ? price : Math.ceil((price * take) / quantity),
  ),
  marketplaceTaxRateForAdventureSupport: vi.fn(() => 0),
  restoreMarketplaceRareMap: vi.fn(() => null),
  saleProceeds: vi.fn((gross: number) => gross),
}));
vi.mock("@/adventure/data/v2/v2EquipMint", () => ({
  listedEquipEnhance: vi.fn(() => 0),
}));
vi.mock("@/adventure/data/v2/adventureSupport", () => ({
  adventureSupportActive: vi.fn(() => false),
}));
vi.mock("@/adventure/data/v2/museunCashItems", () => ({
  isMuseunCashItemId: vi.fn(() => false),
}));
vi.mock("@/adventure/v2/cooking/food", () => ({
  isCookingFoodId: vi.fn(() => false),
}));
vi.mock("@/adventure/data/v2/rareMaps", () => ({
  RARE_MAP_CAP: 30,
  parseRareMaps: vi.fn(() => []),
}));
vi.mock("@/adventure/v2/fishSpecimens", () => ({
  fishIdFromSpecimenItemId: vi.fn(() => null),
}));

function selectQuery() {
  let table: unknown;
  const builder = {
    from(selected: unknown) {
      table = selected;
      return builder;
    },
    where() {
      return builder;
    },
    orderBy() {
      return builder;
    },
    limit() {
      return builder;
    },
    for() {
      return builder;
    },
    then<TResult1 = unknown[]>(
      onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => never) | null,
    ) {
      const rows =
        table === marketplaceListingsV2 && mocks.listing ? [mocks.listing] : [];
      return Promise.resolve(rows).then(onfulfilled, onrejected);
    },
  };
  return builder;
}

const tx = {
  select: vi.fn(() => selectQuery()),
  insert: vi.fn((table: unknown) => ({
    values: vi.fn(async (values: Record<string, unknown>) => {
      if (table === marketplaceInbox) mocks.inboxWrites.push(values);
    }),
  })),
  update: vi.fn((table: unknown) => ({
    set: vi.fn((values: Record<string, unknown>) => ({
      where: vi.fn(async () => {
        if (table === marketplaceListingsV2 && mocks.listing) {
          Object.assign(mocks.listing, values);
        }
      }),
    })),
  })),
};

vi.mock("@/db", () => ({
  db: {
    transaction: (...args: unknown[]) => mocks.transaction(...args),
  },
}));

import { POST as buy } from "@/app/api/v2/marketplace/buy/route";
import { POST as buyStack } from "@/app/api/v2/marketplace/buy-stack/route";
import { POST as bid } from "@/app/api/v2/marketplace/bid/route";

function listing(options: { bidding?: boolean } = {}) {
  return {
    id: 71,
    sellerId: "seller-z",
    sellerName: "판매자",
    kind: "material",
    itemId: "v2_iron_ore",
    itemName: "철광석",
    quantity: 2,
    price: 1_000,
    instancePayload: null,
    status: "active",
    createdAt: new Date("2026-08-20T09:00:00.000Z"),
    bidEndsAt: new Date(
      options.bidding ? "2026-08-20T13:00:00.000Z" : "2026-08-20T11:00:00.000Z",
    ),
    expiresAt: new Date("2026-08-21T12:00:00.000Z"),
    highestBid: null,
    highestBidderId: null,
    bidCount: 0,
    bidResolvedAt: null,
    closedAt: null,
    buyerId: null,
  };
}

function requestFor(route: "buy" | "stack" | "bid") {
  const body =
    route === "buy"
      ? { listingId: 71 }
      : route === "stack"
        ? {
            kind: "material",
            itemId: "v2_iron_ore",
            quantity: 2,
            maxTotalPrice: 1_000,
          }
        : { listingId: 71, amount: 1_200 };
  return new Request(`http://test/api/v2/marketplace/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-20T12:00:00.000Z"));
  vi.clearAllMocks();
  mocks.userId = "buyer-a";
  mocks.restrictedId = null;
  mocks.listing = listing();
  mocks.lockedParticipants.length = 0;
  mocks.inboxWrites.length = 0;
  mocks.wallets.clear();
  mocks.wallets.set("buyer-a", { gold: 10_000, bankedGold: 0 });
  mocks.wallets.set("seller-z", { gold: 3_000, bankedGold: 0 });
  mocks.transaction.mockImplementation(
    async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each([
  ["고정가 구매", "buy", buy],
  ["스택 구매", "stack", buyStack],
  ["입찰", "bid", bid],
] as const)("%s 거래 정지", (_name, route, handler) => {
  it.each([
    ["행위자", "buyer-a"],
    ["판매자", "seller-z"],
    ["현재 최고 입찰자", "bidder-m"],
  ] as const)("제한된 %s가 참여하면 양쪽 자산을 그대로 둔다", async (_label, restrictedId) => {
    mocks.restrictedId = restrictedId;
    mocks.listing = listing({ bidding: route === "bid" });
    if (restrictedId === "bidder-m") {
      Object.assign(mocks.listing, {
        highestBid: route === "bid" ? 1_000 : 900,
        highestBidderId: "bidder-m",
        bidCount: 1,
      });
    }
    const listingBefore = structuredClone(mocks.listing);
    const walletsBefore = structuredClone([...mocks.wallets]);

    const response = await handler(requestFor(route));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "trade_suspended" });
    expect(mocks.lockedParticipants).toEqual(
      restrictedId === "bidder-m"
        ? ["bidder-m", "buyer-a", "seller-z"]
        : ["buyer-a", "seller-z"],
    );
    expect(mocks.listing).toEqual(listingBefore);
    expect([...mocks.wallets]).toEqual(walletsBefore);
    expect(mocks.inboxWrites).toHaveLength(0);
    expect(mocks.upsertSave).not.toHaveBeenCalled();
    expect(mocks.deliverMarketplaceListing).not.toHaveBeenCalled();
  });
});

describe("정산 완료 입찰 캐시", () => {
  it("이미 환불된 옛 최고 입찰자가 제한되어도 고정가 구매를 막거나 다시 환불하지 않는다", async () => {
    mocks.restrictedId = "bidder-m";
    mocks.listing = {
      ...listing(),
      highestBid: 900,
      highestBidderId: "bidder-m",
      bidCount: 1,
      bidResolvedAt: new Date("2026-08-20T11:05:00.000Z"),
    };

    const response = await buy(requestFor("buy"));

    expect(response.status).toBe(200);
    expect(mocks.lockedParticipants).toEqual(["buyer-a", "seller-z"]);
    expect(mocks.inboxWrites.filter((row) => row.kind === "bid_refund")).toHaveLength(0);
    expect(mocks.listing).toMatchObject({
      status: "sold",
      highestBid: null,
      highestBidderId: null,
    });
  });
});
