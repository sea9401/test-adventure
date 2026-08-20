import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  marketplaceBuyOrdersV2,
  marketplaceInbox,
  marketplaceListingsV2,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  listing: null as Record<string, unknown> | null,
  order: null as Record<string, unknown> | null,
  restrictedId: null as string | null,
  lockedParticipants: [] as string[],
  inboxWrites: [] as Array<Record<string, unknown>>,
  deliverMarketplaceListing: vi.fn(async () => null),
  transaction: vi.fn(),
  lockTradeParticipantStatuses: vi.fn(
    async (_tx: unknown, userIds: string[]) => {
      const ordered = [...new Set(userIds)].sort();
      mocks.lockedParticipants.push(...ordered);
      return new Map(
        ordered.map((userId) => [
          userId,
          userId === mocks.restrictedId
            ? {
                source: "trade",
                reason: "조사",
                expiresAt: new Date("2099-01-01T00:00:00.000Z"),
                permanent: false,
              }
            : null,
        ]),
      );
    },
  ),
}));

vi.mock("@/lib/server/cronAuth", () => ({
  requireCronAuth: vi.fn(() => null),
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
}));
vi.mock("@/lib/server/tradeSuspension", () => ({
  lockTradeParticipantStatuses: mocks.lockTradeParticipantStatuses,
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async () => ({ materials: {} })),
  readSave: vi.fn(async () => ({})),
  upsertSave: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/equipGrant", () => ({
  appendEquipInstances: vi.fn(async () => undefined),
}));
vi.mock("@/adventure/data/v2/v2EquipMint", () => ({
  mintListedEquipInstance: vi.fn(() => ({ iid: "restored" })),
}));
vi.mock("@/adventure/data/v2/rareMaps", () => ({
  parseRareMaps: vi.fn(() => []),
}));
vi.mock("@/lib/server/marketplaceV2", () => ({
  marketplaceTaxRateForAdventureSupport: vi.fn(() => 0),
  restoreMarketplaceRareMap: vi.fn(() => null),
  saleProceeds: vi.fn((gross: number) => gross),
}));
vi.mock("@/lib/server/marketplaceV2Fulfillment", () => ({
  deliverFishSpecimenStack: vi.fn(async () => false),
  deliverMarketplaceListing: mocks.deliverMarketplaceListing,
}));
vi.mock("@/adventure/data/v2/adventureSupport", () => ({
  adventureSupportActive: vi.fn(() => false),
}));
vi.mock("@/adventure/data/v2/museunCashItems", () => ({
  addMuseunCashItem: vi.fn((value: unknown) => value),
  isMuseunCashItemId: vi.fn(() => false),
}));
vi.mock("@/adventure/v2/cooking", () => ({
  addCookingFood: vi.fn((value: unknown) => value),
  isCookingFoodId: vi.fn(() => false),
}));
vi.mock("@/lib/server/marketplaceBuyOrdersV2", () => ({
  matchMarketplaceBuyOrder: vi.fn(async () => []),
  recordMarketplaceAutoMatchFills: vi.fn(),
  triggerMarketplacePriceAlertsForListing: vi.fn(async () => undefined),
}));

function listing() {
  return {
    id: 44,
    sellerId: "seller-z",
    sellerName: "판매자",
    kind: "material",
    itemId: "v2_iron_ore",
    itemName: "철광석",
    quantity: 2,
    price: 5_000,
    instancePayload: null,
    status: "active",
    createdAt: new Date("2026-08-20T08:00:00.000Z"),
    bidEndsAt: new Date("2026-08-20T11:00:00.000Z"),
    expiresAt: new Date("2026-08-21T12:00:00.000Z"),
    highestBid: 7_000,
    highestBidderId: "bidder-a",
    bidCount: 2,
    bidResolvedAt: null,
    closedAt: null,
    buyerId: null,
  };
}

function dbSelectQuery() {
  let table: unknown;
  const builder = {
    from(selected: unknown) {
      table = selected;
      return builder;
    },
    where() {
      return builder;
    },
    async limit() {
      if (table === marketplaceListingsV2 && mocks.listing) {
        return [{ id: mocks.listing.id }];
      }
      if (table === marketplaceBuyOrdersV2 && mocks.order) {
        return [{ id: mocks.order.id }];
      }
      return [];
    },
  };
  return builder;
}

function txSelectQuery() {
  let table: unknown;
  const builder = {
    from(selected: unknown) {
      table = selected;
      return builder;
    },
    where() {
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
        table === marketplaceListingsV2 && mocks.listing
          ? [mocks.listing]
          : table === marketplaceBuyOrdersV2 && mocks.order
            ? [mocks.order]
            : [];
      return Promise.resolve(rows).then(onfulfilled, onrejected);
    },
  };
  return builder;
}

