import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(),
  access: vi.fn(),
  config: vi.fn(),
  getOrder: vi.fn(),
  record: vi.fn(),
}));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/museunCoinShopAccess", () => ({ canAccessMuseunCoinShop: mocks.access }));
vi.mock("@/lib/server/museunCoinPaymentConfig", () => ({ readMuseunCoinPaymentConfig: mocks.config }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/server/economyLog", () => ({ recordEconomyEventSoon: mocks.record }));
vi.mock("@/lib/server/museunCoinPayments", () => {
  class MuseunCoinPaymentError extends Error {
    constructor(
      public code: string,
      public status = 400,
    ) {
      super(code);
    }
  }
  return { getPaymentOrderForUser: mocks.getOrder, MuseunCoinPaymentError };
});

import { MuseunCoinPaymentError } from "@/lib/server/museunCoinPayments";
import { POST } from "./route";

function post(body: unknown, orderId = "mc_order") {
  return POST(
    new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ orderId }) },
  );
}

describe("checkout steps route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN", "true");
    mocks.ensureUser.mockResolvedValue("u1");
    mocks.access.mockResolvedValue(true);
    mocks.config.mockReturnValue({ mode: "test", clientKey: "test_ck", secretKey: "test_sk" });
    mocks.getOrder.mockResolvedValue({ orderId: "mc_order", packageId: "coin_1000", amountKrw: 10_000 });
  });

  it("결제가 꺼져 있으면 404다", async () => {
    mocks.config.mockReturnValue(null);
    expect((await post({ step: "window_opened" })).status).toBe(404);
  });

  it("내 주문의 단계와 오류 코드를 기록한다", async () => {
    const response = await post({ step: "fail_redirect", code: "PAY_PROCESS_CANCELED" });

    expect(response.status).toBe(200);
    expect(mocks.getOrder).toHaveBeenCalledWith("u1", "mc_order");
    expect(mocks.record).toHaveBeenCalledWith({
      userId: "u1",
      eventType: "payment.checkout.fail_redirect",
      itemKind: "museun_coin_order",
      itemId: "mc_order",
      detail: { packageId: "coin_1000", amountKrw: 10_000, code: "PAY_PROCESS_CANCELED" },
    });
  });

  it("코드 모양이 아닌 글은 기록에서 뺀다", async () => {
    await post({ step: "request_error", code: "결제창 오류 <b>" });

    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { packageId: "coin_1000", amountKrw: 10_000 } }),
    );
  });

  it("모르는 단계는 거절하고 기록하지 않는다", async () => {
    expect((await post({ step: "paid" })).status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("남의 주문이면 기록하지 않는다", async () => {
    mocks.getOrder.mockRejectedValue(new MuseunCoinPaymentError("order_not_found", 404));

    expect((await post({ step: "window_opened" })).status).toBe(404);
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
