import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  museunCoinPaidLots,
  museunCoinPaymentOrders,
  museunCoinRefundRequests,
  type MuseunCoinPaymentOrderStatus,
  type MuseunCoinRefundStatus,
} from "@/db/schema";
import {
  finalizePaidLotRefund,
  holdPaidLotForRefund,
  releasePaidLotHold,
} from "./museunCoinAccount";
import { createTossPaymentsClient } from "./tossPayments";
import type { MuseunCoinPaymentConfig } from "./museunCoinPaymentConfig";

export type MuseunCoinRefundRecord = {
  id: string;
  orderId: string;
  userId: string | null;
  requestedCoins: number;
  amountKrw: number;
  reason: string;
  status: MuseunCoinRefundStatus;
  processedByEmail: string | null;
  tossTransactionKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
};

export type MuseunCoinRefundContext = {
  order: {
    orderId: string;
    userId: string | null;
    coinAmount: number;
    amountKrw: number;
    status: MuseunCoinPaymentOrderStatus;
    paymentKey: string | null;
  };
  lot: {
    orderId: string;
    userId: string | null;
    grantedCoins: number;
    availableCoins: number;
    heldCoins: number;
  };
};

export type MuseunCoinRefundRepository = {
  getContext(orderId: string): Promise<MuseunCoinRefundContext | null>;
  getRefundContext(
    refundId: string,
  ): Promise<(MuseunCoinRefundContext & { refund: MuseunCoinRefundRecord }) | null>;
  getActiveRefund(orderId: string): Promise<MuseunCoinRefundRecord | null>;
  begin(input: {
    id: string;
    orderId: string;
    userId: string;
    coins: number;
    amountKrw: number;
    reason: string;
    status: "cancel_pending" | "review_required";
    hold: boolean;
  }): Promise<MuseunCoinRefundRecord>;
  prepareApproval(
    refundId: string,
    coins: number,
    amountKrw: number,
    adminEmail: string,
  ): Promise<MuseunCoinRefundRecord>;
  complete(
    refundId: string,
    coins: number,
    transactionKey: string | null,
    canceled: boolean,
  ): Promise<MuseunCoinRefundRecord>;
  failAndRelease(refundId: string, coins: number): Promise<MuseunCoinRefundRecord>;
  markReviewRequired(refundId: string): Promise<MuseunCoinRefundRecord>;
  reject(refundId: string, adminEmail: string): Promise<MuseunCoinRefundRecord>;
};

type TossCancelClient = {
  cancel(input: {
    paymentKey: string;
    cancelReason: string;
    cancelAmount?: number;
    idempotencyKey: string;
  }): Promise<{
    status: string;
    cancels: Array<{ transactionKey: string }>;
  }>;
};

export class MuseunCoinRefundError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
    this.name = "MuseunCoinRefundError";
  }
}

function toDto(row: MuseunCoinRefundRecord) {
  return {
    id: row.id,
    orderId: row.orderId,
    requestedCoins: row.requestedCoins,
    amountKrw: row.amountKrw,
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
  };
}

function refundAmount(order: MuseunCoinRefundContext["order"], coins: number) {
  const numerator = order.amountKrw * coins;
  if (numerator % order.coinAmount !== 0) {
    throw new MuseunCoinRefundError("non_integral_refund_amount");
  }
  return numerator / order.coinAmount;
}

function isAmbiguous(error: unknown) {
  return Boolean(
    typeof error === "object" &&
      error !== null &&
      "ambiguous" in error &&
      (error as { ambiguous?: unknown }).ambiguous,
  );
}