const tx = {
  select: vi.fn(() => txSelectQuery()),
  insert: vi.fn((table: unknown) => ({
    values: vi.fn(async (values: Record<string, unknown>) => {
      if (table === marketplaceInbox) mocks.inboxWrites.push(values);
    }),
  })),
  update: vi.fn((table: unknown) => ({
    set: vi.fn((values: Record<string, unknown>) => ({
      where: vi.fn(() => {
        const apply = () => {
          if (table === marketplaceListingsV2 && mocks.listing) {
            Object.assign(mocks.listing, values);
          } else if (table === marketplaceBuyOrdersV2 && mocks.order) {
            Object.assign(mocks.order, values);
          }
        };
        return {
          returning: vi.fn(async () => {
            const canClaim =
              table === marketplaceListingsV2 &&
              mocks.listing?.status === "active" &&
              mocks.listing.bidResolvedAt == null &&
              typeof mocks.listing.highestBidderId === "string" &&
              Number(mocks.listing.highestBid) > 0;
            if (!canClaim) return [];
            apply();
            return [{ id: mocks.listing!.id }];
          }),
          then<TResult1 = void>(
            onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => never) | null,
          ) {
            apply();
            return Promise.resolve().then(onfulfilled, onrejected);
          },
        };
      }),
    })),
  })),
};

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => dbSelectQuery()),
    transaction: (...args: unknown[]) => mocks.transaction(...args),
  },
}));

import { POST } from "./route";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-20T12:00:00.000Z"));
  vi.clearAllMocks();
  mocks.listing = listing();
  mocks.order = null;
  mocks.restrictedId = null;
  mocks.lockedParticipants.length = 0;
  mocks.inboxWrites.length = 0;
  mocks.transaction.mockImplementation(
    async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each([
  ["판매자", "seller-z"],
  ["최고 입찰자", "bidder-a"],
] as const)("제한된 %s의 경매 만료", (_label, restrictedId) => {
  it("낙찰하지 않고 매물을 취소해 입찰금을 반환한다", async () => {
    mocks.restrictedId = restrictedId;

    const response = await POST(
      new Request("http://test/api/v2/cron/marketplace-expire", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.lockedParticipants).toEqual(["bidder-a", "seller-z"]);
    expect(mocks.listing).toMatchObject({
      status: "cancelled",
      highestBid: null,
      highestBidderId: null,
    });
    expect(mocks.inboxWrites).toContainEqual(
      expect.objectContaining({
        userId: "bidder-a",
        kind: "bid_refund",
        payload: { gold: 7_000 },
      }),
    );
    expect(mocks.deliverMarketplaceListing).not.toHaveBeenCalled();
  });
});

describe("낙찰되지 않은 입찰 유예 종료", () => {
  it("한 번 환불한 최고 입찰 캐시를 원자적으로 비워 후속 경로가 다시 반환하지 못하게 한다", async () => {
    Object.assign(mocks.listing!, {
      price: 8_000,
      highestBid: 7_000,
      highestBidderId: "bidder-a",
      bidResolvedAt: null,
    });

    const response = await POST(
      new Request("http://test/api/v2/cron/marketplace-expire", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ bidsRefunded: 1 });
    expect(mocks.listing).toMatchObject({
      status: "active",
      highestBid: null,
      highestBidderId: null,
      bidResolvedAt: new Date("2026-08-20T12:00:00.000Z"),
    });
    expect(mocks.inboxWrites.filter((row) => row.kind === "bid_refund")).toHaveLength(1);
  });
});

describe("구매 주문 만료 잠금", () => {
  it("제한 여부와 무관하게 구매자 유저를 주문 행보다 먼저 잠그고 환불한다", async () => {
    mocks.listing = null;
    mocks.order = {
      id: 91,
      buyerId: "buyer-a",
      kind: "material",
      itemId: "iron_ore",
      itemName: "철광석",
      unitPrice: 1_000,
      quantityInitial: 2,
      quantityRemaining: 2,
      goldEscrow: 2_000,
      minPower: null,
      minQualityPct: null,
      status: "active",
      createdAt: new Date("2026-08-19T10:00:00.000Z"),
      expiresAt: new Date("2026-08-20T11:00:00.000Z"),
      closedAt: null,
    };

    const response = await POST(
      new Request("http://test/api/v2/cron/marketplace-expire", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ordersExpired: 1 });
    expect(mocks.lockedParticipants).toEqual(["buyer-a"]);
    expect(
      mocks.lockTradeParticipantStatuses.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.select.mock.invocationCallOrder[1]);
    expect(mocks.order).toMatchObject({ status: "expired", goldEscrow: 0 });
  });
});
