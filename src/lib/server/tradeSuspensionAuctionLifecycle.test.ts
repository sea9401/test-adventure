import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  marketplaceBuyOrdersV2,
  marketplaceInbox,
  marketplaceListingsV2,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  userId: "u-new-bidder",
  listing: null as Listing | null,
  inboxRows: [] as Array<Record<string, unknown>>,
  bidRows: [] as Array<Record<string, unknown>>,
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  transaction: vi.fn(),
  lockSaveForUpdate: vi.fn(async () => ({ gold: 20_000, bankedGold: 0 })),
  readSave: vi.fn(async () => ({})),
  upsertSave: vi.fn(async () => undefined),
}));

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mocks.dbSelect(...args),
    insert: (...args: unknown[]) => mocks.dbInsert(...args),
    update: (...args: unknown[]) => mocks.dbUpdate(...args),
    transaction: (...args: unknown[]) => mocks.transaction(...args),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/cronAuth", () => ({
  requireCronAuth: vi.fn(() => null),
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: mocks.lockSaveForUpdate,
  readSave: mocks.readSave,
  upsertSave: mocks.upsertSave,
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
  isValidPrice: vi.fn((value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
  ),
  marketplaceNextBidMinimum: vi.fn((current: number | null) =>
    current == null ? 1 : current + 1
  ),
  marketplaceTaxRateForAdventureSupport: vi.fn(() => 0),
  restoreMarketplaceRareMap: vi.fn(() => null),
  saleProceeds: vi.fn((gross: number) => gross),
}));
vi.mock("@/lib/server/marketplaceV2Fulfillment", () => ({
  deliverFishSpecimenStack: vi.fn(async () => false),
  deliverMarketplaceListing: vi.fn(async () => null),
}));
vi.mock("@/adventure/data/v2/adventureSupport", () => ({
  adventureSupportTier: vi.fn(() => "none"),
}));
vi.mock("@/adventure/data/v2/museunCashItems", () => ({
  addMuseunCashItem: vi.fn((value: unknown) => value),
  isMuseunCashItemId: vi.fn(() => false),
}));
vi.mock("@/adventure/v2/cooking/food", () => ({
  addCookingFood: vi.fn((value: unknown) => value),
  isCookingFoodId: vi.fn(() => false),
}));
vi.mock("@/lib/server/marketplaceBuyOrdersV2", () => ({
  matchMarketplaceBuyOrder: vi.fn(async () => []),
  recordMarketplaceAutoMatchFills: vi.fn(),
  triggerMarketplacePriceAlertsForListing: vi.fn(async () => undefined),
}));
vi.mock("@/lib/server/tradeSuspension", () => ({
  TradeSuspendedError: class TradeSuspendedError extends Error {},
  requireTradeParticipants: vi.fn(async () => undefined),
  lockTradeParticipantStatuses: vi.fn(async (_tx: unknown, userIds: string[]) =>
    new Map(userIds.map((userId) => [userId, null])),
  ),
  tradeSuspendedResponse: vi.fn(() =>
    Response.json({ ok: false, error: "trade_suspended" }, { status: 403 }),
  ),
}));

import { clearMarketplaceHighestBid } from "./marketplaceEscrow";
import { POST as placeBid } from "@/app/api/v2/marketplace/bid/route";
import { POST as settleMarketplace } from "@/app/api/v2/cron/marketplace-expire/route";

type Listing = typeof marketplaceListingsV2.$inferSelect;

function listing(): Listing {
  return {
    id: 30,
    sellerId: "u-seller",
    sellerName: "판매자",
    kind: "material",
    itemId: "iron_ore",
    itemName: "철광석",
    quantity: 1,
    price: 5_000,
    instancePayload: null,
    status: "active",
    createdAt: new Date("2026-08-20T10:00:00.000Z"),
    bidEndsAt: new Date("2026-08-20T13:00:00.000Z"),
    expiresAt: new Date("2026-08-21T10:00:00.000Z"),
    highestBid: 6_000,
    highestBidderId: "u-sanctioned",
    bidCount: 2,
    bidResolvedAt: null,
    closedAt: null,
    buyerId: null,
  };
}

