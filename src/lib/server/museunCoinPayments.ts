import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { MUSEUN_COIN_PACKAGES } from "@/adventure/data/v2/adventureSupport";
import { db } from "@/db";
import {
  museunCoinPaidLots,
  museunCoinPaymentOrders,
  museunCoinRefundRequests,
  type MuseunCoinPaymentOrderStatus,
} from "@/db/schema";
import {
  grantPaidMuseunCoins,
  lockMuseunCoinAccount,
} from "./museunCoinAccount";
import {
  createTossPaymentsClient,
  TossPaymentsError,
  type TossPayment,
} from "./tossPayments";
import type { MuseunCoinPaymentConfig } from "./museunCoinPaymentConfig";

type PackageId = (typeof MUSEUN_COIN_PACKAGES)[number]["id"];

export type MuseunCoinPaymentOrderRecord = {
  orderId: string;
  userId: string | null;
  packageId: string;
  coinAmount: number;
  amountKrw: number;
  status: MuseunCoinPaymentOrderStatus;
  paymentKey: string | null;
  method: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  requestedAt: Date;
  approvedAt: Date | null;
  canceledAt: Date | null;
  updatedAt: Date;
  refundableCoins: number;
  refundStatus: string | null;
};

export type MuseunCoinPaymentOrderDto = {
  orderId: string;
  packageId: string;
  orderName: string;
  coinAmount: number;
  amountKrw: number;
  status: MuseunCoinPaymentOrderStatus;
  method: string | null;
  requestedAt: string;
  approvedAt: string | null;
  canceledAt: string | null;
  refundableCoins: number;
  refundStatus: string | null;
};

export type MuseunCoinPaymentRepository = {
  createOrder(input: {
    orderId: string;
    userId: string;
    packageId: PackageId;
    coinAmount: number;
    amountKrw: number;
  }): Promise<MuseunCoinPaymentOrderRecord>;
  getOrder(orderId: string): Promise<MuseunCoinPaymentOrderRecord | null>;
  getOrderByPaymentKey?(paymentKey: string): Promise<MuseunCoinPaymentOrderRecord | null>;
  listOrders(userId: string): Promise<MuseunCoinPaymentOrderRecord[]>;
  claimForConfirmation(input: {
    orderId: string;
    userId: string;
    paymentKey: string;
  }): Promise<MuseunCoinPaymentOrderRecord | null>;
  completePaid(orderId: string, payment: TossPayment): Promise<MuseunCoinPaymentOrderRecord>;
  markFailed(orderId: string, code: string, message: string): Promise<MuseunCoinPaymentOrderRecord>;
  markReviewRequired(orderId: string, code: string, message: string): Promise<MuseunCoinPaymentOrderRecord>;
  markCanceled(
    orderId: string,
    status: "canceled" | "partially_canceled",
  ): Promise<MuseunCoinPaymentOrderRecord>;
};

type TossConfirmClient = Pick<
  ReturnType<typeof createTossPaymentsClient>,
  "confirm" | "get"
>;

export class MuseunCoinPaymentError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
    this.name = "MuseunCoinPaymentError";
  }
}

function packageById(packageId: string) {
  return MUSEUN_COIN_PACKAGES.find((item) => item.id === packageId) ?? null;
}

function orderName(coinAmount: number) {
  return `무슨 코인 ${coinAmount.toLocaleString("ko-KR")}개`;
}

function toDto(row: MuseunCoinPaymentOrderRecord): MuseunCoinPaymentOrderDto {
  return {
    orderId: row.orderId,
    packageId: row.packageId,
    orderName: orderName(row.coinAmount),
    coinAmount: row.coinAmount,
    amountKrw: row.amountKrw,
    status: row.status,
    method: row.method,
    requestedAt: row.requestedAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    refundableCoins: row.refundableCoins,
    refundStatus: row.refundStatus,
  };
}

function validatePayment(order: MuseunCoinPaymentOrderRecord, payment: TossPayment) {
  return (
    payment.status === "DONE" &&
    payment.orderId === order.orderId &&
    payment.totalAmount === order.amountKrw &&
    payment.balanceAmount === order.amountKrw
  );
}

