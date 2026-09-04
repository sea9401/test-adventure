import { describe, expect, it, vi } from "vitest";
import {
  TossPaymentsError,
  createTossPaymentsClient,
} from "./tossPayments";

const DONE_PAYMENT = {
  paymentKey: "pay_key/encoded",
  orderId: "mc_order_123",
  status: "DONE",
  totalAmount: 10_000,
  balanceAmount: 10_000,
  method: "카드",
  approvedAt: "2026-09-04T09:00:00+09:00",
  cancels: null,
};

describe("Toss Payments client", () => {
  it("confirms with Basic auth, JSON, and an idempotency key", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json(DONE_PAYMENT, { status: 200 }),
    );
    const client = createTossPaymentsClient({
      secretKey: "test_sk_demo",
      fetchImpl,
    });

    const payment = await client.confirm({
      paymentKey: "pay_key/encoded",
      orderId: "mc_order_123",
      amount: 10_000,
      idempotencyKey: "confirm-mc_order_123",
    });

    expect(payment.status).toBe("DONE");
    expect(payment.cancels).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.tosspayments.com/v1/payments/confirm",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from("test_sk_demo:").toString("base64")}`,
          "Content-Type": "application/json",
          "Idempotency-Key": "confirm-mc_order_123",
        }),
      }),
    );
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      paymentKey: "pay_key/encoded",
      orderId: "mc_order_123",
      amount: 10_000,
    });
  });

  it("URL-encodes payment keys for lookup", async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        Response.json(DONE_PAYMENT),
    );
    const client = createTossPaymentsClient({
      secretKey: "test_sk_demo",
      fetchImpl,
    });

    await client.get("pay_key/encoded");

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://api.tosspayments.com/v1/payments/pay_key%2Fencoded",
    );
  });

  it("sends bounded partial cancellation data", async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({
        ...DONE_PAYMENT,
        status: "PARTIAL_CANCELED",
        balanceAmount: 5_000,
        cancels: [
          {
            transactionKey: "cancel_1",
            cancelAmount: 5_000,
            cancelReason: "미사용 코인 환불",
          },
        ],
      }),
    );
    const client = createTossPaymentsClient({
      secretKey: "test_sk_demo",
      fetchImpl,
    });

    const payment = await client.cancel({
      paymentKey: "pay_key/encoded",
      cancelReason: "미사용 코인 환불",
      cancelAmount: 5_000,
      idempotencyKey: "refund-1",
    });

    expect(payment.status).toBe("PARTIAL_CANCELED");
    expect(payment.cancels[0]).toEqual({
      transactionKey: "cancel_1",
      cancelAmount: 5_000,
      cancelReason: "미사용 코인 환불",
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://api.tosspayments.com/v1/payments/pay_key%2Fencoded/cancel",
    );
  });

  it("classifies API failures and ambiguous network failures", async () => {
    const rejected = createTossPaymentsClient({
      secretKey: "test_sk_demo",
      fetchImpl: vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
        Response.json(
          { code: "REJECT_CARD_COMPANY", message: "카드 거절" },
          { status: 400 },
        ),
      ),
    });
    await expect(
      rejected.confirm({
        paymentKey: "pay",
        orderId: "order",
        amount: 10_000,
        idempotencyKey: "confirm-order",
      }),
    ).rejects.toMatchObject({
      name: "TossPaymentsError",
      code: "REJECT_CARD_COMPANY",
      status: 400,
      ambiguous: false,
    });

    const ambiguous = createTossPaymentsClient({
      secretKey: "test_sk_demo",
      fetchImpl: vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
        throw new TypeError("network down");
      }),
    });
    await expect(ambiguous.get("pay")).rejects.toEqual(
      expect.objectContaining({
        name: "TossPaymentsError",
        code: "NETWORK_ERROR",
        ambiguous: true,
      }) as TossPaymentsError,
    );
  });
});
