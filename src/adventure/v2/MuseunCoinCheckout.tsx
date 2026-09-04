"use client";

import { useEffect, useRef, useState } from "react";
import { MUSEUN_COIN_PACKAGES } from "@/adventure/data/v2/adventureSupport";
import { SURFACE_INSET } from "@/components/ui/surfaces";

type OrderStatus =
  | "ready"
  | "confirming"
  | "paid"
  | "cancel_pending"
  | "partially_canceled"
  | "canceled"
  | "failed"
  | "review_required";

type PaymentOrder = {
  orderId: string;
  orderName: string;
  coinAmount: number;
  amountKrw: number;
  status: OrderStatus;
  method: string | null;
  requestedAt: string;
  refundableCoins: number;
  refundStatus: string | null;
};

type CreatedOrder = PaymentOrder & {
  customerKey: string;
  clientKey: string;
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  ready: "결제 대기",
  confirming: "승인 확인 중",
  paid: "결제 완료",
  cancel_pending: "취소 확인 중",
  partially_canceled: "부분 환불",
  canceled: "환불 완료",
  failed: "결제 실패",
  review_required: "확인 필요",
};

export function MuseunCoinCheckout() {
  const [availability, setAvailability] = useState<"loading" | "disabled" | "enabled">("loading");
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [busyPackage, setBusyPackage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refundOrderId, setRefundOrderId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    let alive = true;
    void fetch("/api/v2/museun-coin-payments/orders", { cache: "no-store" })
      .then(async (response) => {
        if (!alive) return;
        if (response.status === 404) {
          setAvailability("disabled");
          return;
        }
        if (!response.ok) throw new Error("history_failed");
        const body = (await response.json()) as { orders?: PaymentOrder[] };
        setOrders(Array.isArray(body.orders) ? body.orders : []);
        setAvailability("enabled");
      })
      .catch(() => {
        if (alive) setAvailability("disabled");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function startPayment(packageId: string) {
    if (inFlight.current || availability !== "enabled") return;
    inFlight.current = true;
    setBusyPackage(packageId);
    setError(null);
    try {
      const response = await fetch("/api/v2/museun-coin-payments/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const body = (await response.json().catch(() => null)) as
        | ({ ok?: boolean } & Partial<CreatedOrder>)
        | null;
      if (
        !response.ok ||
        !body?.ok ||
        typeof body.orderId !== "string" ||
        typeof body.orderName !== "string" ||
        typeof body.amountKrw !== "number" ||
        typeof body.customerKey !== "string" ||
        typeof body.clientKey !== "string"
      ) {
        throw new Error("order_failed");
      }
      const { orderId, orderName, amountKrw, customerKey, clientKey } = body;
      const { loadTossPayments } = await import("@tosspayments/tosspayments-sdk");
      const toss = await loadTossPayments(clientKey);
      const widgets = toss.widgets({ customerKey });
      await widgets.setAmount({ value: amountKrw, currency: "KRW" });
      const paymentWindow = await widgets.renderPaymentWindow();
      paymentWindow.on("cancel", async () => {
        inFlight.current = false;
        setBusyPackage(null);
      });
      paymentWindow.on("paymentRequest", async () => {
        try {
          await widgets.requestPayment({
            orderId,
            orderName,
            successUrl: `${window.location.origin}/settings/coin-shop/payment/success`,
            failUrl: `${window.location.origin}/settings/coin-shop/payment/fail`,
          });
        } catch {
          await paymentWindow.destroy().catch(() => undefined);
          setError("결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.");
          inFlight.current = false;
          setBusyPackage(null);
        }
      });
    } catch {
      setError("결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.");
      inFlight.current = false;
      setBusyPackage(null);
    }
  }

  async function requestRefund(orderId: string) {
    const reason = refundReason.trim();
    if (reason.length < 2) return;
    setError(null);
    try {
      const response = await fetch("/api/v2/museun-coin-payments/refunds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, reason }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; refund?: { status?: string } }
        | null;
      if (!response.ok || !body?.ok) throw new Error("refund_failed");
      setOrders((current) =>
        current.map((order) =>
          order.orderId === orderId
            ? { ...order, refundStatus: body.refund?.status ?? "review_required" }
            : order,
        ),
      );
      setRefundOrderId(null);
      setRefundReason("");
    } catch {
      setError("환불 요청을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <div className="space-y-5 p-4">
      <div className="grid grid-cols-2 gap-3">
        {MUSEUN_COIN_PACKAGES.map((item) => {
          const busy = busyPackage === item.id;
          return (
            <div key={item.id} className={`${SURFACE_INSET} flex flex-col p-3`}>
              <p className="font-bold tabular-nums">{item.coins.toLocaleString()}코인</p>
              <p className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                {item.priceKrw.toLocaleString()}원
              </p>
              <button
                type="button"
                disabled={availability !== "enabled" || busyPackage !== null}
                onClick={() => void startPayment(item.id)}
                className="ui-game-button mt-3 w-full rounded-md border border-amber-500 bg-amber-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:opacity-100 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
              >
                {availability === "loading"
                  ? "확인 중…"
                  : availability === "disabled"
                    ? "결제 준비 중"
                    : busy
                      ? "결제창 여는 중…"
                      : `${item.priceKrw.toLocaleString()}원 결제`}
              </button>
            </div>
          );
        })}
      </div>

      {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {availability === "enabled" ? (
        <section aria-labelledby="payment-history-title">
          <h3 id="payment-history-title" className="text-sm font-bold">결제 내역</h3>
          {orders.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">아직 결제 내역이 없습니다.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {orders.map((order) => (
                <li key={order.orderId} className={`${SURFACE_INSET} p-3 text-sm`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{order.orderName}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {order.amountKrw.toLocaleString()}원 · {STATUS_LABELS[order.status]}
                      </p>
                    </div>
                    {order.status === "paid" && order.refundableCoins > 0 && !order.refundStatus ? (
                      <button type="button" className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600" onClick={() => setRefundOrderId(order.orderId)}>
                        환불 요청
                      </button>
                    ) : null}
                  </div>
                  {refundOrderId === order.orderId ? (
                    <div className="mt-3 space-y-2">
                      <label className="block text-xs font-medium" htmlFor={`refund-${order.orderId}`}>환불 사유</label>
                      <textarea id={`refund-${order.orderId}`} value={refundReason} onChange={(event) => setRefundReason(event.target.value)} maxLength={500} className="w-full rounded-md border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-600 dark:bg-zinc-900" />
                      <div className="flex justify-end gap-2">
                        <button type="button" className="rounded-md px-2 py-1 text-xs" onClick={() => setRefundOrderId(null)}>취소</button>
                        <button type="button" className="rounded-md bg-amber-500 px-2 py-1 text-xs font-bold text-white disabled:opacity-50" disabled={refundReason.trim().length < 2} onClick={() => void requestRefund(order.orderId)}>접수</button>
                      </div>
                    </div>
                  ) : null}
                  {order.refundStatus ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">환불 상태: {order.refundStatus}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
