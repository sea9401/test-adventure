import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(),
  access: vi.fn(),
  config: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  customer: vi.fn(),
}));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/museunCoinShopAccess", () => ({ canAccessMuseunCoinShop: mocks.access }));
vi.mock("@/lib/server/museunCoinPaymentConfig", () => ({ readMuseunCoinPaymentConfig: mocks.config }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/server/museunCoinPayments", () => ({
  createPaymentOrder: mocks.create,
  listPaymentOrdersForUser: mocks.list,
  getPaymentCustomerKey: mocks.customer,
  MuseunCoinPaymentError: class extends Error {},
}));

import { GET, POST } from "./route";

describe("payment orders route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN", "true");
    mocks.ensureUser.mockResolvedValue("u1");
    mocks.access.mockResolvedValue(true);
    mocks.config.mockReturnValue({ mode: "test", clientKey: "test_ck", secretKey: "test_sk" });
    mocks.customer.mockResolvedValue("mc_customer");
    mocks.create.mockResolvedValue({ orderId: "mc_order", amountKrw: 10_000 });
    mocks.list.mockResolvedValue([]);
  });

  it("returns 404 while payment mode is disabled", async () => {
    mocks.config.mockReturnValue(null);
    expect((await POST(new Request("http://x", { method: "POST", body: "{}" })))!.status).toBe(404);
  });

  it("creates an order from package id only", async () => {
    const response = await POST(new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packageId: "coin_1000", amount: 1 }),
    }));
    expect(response!.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith("u1", "coin_1000", "mc_customer", expect.objectContaining({ clientKey: "test_ck" }));
  });

  it("lists only through the authenticated user scope", async () => {
    expect((await GET(new Request("http://x")))!.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith("u1");
  });
});
