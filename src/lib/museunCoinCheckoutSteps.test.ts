import { describe, expect, it } from "vitest";
import {
  isMuseunCoinCheckoutStep,
  museunCoinCheckoutEventType,
  sanitizeCheckoutCode,
} from "./museunCoinCheckoutSteps";

describe("무슨 코인 결제 단계 기록", () => {
  it("정해 둔 단계만 받는다", () => {
    expect(isMuseunCoinCheckoutStep("window_opened")).toBe(true);
    expect(isMuseunCoinCheckoutStep("fail_redirect")).toBe(true);
    expect(isMuseunCoinCheckoutStep("paid")).toBe(false);
    expect(isMuseunCoinCheckoutStep(undefined)).toBe(false);
  });

  it("오류 코드 모양만 남기고 그 밖의 글은 버린다", () => {
    expect(sanitizeCheckoutCode("PAY_PROCESS_CANCELED")).toBe("PAY_PROCESS_CANCELED");
    expect(sanitizeCheckoutCode("사용자가 결제를 취소하였습니다")).toBeNull();
    expect(sanitizeCheckoutCode("A".repeat(61))).toBeNull();
    expect(sanitizeCheckoutCode("<script>")).toBeNull();
    expect(sanitizeCheckoutCode(null)).toBeNull();
  });

  it("단계별 기록 이름을 만든다", () => {
    expect(museunCoinCheckoutEventType("payment_requested")).toBe(
      "payment.checkout.payment_requested",
    );
  });
});
