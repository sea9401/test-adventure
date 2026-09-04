import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ config: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/lib/server/museunCoinPaymentConfig", () => ({ readMuseunCoinPaymentConfig: mocks.config }));
vi.mock("@/lib/server/museunCoinPayments", () => ({ reconcilePaymentOrder: mocks.reconcile }));
import { POST } from "./route";

describe("Toss webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.mockReturnValue({ mode: "test", clientKey: "test_ck", secretKey: "test_sk" });
    mocks.reconcile.mockResolvedValue(null);
  });

  it("acknowledges supported status events after reconciliation", async () => {
    const response = await POST(new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey: "pay_key", orderId: "mc_order" } }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.reconcile).toHaveBeenCalledWith(expect.objectContaining({ paymentKey: "pay_key", orderId: "mc_order" }), expect.anything());
  });

  it("rejects invalid json and ignores unknown event types", async () => {
    expect((await POST(new Request("http://x", { method: "POST", body: "{" }))).status).toBe(400);
    const ignored = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ eventType: "OTHER", data: {} }) }));
    expect(ignored.status).toBe(200);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});
