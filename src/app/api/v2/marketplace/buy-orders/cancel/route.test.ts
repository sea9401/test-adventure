import { beforeEach, describe, expect, it, vi } from "vitest";
import { marketplaceBuyOrdersV2 } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(async () => "restricted-buyer"),
  enforceUserAndIpRateLimit: vi.fn(() => null),
  recordEconomyEventSoon: vi.fn(),
  requireTradeParticipants: vi.fn(async () => {
    throw new Error("strict trade guard must not run for cancellation");
  }),
  lockTradeParticipantStatuses: vi.fn(async () =>
    new Map([
      [
        "restricted-buyer",
        {
          source: "trade",
          reason: "조사",
          expiresAt: new Date("2099-01-01T00:00:00.000Z"),
          permanent: false,
        },
      ],
    ]),
  ),
}));

let selectedOrder: typeof marketplaceBuyOrdersV2.$inferSelect | undefined;
const insertedInbox: Array<Record<string, unknown>> = [];
const tx = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        for: vi.fn(async () => (selectedOrder ? [selectedOrder] : [])),
      })),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(async (values: Record<string, unknown>) => insertedInbox.push(values)),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  })),
};

vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (executor: typeof tx) => unknown) => callback(tx)) },
}));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: mocks.enforceUserAndIpRateLimit,
}));
vi.mock("@/lib/server/economyLog", () => ({
  recordEconomyEventSoon: mocks.recordEconomyEventSoon,
}));
vi.mock("@/lib/server/tradeSuspension", () => ({
  requireTradeParticipants: mocks.requireTradeParticipants,
  lockTradeParticipantStatuses: mocks.lockTradeParticipantStatuses,
}));

import {
  lockTradeParticipantStatuses,
  requireTradeParticipants,
} from "@/lib/server/tradeSuspension";
import { POST } from "./route";

function activeOrder(
  overrides: Partial<typeof marketplaceBuyOrdersV2.$inferSelect> = {},
) {
  return {
    id: 501,
    buyerId: "restricted-buyer",
    kind: "material",
    itemId: "iron_ore",
    itemName: "철광석",
    unitPrice: 900,
    quantityInitial: 5,
    quantityRemaining: 5,
    goldEscrow: 4500,
    minPower: null,
    minQualityPct: null,
    status: "active",
    createdAt: new Date("2026-08-20T10:00:00.000Z"),
    expiresAt: new Date("2026-08-21T10:00:00.000Z"),
    closedAt: null,
    ...overrides,
  } as typeof marketplaceBuyOrdersV2.$inferSelect;
}

function request(orderId = 501) {
  return new Request("http://localhost/api/v2/marketplace/buy-orders/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  insertedInbox.length = 0;
  selectedOrder = activeOrder();
});

describe("내 구매 주문 취소", () => {
  it("거래 제한된 구매자도 주문을 취소하고 환불 우편을 한 번 받으며 엄격 거래 가드를 호출하지 않는다", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, refund: 4500 });
    expect(insertedInbox).toEqual([
      expect.objectContaining({
        userId: "restricted-buyer",
        kind: "buy_order_refund",
        payload: { gold: 4500 },
        message: "철광석 구매 주문 취소 · 4,500골드 반환",
      }),
    ]);
    expect(requireTradeParticipants).not.toHaveBeenCalled();
    expect(lockTradeParticipantStatuses).toHaveBeenCalledWith(
      tx,
      ["restricted-buyer"],
      expect.any(Date),
    );
    expect(
      mocks.lockTradeParticipantStatuses.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.select.mock.invocationCallOrder[0]);
  });
});
