import { beforeEach, describe, expect, it, vi } from "vitest";
import { marketplaceBuyOrdersV2 } from "@/db/schema";

const mocks = vi.hoisted(() => {
  class TradeSuspendedError extends Error {}
  return {
    TradeSuspendedError,
    suspended: true,
    preparedScope: null as null | {
      participantIds: Set<string>;
      participantStatuses: Map<string, unknown>;
      orderIds: Set<number>;
      listingIds: Set<number>;
    },
    generalScopeOrderIds: new Set<number>(),
    recordedFills: [] as Array<Record<string, unknown>>,
    requireTradeParticipants: vi.fn(async () => {
      throw new TradeSuspendedError();
    }),
    upsertSave: vi.fn(),
    insertValues: [] as unknown[],
    update: vi.fn(() => ({
      set: () => ({ where: async () => undefined }),
    })),
  };
});

const activeOrder = {
  id: 88,
  buyerId: "buyer-1",
  kind: "material",
  itemId: "v2_iron_ore",
  itemName: "철광석",
  unitPrice: 100,
  quantityInitial: 2,
  quantityRemaining: 2,
  goldEscrow: 200,
  minPower: null,
  minQualityPct: null,
  status: "active",
  createdAt: new Date("2026-08-20T10:00:00.000Z"),
  expiresAt: new Date("2099-08-21T10:00:00.000Z"),
  closedAt: null,
} as typeof marketplaceBuyOrdersV2.$inferSelect;

const tx = {
  select: () => ({
    from: () => ({
      where: () => ({
        for: async () => [activeOrder],
        limit: async () => [activeOrder],
        then: <T>(resolve: (value: Array<{ value: number }>) => T) =>
          Promise.resolve([{ value: 0 }]).then(resolve),
      }),
    }),
  }),
  insert: () => ({
    values: (value: unknown) => {
      mocks.insertValues.push(value);
      return { returning: async () => [{ id: 99 }] };
    },
  }),
  update: mocks.update,
};

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (executor: typeof tx) => unknown) => callback(tx)) },
}));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: vi.fn(async () => "buyer-1") }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async () => ({ gold: 1_000 })),
  upsertSave: mocks.upsertSave,
}));
vi.mock("@/lib/server/economyLog", () => ({ recordEconomyEventSoon: vi.fn() }));
vi.mock("@/lib/server/marketplaceBuyOrdersV2", () => ({
  matchMarketplaceBuyOrder: vi.fn(
    async (_tx: unknown, orderId: number, _now: Date, scope: { orderIds: Set<number> }) =>
      scope.orderIds.has(orderId)
        ? [{ orderId, listingId: 71, buyerId: "buyer-1", sellerId: "seller-1" }]
        : [],
  ),
  prepareMarketplaceMatchScope: vi.fn(async () => {
    mocks.generalScopeOrderIds = new Set(
      Array.from({ length: 50 }, (_, index) => index + 1),
    );
    const scope = {
      participantIds: new Set(["buyer-1"]),
      participantStatuses: new Map<string, unknown>(),
      orderIds: new Set(mocks.generalScopeOrderIds),
      listingIds: new Set<number>(),
    };
    mocks.preparedScope = scope;
    return scope;
  }),
  recordMarketplaceAutoMatchFills: vi.fn((fills: Array<Record<string, unknown>>) => {
    mocks.recordedFills.push(...fills);
  }),
  requireMarketplaceMatchParticipants: vi.fn(() => {
    if (mocks.suspended) throw new mocks.TradeSuspendedError();
  }),
}));
vi.mock("@/lib/server/abuseLog", () => ({
  clientIpFromRequest: vi.fn(),
  recordAbuseEventSoon: vi.fn(),
}));
vi.mock("@/lib/server/tradeSuspension", () => ({
  TradeSuspendedError: mocks.TradeSuspendedError,
  requireTradeParticipants: mocks.requireTradeParticipants,
  tradeSuspendedResponse: () => Response.json({ ok: false, error: "trade_suspended" }, { status: 403 }),
}));

import { PATCH, POST } from "./route";

function postRequest() {
  return new Request("http://localhost/api/v2/marketplace/buy-orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "material", itemId: "v2_iron_ore", quantity: 2, unitPrice: 100, days: 3 }),
  });
}

function patchRequest() {
  return new Request("http://localhost/api/v2/marketplace/buy-orders", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: 88, quantity: 2, unitPrice: 100, days: 3 }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.suspended = true;
  mocks.preparedScope = null;
  mocks.generalScopeOrderIds.clear();
  mocks.recordedFills.length = 0;
  mocks.insertValues.length = 0;
});

describe("구매 주문 거래 제한", () => {
  it("거래 정지 구매자는 구매 주문을 생성하지 못한다", async () => {
    const response = await POST(postRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "trade_suspended" });
    expect(mocks.upsertSave).not.toHaveBeenCalled();
    expect(mocks.insertValues).toHaveLength(0);
  });

  it("거래 정지 구매자는 구매 주문을 수정하지 못한다", async () => {
    const response = await PATCH(patchRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "trade_suspended" });
    expect(mocks.upsertSave).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("일반 상위 50개 밖의 명시 수정 주문도 자동 매칭에 포함한다", async () => {
    mocks.suspended = false;

    const response = await PATCH(patchRequest());

    expect(response.status).toBe(200);
    expect(mocks.generalScopeOrderIds.size).toBe(50);
    expect(mocks.generalScopeOrderIds.has(88)).toBe(false);
    expect(mocks.preparedScope?.orderIds.has(88)).toBe(true);
    expect(mocks.recordedFills).toEqual([
      {
        orderId: 88,
        listingId: 71,
        buyerId: "buyer-1",
        sellerId: "seller-1",
      },
    ]);
  });
});
