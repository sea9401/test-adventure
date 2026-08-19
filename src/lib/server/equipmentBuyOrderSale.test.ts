import { beforeEach, describe, expect, it, vi } from "vitest";
import { marketplaceBuyOrdersV2, marketplaceInbox } from "@/db/schema";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";

const mocks = vi.hoisted(() => ({
  restrictedIds: new Set<string>(),
  lockedParticipants: [] as string[],
  probeOrders: [] as Array<Record<string, unknown>>,
  authoritativeOrders: [] as Array<Record<string, unknown>>,
  inboxWrites: [] as Array<Record<string, unknown>>,
  orderUpdates: [] as Array<Record<string, unknown>>,
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
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: vi.fn(),
}));
vi.mock("@/lib/server/abuseLog", () => ({
  recordAbuseEventSoon: vi.fn(),
}));

import { fillBestEquipmentBuyOrder } from "./equipmentBuyOrderSale";

const instance: V2EquipInstance = {
  iid: "eq-sale",
  id: "v2_wooden_bow",
  roll: { power: 20, weight: 0 },
};

function order(id = 31, buyerId = "buyer-a", unitPrice = 10_000) {
  return {
    id,
    buyerId,
    kind: "equip",
    itemId: instance.id,
    itemName: "나무 활",
    unitPrice,
    quantityInitial: 1,
    quantityRemaining: 1,
    goldEscrow: unitPrice,
    minPower: 15,
    minQualityPct: 0,
    status: "active",
    createdAt: new Date("2026-08-20T09:00:00.000Z"),
    expiresAt: new Date("2026-08-21T12:00:00.000Z"),
    closedAt: null,
  };
}

function selectQuery() {
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
    orderBy() {
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
            ? mocks.authoritativeOrders
            : mocks.probeOrders
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
        if (table === marketplaceBuyOrdersV2) mocks.orderUpdates.push(values);
      }),
    })),
  })),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.restrictedIds.clear();
  mocks.lockedParticipants.length = 0;
  mocks.probeOrders = [order()];
  mocks.authoritativeOrders = [mocks.probeOrders[0]];
  mocks.inboxWrites.length = 0;
  mocks.orderUpdates.length = 0;
});

describe("거래 정지 장비 구매 주문 판매", () => {
  it("제한된 주문 구매자는 건너뛰고 우편이나 주문을 변경하지 않는다", async () => {
    mocks.restrictedIds.add("buyer-a");

    await expect(
      fillBestEquipmentBuyOrder(tx as never, {
        sellerId: "seller-z",
        instance,
        taxRate: 0,
        now: new Date("2026-08-20T12:00:00.000Z"),
      }),
    ).resolves.toBeNull();

    expect(mocks.lockedParticipants).toEqual(["buyer-a", "seller-z"]);
    expect(mocks.inboxWrites).toHaveLength(0);
    expect(mocks.orderUpdates).toHaveLength(0);
  });

  it("제한된 판매자도 주문 구매자에게 장비를 보내지 않는다", async () => {
    mocks.restrictedIds.add("seller-z");

    await expect(
      fillBestEquipmentBuyOrder(tx as never, {
        sellerId: "seller-z",
        instance,
        taxRate: 0,
        now: new Date("2026-08-20T12:00:00.000Z"),
      }),
    ).resolves.toBeNull();

    expect(mocks.lockedParticipants).toEqual(["buyer-a", "seller-z"]);
    expect(mocks.inboxWrites).toHaveLength(0);
    expect(mocks.orderUpdates).toHaveLength(0);
  });

  it("탐색 뒤 생긴 더 높은 주문을 늦게 잠그지 않고 탐색한 주문만 체결한다", async () => {
    mocks.authoritativeOrders = [
      order(32, "buyer-new-0", 20_000),
      mocks.probeOrders[0],
    ];

    const audit = await fillBestEquipmentBuyOrder(tx as never, {
      sellerId: "seller-z",
      instance,
      taxRate: 0,
      now: new Date("2026-08-20T12:00:00.000Z"),
    });

    expect(mocks.lockedParticipants).toEqual(["buyer-a", "seller-z"]);
    expect(audit).toMatchObject({ orderId: 31, buyerId: "buyer-a" });
    expect(mocks.inboxWrites).not.toContainEqual(
      expect.objectContaining({ userId: "buyer-new-0" }),
    );
  });
});
