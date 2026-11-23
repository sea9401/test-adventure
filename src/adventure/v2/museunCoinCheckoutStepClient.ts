"use client";

import type { MuseunCoinCheckoutStep } from "@/lib/museunCoinCheckoutSteps";

/** 결제 대행사 SDK가 던진 오류에서 코드만 꺼낸다. */
export function checkoutErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

/** 결제 단계를 서버에 남긴다. 진단용이라 실패해도 결제 흐름을 막지 않는다. */
export function reportCheckoutStep(
  orderId: string | null,
  step: MuseunCoinCheckoutStep,
  code?: string | null,
): void {
  if (!orderId) return;
  void fetch(
    `/api/v2/museun-coin-payments/orders/${encodeURIComponent(orderId)}/steps`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step, ...(code ? { code } : {}) }),
      // 다른 화면으로 넘어가는 중에도 전송이 끊기지 않게 한다.
      keepalive: true,
    },
  ).catch(() => undefined);
}