export function createMuseunCoinRefundOperations(input: {
  repo: MuseunCoinRefundRepository;
  toss: TossCancelClient;
  createRefundId?: () => string;
}) {
  const createRefundId =
    input.createRefundId ?? (() => `mcr_${randomUUID().replaceAll("-", "")}`);

  async function cancelHeld(
    context: MuseunCoinRefundContext,
    refund: MuseunCoinRefundRecord,
  ) {
    const paymentKey = context.order.paymentKey;
    if (!paymentKey) throw new MuseunCoinRefundError("payment_key_missing", 409);
    try {
      const full = refund.requestedCoins === context.order.coinAmount;
      const canceled = await input.toss.cancel({
        paymentKey,
        cancelReason: refund.reason,
        ...(!full ? { cancelAmount: refund.amountKrw } : {}),
        idempotencyKey: `refund:${refund.id}`,
      });
      if (canceled.status !== "CANCELED" && canceled.status !== "PARTIAL_CANCELED") {
        return input.repo.markReviewRequired(refund.id);
      }
      return input.repo.complete(
        refund.id,
        refund.requestedCoins,
        canceled.cancels.at(-1)?.transactionKey ?? null,
        canceled.status === "CANCELED",
      );
    } catch (error) {
      if (isAmbiguous(error)) return input.repo.markReviewRequired(refund.id);
      return input.repo.failAndRelease(refund.id, refund.requestedCoins);
    }
  }

  return {
    async request(userId: string, orderId: string, reason: string) {
      const context = await input.repo.getContext(orderId);
      if (!context || context.order.userId !== userId || context.lot.userId !== userId) {
        throw new MuseunCoinRefundError("order_not_found", 404);
      }
      if (context.order.status !== "paid" || !context.order.paymentKey) {
        throw new MuseunCoinRefundError("order_not_refundable", 409);
      }
      const existing = await input.repo.getActiveRefund(orderId);
      if (existing) return toDto(existing);
      const coins = context.lot.availableCoins;
      if (coins <= 0 || context.lot.heldCoins > 0) {
        throw new MuseunCoinRefundError("no_refundable_coins", 409);
      }
      const amountKrw = refundAmount(context.order, coins);
      const untouched = coins === context.lot.grantedCoins;
      const refund = await input.repo.begin({
        id: createRefundId(),
        orderId,
        userId,
        coins,
        amountKrw,
        reason,
        status: untouched ? "cancel_pending" : "review_required",
        hold: untouched,
      });
      if (!untouched) return toDto(refund);
      return toDto(await cancelHeld(context, refund));
    },

    async approve(
      refundId: string,
      coins: number,
      reason: string,
      adminEmail: string,
    ) {
      const context = await input.repo.getRefundContext(refundId);
      if (!context || !context.refund.userId) {
        throw new MuseunCoinRefundError("refund_not_found", 404);
      }
      if (!Number.isSafeInteger(coins) || coins <= 0 || coins > context.lot.availableCoins) {
        throw new MuseunCoinRefundError("invalid_refund_coins");
      }
      if (context.refund.status !== "review_required" && context.refund.status !== "pending") {
        throw new MuseunCoinRefundError("refund_not_reviewable", 409);
      }
      const amountKrw = refundAmount(context.order, coins);
      const prepared = await input.repo.prepareApproval(
        refundId,
        coins,
        amountKrw,
        adminEmail,
      );
      return toDto(
        await cancelHeld(
          { ...context, order: context.order },
          { ...prepared, reason },
        ),
      );
    },

    async reject(refundId: string, adminEmail: string) {
      const context = await input.repo.getRefundContext(refundId);
      if (!context) throw new MuseunCoinRefundError("refund_not_found", 404);
      if (context.refund.status !== "review_required" && context.refund.status !== "pending") {
        throw new MuseunCoinRefundError("refund_not_reviewable", 409);
      }
      return toDto(await input.repo.reject(refundId, adminEmail));
    },
  };
}

