import { describe, expect, it, vi } from "vitest";
import {
  createMuseunCoinRefundOperations,
  MuseunCoinRefundError,
  type MuseunCoinRefundContext,
  type MuseunCoinRefundRecord,
  type MuseunCoinRefundRepository,
} from "./museunCoinRefunds";

function setup(options: { available?: number; granted?: number } = {}) {
  const context: MuseunCoinRefundContext = {
    order: {
      orderId: "mc_order",
      userId: "u1",
      coinAmount: 1_000,
      amountKrw: 10_000,
      status: "paid",
      paymentKey: "pay_key",
    },
    lot: {
      orderId: "mc_order",
      userId: "u1",
      grantedCoins: options.granted ?? 1_000,
      availableCoins: options.available ?? 1_000,
      heldCoins: 0,
    },
  };
  let refund: MuseunCoinRefundRecord | null = null;
  const repo: MuseunCoinRefundRepository = {
    getContext: vi.fn(async () => context),
    getRefundContext: vi.fn(async () => (refund ? { refund, ...context } : null)),
    getActiveRefund: vi.fn(async () => refund),
    begin: vi.fn(async (input) => {
      refund = {
        id: input.id,
        orderId: input.orderId,
        userId: input.userId,
        requestedCoins: input.coins,
        amountKrw: input.amountKrw,
        reason: input.reason,
        status: input.status,
        processedByEmail: null,
        tossTransactionKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        processedAt: null,
      };
      if (input.hold) {
        context.lot.availableCoins -= input.coins;
        context.lot.heldCoins += input.coins;
      }
      return refund;
    }),
    prepareApproval: vi.fn(async (refundId, coins, amountKrw, adminEmail) => {
      context.lot.availableCoins -= coins;
      context.lot.heldCoins += coins;
      refund = { ...refund!, id: refundId, requestedCoins: coins, amountKrw, status: "cancel_pending", processedByEmail: adminEmail };
      return refund;
    }),
    complete: vi.fn(async (_refundId, coins, transactionKey) => {
      context.lot.heldCoins -= coins;
      refund = { ...refund!, status: "completed", tossTransactionKey: transactionKey, processedAt: new Date() };
      return refund;
    }),
    failAndRelease: vi.fn(async (_refundId, coins) => {
      context.lot.heldCoins -= coins;
      context.lot.availableCoins += coins;
      refund = { ...refund!, status: "failed" };
      return refund;
    }),
    markReviewRequired: vi.fn(async () => {
      refund = { ...refund!, status: "review_required" };
      return refund;
    }),
    reject: vi.fn(async (_id, adminEmail) => {
      refund = { ...refund!, status: "rejected", processedByEmail: adminEmail };
      return refund;
    }),
  };
  const toss = {
    cancel: vi.fn(async () => ({
      status: "CANCELED" as const,
      cancels: [{ transactionKey: "cancel_tx", cancelAmount: 10_000, cancelReason: "test" }],
    })),
  };
  return {
    operations: createMuseunCoinRefundOperations({ repo, toss, createRefundId: () => "mcr_1" }),
    repo,
    toss,
    context,
  };
}

describe("Museun Coin refund operations", () => {
  it("fully cancels an untouched paid lot after holding its coins", async () => {
    const { operations, repo, toss, context } = setup();
    await expect(operations.request("u1", "mc_order", "단순 변심")).resolves.toMatchObject({ status: "completed" });
    expect(repo.begin).toHaveBeenCalledWith(expect.objectContaining({ hold: true, coins: 1_000, amountKrw: 10_000 }));
    expect(toss.cancel).toHaveBeenCalledWith(expect.objectContaining({ paymentKey: "pay_key", idempotencyKey: "refund:mcr_1" }));
    expect(context.lot.heldCoins).toBe(0);
  });

  it("sends a partially used lot to review without calling Toss", async () => {
    const { operations, toss } = setup({ available: 600 });
    await expect(operations.request("u1", "mc_order", "부분 사용")).resolves.toMatchObject({ status: "review_required", requestedCoins: 600 });
    expect(toss.cancel).not.toHaveBeenCalled();
  });

  it("keeps held coins when a cancel result is ambiguous", async () => {
    const { operations, toss, context } = setup();
    toss.cancel.mockRejectedValueOnce(Object.assign(new Error("timeout"), { ambiguous: true }));
    await expect(operations.request("u1", "mc_order", "네트워크 확인")).resolves.toMatchObject({ status: "review_required" });
    expect(context.lot.heldCoins).toBe(1_000);
  });

  it("releases held coins when Toss definitively rejects cancellation", async () => {
    const { operations, toss, context } = setup();
    toss.cancel.mockRejectedValueOnce(Object.assign(new Error("reject"), { ambiguous: false }));
    await expect(operations.request("u1", "mc_order", "취소 거절")).resolves.toMatchObject({ status: "failed" });
    expect(context.lot.availableCoins).toBe(1_000);
  });

  it("rejects access by a different owner", async () => {
    const { operations } = setup();
    await expect(operations.request("u2", "mc_order", "다른 사용자")).rejects.toMatchObject({ code: "order_not_found" } satisfies Partial<MuseunCoinRefundError>);
  });
});
