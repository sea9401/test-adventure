import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  marketplaceBuyOrdersV2,
  marketplaceInbox,
  marketplaceListingsV2,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  restrictedIds: new Set<string>(),
  lockedParticipants: [] as string[],
  order: null as Record<string, unknown> | null,
  generalOrders: [] as Array<Record<string, unknown>>,
  probeListings: [] as Array<Record<string, unknown>>,
  authoritativeListings: [] as Array<Record<string, unknown>>,
  inboxWrites: [] as Array<Record<string, unknown>>,
  orderUpdates: [] as Array<Record<string, unknown>>,
  listingUpdates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/server/tradeSuspension", () => ({
  lockTradeParticipantStatuses: vi.fn(async (_tx: unknown, userIds: string[]) => {
    const ordered = [...new Set(userIds)].sort();
    mocks.lockedParticipants.push(...ordered);
    return new Map(
      ordered.map((userId) => [
        userId,
        mocks.restrictedIds.has(userId)
          ? {
              source: "trade",
              reason: "조사",
              expiresAt: new Date("2099-01-01T00:00:00.000Z"),
              permanent: false,
            }
          : null,
      ]),
    );
  }),
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(async () => ({})),
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
}));

import {
  marketplaceBuyOrderDeliveryKind,
  matchMarketplaceBuyOrder,
} from "./marketplaceBuyOrdersV2";

function order() {
  return {
    id: 12,
    buyerId: "buyer-a",
    kind: "material",
    itemId: "v2_iron_ore",
    itemName: "철광석",
    unitPrice: 1_000,
    quantityInitial: 10,
    quantityRemaining: 10,
    goldEscrow: 10_000,
    minPower: null,
    minQualityPct: null,
    status: "active",
    createdAt: new Date("2026-08-20T09:00:00.000Z"),
    expiresAt: new Date("2026-08-21T12:00:00.000Z"),
    closedAt: null,
  };
}

function listing(id = 21, sellerId = "seller-z") {
  return {
    id,
    sellerId,
    sellerName: "판매자",
    kind: "material",
    itemId: "v2_iron_ore",
    itemName: "철광석",
    quantity: 10,
    price: 10_000,
    instancePayload: null,
    status: "active",
    createdAt: new Date("2026-08-20T08:00:00.000Z"),
    bidEndsAt: new Date("2026-08-20T10:00:00.000Z"),
    expiresAt: new Date("2026-08-21T12:00:00.000Z"),
    highestBid: null,
    highestBidderId: null,
    bidCount: 0,
    bidResolvedAt: null,
    closedAt: null,
    buyerId: null,
  };
}

function selectQuery() {
  let table: unknown;
  let locked = false;
  let ordered = false;
  const builder = {
    from(selected: unknown) {
      table = selected;
      return builder;
    },
    where() {
      return builder;
    },
    orderBy() {
      ordered = true;
      return builder;
    },
    limit() {
      return builder;
    },
    for() {
      locked = true;
      return builder;
    },
    then<TResult1 = unknown[]>(
      onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => never) | null,
    ) {
      const rows =
        table === marketplaceBuyOrdersV2
          ? locked
            ? mocks.order
              ? [mocks.order]
              : []
            : ordered
              ? mocks.generalOrders
              : mocks.order
                ? [mocks.order]
                : []
          : table === marketplaceListingsV2
            ? locked
              ? mocks.authoritativeListings
              : mocks.probeListings
            : [];
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
        if (table === marketplaceBuyOrdersV2) {
          mocks.orderUpdates.push(values);
          if (mocks.order) Object.assign(mocks.order, values);
        } else if (table === marketplaceListingsV2) {
          mocks.listingUpdates.push(values);
        }
      }),
    })),
  })),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.restrictedIds.clear();
  mocks.lockedParticipants.length = 0;
  mocks.order = order();
  mocks.generalOrders = [mocks.order];
  mocks.probeListings = [listing()];
  mocks.authoritativeListings = [mocks.probeListings[0]];
  mocks.inboxWrites.length = 0;
  mocks.orderUpdates.length = 0;
  mocks.listingUpdates.length = 0;
});

