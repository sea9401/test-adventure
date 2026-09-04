// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { paymentFailureMessage, paymentStatusMessage } from "./PaymentResultView";

describe("payment result copy", () => {
  it("does not echo arbitrary Toss failure messages", () => {
    expect(paymentFailureMessage("PAY_PROCESS_CANCELED")).toContain("취소");
    expect(paymentFailureMessage("UNKNOWN_ATTACK_TEXT")).toBe("결제를 완료하지 못했습니다.");
  });
  it("shows success only for paid orders", () => {
    expect(paymentStatusMessage("paid").tone).toBe("success");
    expect(paymentStatusMessage("confirming").tone).toBe("pending");
    expect(paymentStatusMessage("review_required").tone).toBe("pending");
  });
});
