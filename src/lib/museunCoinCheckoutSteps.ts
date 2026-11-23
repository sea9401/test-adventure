// 무슨 코인 결제 단계 기록 — 결제가 어디서 끊기는지 보기 위한 진단용 값. 주문 상태는 바꾸지 않는다.

export const MUSEUN_COIN_CHECKOUT_STEPS = [
  /** 결제창이 열렸다. */
  "window_opened",
  /** 결제창에서 결제하기를 눌렀다. */
  "payment_requested",
  /** 결제창을 닫았다. */
  "window_closed",
  /** 결제 요청이 오류로 끝났다. */
  "request_error",
  /** 결제 실패 화면으로 돌아왔다. */
  "fail_redirect",
] as const;

export type MuseunCoinCheckoutStep = (typeof MUSEUN_COIN_CHECKOUT_STEPS)[number];

export function isMuseunCoinCheckoutStep(
  value: unknown,
): value is MuseunCoinCheckoutStep {
  return (
    typeof value === "string" &&
    (MUSEUN_COIN_CHECKOUT_STEPS as readonly string[]).includes(value)
  );
}

/** 결제 대행사의 오류 코드만 받는다(`PAY_PROCESS_CANCELED` 같은 값). 그 밖의 글은 버린다. */
export function sanitizeCheckoutCode(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,60}$/.test(value)
    ? value
    : null;
}

export function museunCoinCheckoutEventType(step: MuseunCoinCheckoutStep): string {
  return `payment.checkout.${step}`;
}
