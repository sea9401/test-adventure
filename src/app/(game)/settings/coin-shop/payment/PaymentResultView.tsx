"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import type { MuseunCoinPaymentOrderStatus } from "@/db/schema";

export function paymentFailureMessage(code: string | null) {
  if (code === "PAY_PROCESS_CANCELED" || code === "USER_CANCEL") {
    return "결제가 취소되었습니다.";
  }
  if (code === "PAY_PROCESS_ABORTED" || code === "REJECT_CARD_PAYMENT") {
    return "카드 결제가 승인되지 않았습니다. 다른 카드나 결제 수단을 확인해 주세요.";
  }
  return "결제를 완료하지 못했습니다.";
}

export function paymentStatusMessage(status: MuseunCoinPaymentOrderStatus) {
  if (status === "paid") {
    return { tone: "success" as const, title: "결제가 완료되었습니다.", description: "충전한 무슨 코인이 잔액에 반영되었습니다." };
  }
  if (status === "confirming" || status === "review_required") {
    return { tone: "pending" as const, title: "결제 상태를 확인하고 있습니다.", description: "중복 결제 없이 자동으로 확인합니다. 잠시 후 다시 확인해 주세요." };
  }
  return { tone: "error" as const, title: "결제를 완료하지 못했습니다.", description: "청구 여부가 걱정되면 결제 내역에서 주문번호를 확인해 주세요." };
}

type PaymentResultMessage = ReturnType<typeof paymentStatusMessage>;

export function PaymentResultView({ mode }: { mode: "success" | "fail" }) {
  const params = useSearchParams();
  const orderId = params.get("orderId");
  const paymentKey = params.get("paymentKey");
  const amount = Number(params.get("amount"));
  const validSuccessCallback =
    Boolean(orderId && paymentKey) && Number.isSafeInteger(amount) && amount > 0;
  const [message, setMessage] = useState<PaymentResultMessage>(() =>
    mode === "fail"
      ? { tone: "error" as const, title: paymentFailureMessage(params.get("code")), description: "승인되지 않은 결제는 코인으로 지급되지 않습니다." }
      : validSuccessCallback
        ? { tone: "pending" as const, title: "결제 승인을 확인하고 있습니다.", description: "창을 닫지 말고 잠시 기다려 주세요." }
        : paymentStatusMessage("failed"),
  );
  const sent = useRef(false);

  useEffect(() => {
    if (mode !== "success" || sent.current) return;
    sent.current = true;
    if (!validSuccessCallback || !orderId || !paymentKey) return;
    let active = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollAttempts = 0;
    const applyStatus = (status: MuseunCoinPaymentOrderStatus) => {
      if (!active) return;
      setMessage(paymentStatusMessage(status));
      if (
        (status === "confirming" || status === "review_required") &&
        pollAttempts < 10
      ) {
        pollAttempts += 1;
        pollTimer = setTimeout(() => {
          void fetch(`/api/v2/museun-coin-payments/orders/${encodeURIComponent(orderId)}`, {
            cache: "no-store",
          })
            .then(async (response) => {
              const body = (await response.json().catch(() => null)) as
                | { order?: { status?: MuseunCoinPaymentOrderStatus } }
                | null;
              if (body?.order?.status) applyStatus(body.order.status);
            })
            .catch(() => {});
        }, 2_000);
      }
    };
    void fetch("/api/v2/museun-coin-payments/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId, paymentKey, amount }),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { order?: { status?: MuseunCoinPaymentOrderStatus } }
          | null;
        if (!active) return;
        const status = body?.order?.status;
        applyStatus(status ?? "failed");
      })
      .catch(() => {
        if (active) setMessage(paymentStatusMessage("review_required"));
      });
    return () => {
      active = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [amount, mode, orderId, params, paymentKey, validSuccessCallback]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl items-center px-4 py-10">
      <Card padding="lg" className="w-full text-center">
        <p className={message.tone === "success" ? "text-emerald-600 dark:text-emerald-400" : message.tone === "pending" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}>
          {message.tone === "success" ? "결제 완료" : message.tone === "pending" ? "확인 중" : "결제 미완료"}
        </p>
        <h1 className="mt-2 text-xl font-bold">{message.title}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{message.description}</p>
        <Link href="/settings/coin-shop" className="mt-6 inline-flex rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-white">코인 상점으로 돌아가기</Link>
      </Card>
    </main>
  );
}
