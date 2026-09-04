import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ gate: vi.fn(), email: vi.fn(), audit: vi.fn(), approve: vi.fn(), reject: vi.fn(), list: vi.fn(), config: vi.fn() }));
vi.mock("@/lib/server/isAdmin", () => ({ requireAdminRole: mocks.gate, currentAdminEmail: mocks.email }));
vi.mock("@/lib/server/adminAudit", () => ({ logAdminAction: mocks.audit }));
vi.mock("@/lib/server/museunCoinPaymentConfig", () => ({ readMuseunCoinPaymentConfig: mocks.config }));
vi.mock("@/lib/server/museunCoinRefunds", () => ({ approveMuseunCoinRefund: mocks.approve, rejectMuseunCoinRefund: mocks.reject, listMuseunCoinPaymentOperations: mocks.list }));
vi.mock("@/lib/server/museunCoinPayments", () => ({ reconcilePaymentOrder: vi.fn() }));
import { GET, POST } from "./route";

describe("admin payment API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gate.mockResolvedValue(null);
    mocks.email.mockResolvedValue("admin@example.com");
    mocks.config.mockReturnValue({ mode: "test", clientKey: "test_ck", secretKey: "test_sk" });
    mocks.list.mockResolvedValue({ orders: [], refunds: [] });
    mocks.approve.mockResolvedValue({ id: "mcr_1", status: "completed" });
  });
  it("requires the super role for mutations and audits approval", async () => {
    const response = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ action: "approve_refund", refundId: "mcr_1", coins: 500, reason: "검토 승인" }) }));
    expect(response.status).toBe(200);
    expect(mocks.gate).toHaveBeenCalledWith("super");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ adminEmail: "admin@example.com", action: "museun-coin-payment.refund.approve" }));
  });
  it("returns only safe operation data for admins", async () => {
    expect((await GET(new Request("http://x?query=mc_"))).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ query: "mc_" }));
  });
});
