import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ensureUser: vi.fn(), access: vi.fn(), config: vi.fn(), requestRefund: vi.fn() }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/museunCoinShopAccess", () => ({ canAccessMuseunCoinShop: mocks.access }));
vi.mock("@/lib/server/museunCoinPaymentConfig", () => ({ readMuseunCoinPaymentConfig: mocks.config }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/server/museunCoinRefunds", () => ({
  requestMuseunCoinRefund: mocks.requestRefund,
  MuseunCoinRefundError: class MuseunCoinRefundError extends Error { constructor(public code: string, public status = 400) { super(code); } },
}));
import { POST } from "./route";

describe("user refund route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureUser.mockResolvedValue("u1");
    mocks.access.mockResolvedValue(true);
    mocks.config.mockReturnValue({ mode: "test", clientKey: "test_ck", secretKey: "test_sk" });
    mocks.requestRefund.mockResolvedValue({ id: "mcr_1", status: "completed" });
  });
  it("requests a refund for the authenticated owner", async () => {
    const response = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ orderId: "mc_order", reason: "단순 변심" }) }));
    expect(response.status).toBe(200);
    expect(mocks.requestRefund).toHaveBeenCalledWith("u1", { orderId: "mc_order", reason: "단순 변심" }, expect.anything());
  });
  it("rejects an empty reason", async () => {
    const response = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ orderId: "mc_order", reason: "" }) }));
    expect(response.status).toBe(400);
  });
});