describe("거래소 구매 주문 배송 분류", () => {
  it("위험 해역 어획물을 수량형 재료 우편으로 분류한다", () => {
    expect(
      marketplaceBuyOrderDeliveryKind(
        "material",
        "danger_catch_ironjaw_tuna",
      ),
    ).toBe("material");
  });

  it("유효한 물고기 표본만 표본 우편으로 분류한다", () => {
    expect(
      marketplaceBuyOrderDeliveryKind("consumable", "fish_specimen_carp"),
    ).toBe("specimen");
    expect(
      marketplaceBuyOrderDeliveryKind("consumable", "fish_specimen_fake"),
    ).toBeNull();
  });
});

describe("거래 정지 구매 주문 자동 매칭", () => {
  it("일반 상위 50개 밖의 명시 주문도 별도 probe 후 체결한다", async () => {
    mocks.generalOrders = Array.from({ length: 50 }, (_, index) => ({
      ...order(),
      id: 100 + index,
      buyerId: `other-buyer-${String(index).padStart(2, "0")}`,
      unitPrice: 20_000 - index,
    }));
    mocks.restrictedIds.add("other-buyer-00");

    const fills = await matchMarketplaceBuyOrder(
      tx as never,
      12,
      new Date("2026-08-20T12:00:00.000Z"),
    );

    expect(mocks.generalOrders).toHaveLength(50);
    expect(mocks.generalOrders.some((row) => row.id === 12)).toBe(false);
    expect(mocks.restrictedIds.has("other-buyer-00")).toBe(true);
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({ orderId: 12, listingId: 21 });
  });

  it("제한된 구매자의 주문은 활성 에스크로 상태로 남긴다", async () => {
    mocks.restrictedIds.add("buyer-a");

    await expect(
      matchMarketplaceBuyOrder(tx as never, 12, new Date("2026-08-20T12:00:00.000Z")),
    ).resolves.toEqual([]);

    expect(mocks.lockedParticipants).toEqual(["buyer-a", "seller-z"]);
    expect(mocks.order).toMatchObject({ status: "active", goldEscrow: 10_000 });
    expect(mocks.orderUpdates).toHaveLength(0);
    expect(mocks.listingUpdates).toHaveLength(0);
    expect(mocks.inboxWrites).toHaveLength(0);
  });

  it("제한된 판매자 후보를 건너뛰고 주문과 에스크로를 유지한다", async () => {
    mocks.restrictedIds.add("seller-z");

    await expect(
      matchMarketplaceBuyOrder(tx as never, 12, new Date("2026-08-20T12:00:00.000Z")),
    ).resolves.toEqual([]);

    expect(mocks.lockedParticipants).toEqual(["buyer-a", "seller-z"]);
    expect(mocks.order).toMatchObject({ status: "active", goldEscrow: 10_000 });
    expect(mocks.listingUpdates).toHaveLength(0);
    expect(mocks.inboxWrites).toHaveLength(0);
  });

  it("제한된 판매자보다 뒤의 정상 후보는 그대로 체결한다", async () => {
    const permitted = listing(22, "seller-y");
    mocks.probeListings = [mocks.probeListings[0], permitted];
    mocks.authoritativeListings = mocks.probeListings.slice();
    mocks.restrictedIds.add("seller-z");

    const fills = await matchMarketplaceBuyOrder(
      tx as never,
      12,
      new Date("2026-08-20T12:00:00.000Z"),
    );

    expect(mocks.lockedParticipants).toEqual([
      "buyer-a",
      "seller-y",
      "seller-z",
    ]);
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({ listingId: 22, sellerId: "seller-y" });
  });

  it("참여자 탐색 뒤 생긴 더 싼 매물은 늦게 잠그거나 체결하지 않는다", async () => {
    mocks.authoritativeListings = [
      listing(13, "seller-new-0"),
      mocks.probeListings[0],
    ];

    const fills = await matchMarketplaceBuyOrder(
      tx as never,
      12,
      new Date("2026-08-20T12:00:00.000Z"),
    );

    expect(mocks.lockedParticipants).toEqual(["buyer-a", "seller-z"]);
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({ listingId: 21, sellerId: "seller-z" });
    expect(fills.some((fill) => fill.sellerId === "seller-new-0")).toBe(false);
  });
});