export function createMuseunCoinPaymentOperations(input: {
  repo: MuseunCoinPaymentRepository;
  toss: TossConfirmClient;
  createOrderId?: () => string;
}) {
  const createOrderId =
    input.createOrderId ?? (() => `mc_${randomUUID().replaceAll("-", "")}`);

  async function ownedOrder(userId: string, orderId: string) {
    const order = await input.repo.getOrder(orderId);
    if (!order || order.userId !== userId) {
      throw new MuseunCoinPaymentError("order_not_found", 404);
    }
    return order;
  }

  async function reconcileKnownOrder(
    order: MuseunCoinPaymentOrderRecord,
    authoritative: TossPayment,
  ) {
    if (
      authoritative.orderId !== order.orderId ||
      authoritative.totalAmount !== order.amountKrw
    ) {
      return input.repo.markReviewRequired(
        order.orderId,
        "payment_mismatch",
        "결제 식별자 또는 금액이 주문과 일치하지 않습니다.",
      );
    }
    if (authoritative.status === "DONE") {
      if (!validatePayment(order, authoritative)) {
        return input.repo.markReviewRequired(
          order.orderId,
          "payment_balance_mismatch",
          "승인 결제 잔액이 주문 금액과 일치하지 않습니다.",
        );
      }
      return input.repo.completePaid(order.orderId, authoritative);
    }
    if (authoritative.status === "CANCELED") {
      return input.repo.markCanceled(order.orderId, "canceled");
    }
    if (authoritative.status === "PARTIAL_CANCELED") {
      return input.repo.markCanceled(order.orderId, "partially_canceled");
    }
    if (authoritative.status === "ABORTED" || authoritative.status === "EXPIRED") {
      return input.repo.markFailed(
        order.orderId,
        authoritative.status.toLowerCase(),
        "결제가 승인되지 않았습니다.",
      );
    }
    return order;
  }

  return {
    async createOrder(
      userId: string,
      packageId: string,
      customerKey: string,
      clientKey?: string,
    ) {
      const selected = packageById(packageId);
      if (!selected) throw new MuseunCoinPaymentError("invalid_package");
      const row = await input.repo.createOrder({
        orderId: createOrderId(),
        userId,
        packageId: selected.id,
        coinAmount: selected.coins,
        amountKrw: selected.priceKrw,
      });
      return {
        ...toDto(row),
        customerKey,
        ...(clientKey ? { clientKey } : {}),
      };
    },

    async getOrder(userId: string, orderId: string) {
      return toDto(await ownedOrder(userId, orderId));
    },

    async listOrders(userId: string) {
      return (await input.repo.listOrders(userId)).map(toDto);
    },

    async confirmOrder(
      userId: string,
      callback: { orderId: string; paymentKey: string; amount: number },
    ) {
      let order = await ownedOrder(userId, callback.orderId);
      if (callback.amount !== order.amountKrw) {
        throw new MuseunCoinPaymentError("amount_mismatch");
      }
      if (order.paymentKey && order.paymentKey !== callback.paymentKey) {
        throw new MuseunCoinPaymentError("payment_key_mismatch", 409);
      }
      if (order.status === "paid") return toDto(order);
      if (order.status !== "ready") return toDto(order);

      const claimed = await input.repo.claimForConfirmation({
        orderId: order.orderId,
        userId,
        paymentKey: callback.paymentKey,
      });
      if (!claimed) return toDto(await ownedOrder(userId, callback.orderId));
      order = claimed;

      let authoritative: TossPayment;
      try {
        authoritative = await input.toss.confirm({
          paymentKey: callback.paymentKey,
          orderId: order.orderId,
          amount: order.amountKrw,
          idempotencyKey: `confirm:${order.orderId}`,
        });
      } catch (error) {
        const ambiguous =
          error instanceof TossPaymentsError ||
          (typeof error === "object" && error !== null && "ambiguous" in error)
            ? Boolean((error as { ambiguous?: unknown }).ambiguous)
            : false;
        if (!ambiguous) {
          const code =
            typeof error === "object" && error !== null && "code" in error
              ? String((error as { code: unknown }).code)
              : "confirm_failed";
          return toDto(
            await input.repo.markFailed(
              order.orderId,
              code.slice(0, 100),
              "결제 승인이 거절되었습니다.",
            ),
          );
        }
        try {
          authoritative = await input.toss.get(callback.paymentKey);
        } catch {
          return toDto(
            await input.repo.markReviewRequired(
              order.orderId,
              "confirmation_ambiguous",
              "결제 승인 상태를 자동 확인하지 못했습니다.",
            ),
          );
        }
      }
      return toDto(await reconcileKnownOrder(order, authoritative));
    },

    async reconcile(reference: { orderId?: string; paymentKey?: string }) {
      const order = reference.orderId
        ? await input.repo.getOrder(reference.orderId)
        : reference.paymentKey && input.repo.getOrderByPaymentKey
          ? await input.repo.getOrderByPaymentKey(reference.paymentKey)
          : null;
      if (!order) return null;
      const paymentKey = order.paymentKey ?? reference.paymentKey;
      if (!paymentKey) return toDto(order);
      try {
        const authoritative = await input.toss.get(paymentKey);
        return toDto(await reconcileKnownOrder(order, authoritative));
      } catch {
        return toDto(order);
      }
    },
  };
}

