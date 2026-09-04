import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ensureUser: vi.fn(), access: vi.fn(), config: vi.fn(), confirm: vi.fn() }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/museunCoinShopAccess", () => ({ canAccessMuseunCoinShop: mocks.access }));
vi.mock("@/lib/server/museunCoinPaymentConfig", () => ({ readMuseunCoinPaymentConfig: mocks.config }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/server/museunCoinPayments", () => ({
  confirmPaymentOrder: mocks.confirm,
  MuseunCoinPaymentError: class MuseunCoinPaymentError extends Error {
    constructor(public code: string, public status = 400) { super(code); }
  },
}));
import { POST } from "./route";

describe("payment confirm route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN", "true");
    mocks.ensureUser.mockResolvedValue("u1");
    mocks.access.mockResolvedValue(true);
    mocks.config.mockReturnValue({ mode: "test", clientKey: "test_ck", secretKey: "test_sk" });
    mocks.confirm.mockResolvedValue({ orderId: "mc_order", status: "paid" });
  });

  it("confirms validated callback fields", async () => {
    const response = await POST(new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "mc_order", paymentKey: "pay_key", amount: 10000 }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.confirm).toHaveBeenCalledWith("u1", expect.objectContaining({ orderId: "mc_order", amount: 10000 }), expect.anything());
  });

  it("rejects malformed callback fields without confirming", async () => {
    const response = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ amount: -1 }) }));
    expect(response.status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
