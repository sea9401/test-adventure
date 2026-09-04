import { describe, expect, it, vi } from "vitest";
import {
  MuseunCoinPaymentError,
  createMuseunCoinPaymentOperations,
  type MuseunCoinPaymentOrderRecord,
  type MuseunCoinPaymentRepository,
} from "./museunCoinPayments";
import type { TossPayment } from "./tossPayments";

function payment(overrides: Partial<TossPayment> = {}): TossPayment {
  return {
    paymentKey: "pay_demo",
    orderId: "mc_order1",
    status: "DONE",
    totalAmount: 10_000,
    balanceAmount: 10_000,
    method: "카드",
    approvedAt: "2026-09-04T00:00:00+09:00",
    cancels: [],
    ...overrides,
  };
}

function setup() {
  const orders = new Map<string, MuseunCoinPaymentOrderRecord>();
  let sequence = 0;
  const repo: MuseunCoinPaymentRepository = {
    async createOrder(input) {
      const row: MuseunCoinPaymentOrderRecord = {
        ...input,
        status: "ready",
        paymentKey: null,
        method: null,
        failureCode: null,
        failureMessage: null,
        requestedAt: new Date("2026-09-04T00:00:00Z"),
        approvedAt: null,
        canceledAt: null,
        updatedAt: new Date("2026-09-04T00:00:00Z"),
        refundableCoins: 0,
        refundStatus: null,
      };
      orders.set(row.orderId, row);
      return row;
    },
    async getOrder(orderId) {
      return orders.get(orderId) ?? null;
    },
    async listOrders(userId) {
      return [...orders.values()].filter((row) => row.userId === userId);
    },
    async claimForConfirmation({ orderId, userId, paymentKey }) {
      const row = orders.get(orderId);
      if (!row || row.userId !== userId || row.status !== "ready") return null;
      const next = { ...row, status: "confirming" as const, paymentKey };
      orders.set(orderId, next);
      return next;
    },
    async completePaid(orderId, authoritative) {
      const row = orders.get(orderId);
      if (!row) throw new Error("missing_order");
      const next = {
        ...row,
        status: "paid" as const,
        paymentKey: authoritative.paymentKey,
        method: authoritative.method,
        approvedAt: new Date(authoritative.approvedAt!),
        refundableCoins: row.coinAmount,
      };
      orders.set(orderId, next);
      return next;
    },
    async markFailed(orderId, code, message) {
      const row = orders.get(orderId)!;
      const next = { ...row, status: "failed" as const, failureCode: code, failureMessage: message };
      orders.set(orderId, next);
      return next;
    },
    async markReviewRequired(orderId, code, message) {
      const row = orders.get(orderId)!;
      const next = { ...row, status: "review_required" as const, failureCode: code, failureMessage: message };
      orders.set(orderId, next);
      return next;
    },
    async markCanceled(orderId, status) {
      const row = orders.get(orderId)!;
      const next = { ...row, status };
      orders.set(orderId, next);
      return next;
    },
  };
  const toss = {
    confirm: vi.fn(async () => payment()),
    get: vi.fn(async () => payment()),
  };
  const operations = createMuseunCoinPaymentOperations({
    repo,
    toss,
    createOrderId: () => `mc_order${++sequence}`,
  });
  return { operations, orders, toss };
}

describe("Museun Coin payment operations", () => {
  it("uses the server-owned package price and an opaque order id", async () => {
    const { operations } = setup();
    const created = await operations.createOrder("user-1", "coin_1000", "mc_customer");
    expect(created).toMatchObject({
      orderId: "mc_order1",
      amountKrw: 10_000,
      coinAmount: 1_000,
      customerKey: "mc_customer",
      orderName: "무슨 코인 1,000개",
    });
  });

  it("rejects an amount mismatch before calling Toss", async () => {
    const { operations, toss } = setup();
    await operations.createOrder("user-1", "coin_1000", "mc_customer");
    await expect(
      operations.confirmOrder("user-1", {
        orderId: "mc_order1",
        paymentKey: "pay_demo",
        amount: 1,
      }),
    ).rejects.toMatchObject({ code: "amount_mismatch" } satisfies Partial<MuseunCoinPaymentError>);
    expect(toss.confirm).not.toHaveBeenCalled();
  });

  it("grants a completed payment once and replays the paid order", async () => {
    const { operations, toss } = setup();
    await operations.createOrder("user-1", "coin_1000", "mc_customer");
    const input = { orderId: "mc_order1", paymentKey: "pay_demo", amount: 10_000 };
    await expect(operations.confirmOrder("user-1", input)).resolves.toMatchObject({ status: "paid" });
    await expect(operations.confirmOrder("user-1", input)).resolves.toMatchObject({ status: "paid" });
    expect(toss.confirm).toHaveBeenCalledTimes(1);
  });

  it("never exposes another user's order", async () => {
    const { operations } = setup();
    await operations.createOrder("user-1", "coin_1000", "mc_customer");
    await expect(operations.getOrder("user-2", "mc_order1")).rejects.toMatchObject({
      code: "order_not_found",
    });
  });

  it("reconciles a network-ambiguous confirmation from authoritative status", async () => {
    const { operations, toss } = setup();
    await operations.createOrder("user-1", "coin_1000", "mc_customer");
    toss.confirm.mockRejectedValueOnce(Object.assign(new Error("timeout"), { ambiguous: true }));
    await expect(
      operations.confirmOrder("user-1", {
        orderId: "mc_order1",
        paymentKey: "pay_demo",
        amount: 10_000,
      }),
    ).resolves.toMatchObject({ status: "paid" });
    expect(toss.get).toHaveBeenCalledWith("pay_demo");
  });
});