type OrderRow = typeof museunCoinPaymentOrders.$inferSelect;

function baseRecord(row: OrderRow): MuseunCoinPaymentOrderRecord {
  if (!row.userId) {
    return { ...row, refundableCoins: 0, refundStatus: null };
  }
  return { ...row, refundableCoins: 0, refundStatus: null };
}

async function hydrateOrder(row: OrderRow): Promise<MuseunCoinPaymentOrderRecord> {
  const [lot, refund] = await Promise.all([
    db
      .select({ availableCoins: museunCoinPaidLots.availableCoins })
      .from(museunCoinPaidLots)
      .where(eq(museunCoinPaidLots.orderId, row.orderId))
      .limit(1),
    db
      .select({ status: museunCoinRefundRequests.status })
      .from(museunCoinRefundRequests)
      .where(eq(museunCoinRefundRequests.orderId, row.orderId))
      .orderBy(desc(museunCoinRefundRequests.createdAt))
      .limit(1),
  ]);
  return {
    ...row,
    refundableCoins: lot[0]?.availableCoins ?? 0,
    refundStatus: refund[0]?.status ?? null,
  };
}

function createDrizzlePaymentRepository(): MuseunCoinPaymentRepository {
  async function getRow(orderId: string) {
    return (
      await db
        .select()
        .from(museunCoinPaymentOrders)
        .where(eq(museunCoinPaymentOrders.orderId, orderId))
        .limit(1)
    )[0];
  }

  async function updated(orderId: string) {
    const row = await getRow(orderId);
    if (!row) throw new Error("payment_order_missing");
    return hydrateOrder(row);
  }

  return {
    async createOrder(order) {
      const row = (
        await db.insert(museunCoinPaymentOrders).values(order).returning()
      )[0];
      return baseRecord(row);
    },
    async getOrder(orderId) {
      const row = await getRow(orderId);
      return row ? hydrateOrder(row) : null;
    },
    async getOrderByPaymentKey(paymentKey) {
      const row = (
        await db
          .select()
          .from(museunCoinPaymentOrders)
          .where(eq(museunCoinPaymentOrders.paymentKey, paymentKey))
          .limit(1)
      )[0];
      return row ? hydrateOrder(row) : null;
    },
    async listOrders(userId) {
      const rows = await db
        .select()
        .from(museunCoinPaymentOrders)
        .where(eq(museunCoinPaymentOrders.userId, userId))
        .orderBy(desc(museunCoinPaymentOrders.requestedAt))
        .limit(50);
      return Promise.all(rows.map(hydrateOrder));
    },
    async claimForConfirmation({ orderId, userId, paymentKey }) {
      const row = (
        await db
          .update(museunCoinPaymentOrders)
          .set({ status: "confirming", paymentKey, updatedAt: new Date() })
          .where(
            and(
              eq(museunCoinPaymentOrders.orderId, orderId),
              eq(museunCoinPaymentOrders.userId, userId),
              eq(museunCoinPaymentOrders.status, "ready"),
            ),
          )
          .returning()
      )[0];
      return row ? baseRecord(row) : null;
    },
    async completePaid(orderId, payment) {
      await db.transaction(async (tx) => {
        const row = (
          await tx
            .select()
            .from(museunCoinPaymentOrders)
            .where(eq(museunCoinPaymentOrders.orderId, orderId))
            .for("update")
            .limit(1)
        )[0];
        if (!row || !row.userId) throw new Error("payment_order_missing");
        if (row.status === "paid") return;
        if (
          payment.orderId !== row.orderId ||
          payment.totalAmount !== row.amountKrw ||
          payment.status !== "DONE"
        ) {
          throw new Error("payment_order_mismatch");
        }
        await grantPaidMuseunCoins(tx, {
          userId: row.userId,
          orderId: row.orderId,
          coins: row.coinAmount,
          eventKey: `payment:${payment.paymentKey}`,
        });
        const approvedAt = payment.approvedAt
          ? new Date(payment.approvedAt)
          : new Date();
        await tx
          .update(museunCoinPaymentOrders)
          .set({
            status: "paid",
            paymentKey: payment.paymentKey,
            method: payment.method,
            approvedAt: Number.isNaN(approvedAt.getTime()) ? new Date() : approvedAt,
            failureCode: null,
            failureMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(museunCoinPaymentOrders.orderId, orderId));
      });
      return updated(orderId);
    },
    async markFailed(orderId, code, message) {
      await db
        .update(museunCoinPaymentOrders)
        .set({ status: "failed", failureCode: code, failureMessage: message, updatedAt: new Date() })
        .where(eq(museunCoinPaymentOrders.orderId, orderId));
      return updated(orderId);
    },
    async markReviewRequired(orderId, code, message) {
      await db
        .update(museunCoinPaymentOrders)
        .set({ status: "review_required", failureCode: code, failureMessage: message, updatedAt: new Date() })
        .where(eq(museunCoinPaymentOrders.orderId, orderId));
      return updated(orderId);
    },
    async markCanceled(orderId, status) {
      await db
        .update(museunCoinPaymentOrders)
        .set({ status, canceledAt: status === "canceled" ? new Date() : null, updatedAt: new Date() })
        .where(eq(museunCoinPaymentOrders.orderId, orderId));
      return updated(orderId);
    },
  };
}

function operations(config: MuseunCoinPaymentConfig) {
  return createMuseunCoinPaymentOperations({
    repo: createDrizzlePaymentRepository(),
    toss: createTossPaymentsClient({ secretKey: config.secretKey }),
  });
}

export async function getPaymentCustomerKey(userId: string) {
  return db.transaction(async (tx) => (await lockMuseunCoinAccount(tx, userId)).customerKey);
}

export async function createPaymentOrder(
  userId: string,
  packageId: string,
  customerKey: string,
  config: MuseunCoinPaymentConfig,
) {
  return operations(config).createOrder(userId, packageId, customerKey, config.clientKey);
}

export async function confirmPaymentOrder(
  userId: string,
  callback: { orderId: string; paymentKey: string; amount: number },
  config: MuseunCoinPaymentConfig,
) {
  return operations(config).confirmOrder(userId, callback);
}

export async function getPaymentOrderForUser(userId: string, orderId: string) {
  const repo = createDrizzlePaymentRepository();
  const row = await repo.getOrder(orderId);
  if (!row || row.userId !== userId) throw new MuseunCoinPaymentError("order_not_found", 404);
  return toDto(row);
}

export async function listPaymentOrdersForUser(userId: string) {
  return (await createDrizzlePaymentRepository().listOrders(userId)).map(toDto);
}

export async function reconcilePaymentOrder(
  reference: { orderId?: string; paymentKey?: string },
  config: MuseunCoinPaymentConfig,
) {
  return operations(config).reconcile(reference);
}