function createDrizzleRefundRepository(): MuseunCoinRefundRepository {
  async function refundRow(id: string) {
    return (
      await db
        .select()
        .from(museunCoinRefundRequests)
        .where(eq(museunCoinRefundRequests.id, id))
        .limit(1)
    )[0] ?? null;
  }

  return {
    async getContext(orderId) {
      const [order, lot] = await Promise.all([
        db.select().from(museunCoinPaymentOrders).where(eq(museunCoinPaymentOrders.orderId, orderId)).limit(1),
        db.select().from(museunCoinPaidLots).where(eq(museunCoinPaidLots.orderId, orderId)).limit(1),
      ]);
      if (!order[0] || !lot[0]) return null;
      return { order: order[0], lot: lot[0] };
    },
    async getRefundContext(refundId) {
      const refund = await refundRow(refundId);
      if (!refund) return null;
      const context = await this.getContext(refund.orderId);
      return context ? { refund, ...context } : null;
    },
    async getActiveRefund(orderId) {
      return (
        await db
          .select()
          .from(museunCoinRefundRequests)
          .where(
            and(
              eq(museunCoinRefundRequests.orderId, orderId),
              inArray(museunCoinRefundRequests.status, [
                "pending",
                "cancel_pending",
                "completed",
                "review_required",
              ]),
            ),
          )
          .orderBy(desc(museunCoinRefundRequests.createdAt))
          .limit(1)
      )[0] ?? null;
    },
    async begin(begin) {
      await db.transaction(async (tx) => {
        await tx.insert(museunCoinRefundRequests).values({
          id: begin.id,
          orderId: begin.orderId,
          userId: begin.userId,
          requestedCoins: begin.coins,
          amountKrw: begin.amountKrw,
          reason: begin.reason,
          status: begin.status,
        });
        if (begin.hold) {
          await holdPaidLotForRefund(tx, {
            userId: begin.userId,
            orderId: begin.orderId,
            coins: begin.coins,
            eventKey: `refund-hold:${begin.id}`,
          });
        }
      });
      return (await refundRow(begin.id))!;
    },
    async prepareApproval(refundId, coins, amountKrw, adminEmail) {
      await db.transaction(async (tx) => {
        const row = (
          await tx
            .select()
            .from(museunCoinRefundRequests)
            .where(eq(museunCoinRefundRequests.id, refundId))
            .for("update")
            .limit(1)
        )[0];
        if (!row?.userId) throw new MuseunCoinRefundError("refund_not_found", 404);
        await holdPaidLotForRefund(tx, {
          userId: row.userId,
          orderId: row.orderId,
          coins,
          eventKey: `refund-hold:${refundId}:approval`,
        });
        await tx
          .update(museunCoinRefundRequests)
          .set({ requestedCoins: coins, amountKrw, status: "cancel_pending", processedByEmail: adminEmail, updatedAt: new Date() })
          .where(eq(museunCoinRefundRequests.id, refundId));
      });
      return (await refundRow(refundId))!;
    },
    async complete(refundId, coins, transactionKey, canceled) {
      await db.transaction(async (tx) => {
        const row = (
          await tx.select().from(museunCoinRefundRequests).where(eq(museunCoinRefundRequests.id, refundId)).for("update").limit(1)
        )[0];
        if (!row?.userId) throw new MuseunCoinRefundError("refund_not_found", 404);
        if (row.status === "completed") return;
        await finalizePaidLotRefund(tx, {
          userId: row.userId,
          orderId: row.orderId,
          coins,
          eventKey: `refund-complete:${refundId}`,
        });
        const now = new Date();
        await tx.update(museunCoinRefundRequests).set({ status: "completed", tossTransactionKey: transactionKey, updatedAt: now, processedAt: now }).where(eq(museunCoinRefundRequests.id, refundId));
        await tx.update(museunCoinPaymentOrders).set({ status: canceled ? "canceled" : "partially_canceled", canceledAt: canceled ? now : null, updatedAt: now }).where(eq(museunCoinPaymentOrders.orderId, row.orderId));
      });
      return (await refundRow(refundId))!;
    },
    async failAndRelease(refundId, coins) {
      await db.transaction(async (tx) => {
        const row = (
          await tx.select().from(museunCoinRefundRequests).where(eq(museunCoinRefundRequests.id, refundId)).for("update").limit(1)
        )[0];
        if (!row?.userId) throw new MuseunCoinRefundError("refund_not_found", 404);
        await releasePaidLotHold(tx, { userId: row.userId, orderId: row.orderId, coins, eventKey: `refund-release:${refundId}` });
        await tx.update(museunCoinRefundRequests).set({ status: "failed", updatedAt: new Date(), processedAt: new Date() }).where(eq(museunCoinRefundRequests.id, refundId));
      });
      return (await refundRow(refundId))!;
    },
    async markReviewRequired(refundId) {
      await db.update(museunCoinRefundRequests).set({ status: "review_required", updatedAt: new Date() }).where(eq(museunCoinRefundRequests.id, refundId));
      return (await refundRow(refundId))!;
    },
    async reject(refundId, adminEmail) {
      const now = new Date();
      await db.update(museunCoinRefundRequests).set({ status: "rejected", processedByEmail: adminEmail, processedAt: now, updatedAt: now }).where(eq(museunCoinRefundRequests.id, refundId));
      return (await refundRow(refundId))!;
    },
  };
}