function query(transactional = false) {
  let table: unknown;
  let locked = false;
  const builder = {
    from(selected: unknown) {
      table = selected;
      return builder;
    },
    where() {
      return builder;
    },
    for() {
      locked = true;
      return builder;
    },
    async limit() {
      if (table === marketplaceListingsV2) {
        const row = mocks.listing;
        if (transactional) return row ? [row] : [];
        const now = new Date();
        return row &&
          row.status === "active" &&
          ((!row.bidResolvedAt && row.bidEndsAt <= now) || row.expiresAt <= now)
          ? [{ id: row.id }]
          : [];
      }
      if (table === marketplaceBuyOrdersV2) return [];
      return [];
    },
    then<TResult1 = Listing[]>(
      onfulfilled?: ((value: Listing[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => never) | null,
    ) {
      const rows = locked && mocks.listing ? [mocks.listing] : [];
      return Promise.resolve(rows).then(onfulfilled, onrejected);
    },
  };
  return builder;
}

const tx = {
  select: vi.fn(() => query(true)),
  insert: vi.fn((table: unknown) => ({
    values: vi.fn(async (values: Record<string, unknown>) => {
      if (table === marketplaceInbox) mocks.inboxRows.push(values);
      else mocks.bidRows.push(values);
    }),
  })),
  update: vi.fn((table: unknown) => ({
    set: vi.fn((values: Record<string, unknown>) => ({
      where: vi.fn(() => {
        const apply = () => {
          if (table === marketplaceListingsV2 && mocks.listing) {
            Object.assign(mocks.listing, values);
          }
        };
        return {
          returning: vi.fn(async () => {
            const canClaim =
              table === marketplaceListingsV2 &&
              mocks.listing?.status === "active" &&
              mocks.listing.bidResolvedAt == null &&
              mocks.listing.highestBidderId !== null &&
              (mocks.listing.highestBid ?? 0) > 0;
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-20T12:00:00.000Z"));
  vi.clearAllMocks();
  mocks.userId = "u-new-bidder";
  mocks.listing = listing();
  mocks.inboxRows.length = 0;
  mocks.bidRows.length = 0;
  mocks.dbSelect.mockImplementation(() => query(false));
  mocks.dbInsert.mockImplementation(tx.insert);
  mocks.dbUpdate.mockImplementation(tx.update);
  mocks.transaction.mockImplementation(
    async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
  );
  mocks.lockSaveForUpdate.mockResolvedValue({ gold: 20_000, bankedGold: 0 });
  mocks.readSave.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("거래 제재 최고 입찰 정리 이후 경매 수명주기", () => {
  it("정지 입찰금을 반환한 뒤 새 입찰을 받고 유예 종료에 정상 낙찰한다", async () => {
    await expect(
      clearMarketplaceHighestBid(
        tx as never,
        mocks.listing!,
        new Date(),
        "trade_suspension",
      ),
    ).resolves.toEqual({ cleared: true, refundedGold: 6_000 });
    expect(mocks.listing).toMatchObject({
      status: "active",
      highestBid: null,
      highestBidderId: null,
      bidCount: 2,
      bidResolvedAt: null,
    });

    vi.setSystemTime(new Date("2026-08-20T12:30:00.000Z"));
    const bidResponse = await placeBid(
      new Request("http://test/api/v2/marketplace/bid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listingId: 30, amount: 7_000 }),
      }),
    );
    expect(bidResponse.status).toBe(200);
    expect(mocks.listing).toMatchObject({
      status: "active",
      highestBid: 7_000,
      highestBidderId: "u-new-bidder",
      bidCount: 3,
      bidResolvedAt: null,
    });

    vi.setSystemTime(new Date("2026-08-20T13:01:00.000Z"));
    const settlementResponse = await settleMarketplace(
      new Request("http://test/api/v2/cron/marketplace-expire", {
        method: "POST",
      }),
    );
    expect(settlementResponse.status).toBe(200);
    await expect(settlementResponse.json()).resolves.toMatchObject({
      auctionsSold: 1,
      bidsRefunded: 0,
    });
    expect(mocks.listing).toMatchObject({
      status: "sold",
      buyerId: "u-new-bidder",
      price: 7_000,
      bidResolvedAt: new Date("2026-08-20T13:01:00.000Z"),
    });
  });
});