function operations(config: MuseunCoinPaymentConfig) {
  return createMuseunCoinRefundOperations({
    repo: createDrizzleRefundRepository(),
    toss: createTossPaymentsClient({ secretKey: config.secretKey }),
  });
}

export async function requestMuseunCoinRefund(
  userId: string,
  request: { orderId: string; reason: string },
  config: MuseunCoinPaymentConfig,
) {
  return operations(config).request(userId, request.orderId, request.reason);
}

export async function approveMuseunCoinRefund(
  input: { refundId: string; coins: number; reason: string; adminEmail: string },
  config: MuseunCoinPaymentConfig,
) {
  return operations(config).approve(input.refundId, input.coins, input.reason, input.adminEmail);
}

export async function rejectMuseunCoinRefund(input: {
  refundId: string;
  adminEmail: string;
}) {
  return createMuseunCoinRefundOperations({
    repo: createDrizzleRefundRepository(),
    toss: { cancel: async () => { throw new Error("cancel_not_expected"); } },
  }).reject(input.refundId, input.adminEmail);
}

export async function listMuseunCoinPaymentOperations(filter: {
  query?: string;
  status?: string;
}) {
  const [orders, refunds] = await Promise.all([
    db.select().from(museunCoinPaymentOrders).orderBy(desc(museunCoinPaymentOrders.requestedAt)).limit(200),
    db.select().from(museunCoinRefundRequests).orderBy(desc(museunCoinRefundRequests.createdAt)).limit(200),
  ]);
  const query = filter.query?.trim().toLowerCase() ?? "";
  const filteredOrders = orders.filter((row) => {
    if (filter.status && row.status !== filter.status) return false;
    if (!query) return true;
    return row.orderId.toLowerCase().includes(query) || row.userId?.toLowerCase().includes(query) || row.packageId.toLowerCase().includes(query);
  });
  const orderIds = new Set(filteredOrders.map((row) => row.orderId));
  return {
    orders: filteredOrders.map((row) => ({
      orderId: row.orderId,
      userId: row.userId,
      packageId: row.packageId,
      coinAmount: row.coinAmount,
      amountKrw: row.amountKrw,
      status: row.status,
      method: row.method,
      requestedAt: row.requestedAt.toISOString(),
      approvedAt: row.approvedAt?.toISOString() ?? null,
    })),
    refunds: refunds
      .filter((row) => orderIds.has(row.orderId) || (!filter.status && !query))
      .map((row) => ({
        id: row.id,
        orderId: row.orderId,
        userId: row.userId,
        requestedCoins: row.requestedCoins,
        amountKrw: row.amountKrw,
        reason: row.reason,
        status: row.status,
        processedByEmail: row.processedByEmail,
        createdAt: row.createdAt.toISOString(),
      })),
  };
}
