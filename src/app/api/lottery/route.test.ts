import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureUser, resolveActor, getSnapshot, purchase, recordAbuse } = vi.hoisted(
  () => ({
    ensureUser: vi.fn(),
    resolveActor: vi.fn(),
    getSnapshot: vi.fn(),
    purchase: vi.fn(),
    recordAbuse: vi.fn(),
  }),
);

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser }));
vi.mock("@/lib/server/resolveActor", () => ({ resolveActor }));
vi.mock("@/lib/server/lotteryService", () => ({
  getLotterySnapshot: getSnapshot,
  purchaseLotteryTickets: purchase,
}));
vi.mock("@/lib/server/abuseLog", () => ({
  clientIpFromRequest: vi.fn(() => "127.0.0.1"),
  recordAbuseEventSoon: recordAbuse,
}));

import { GET, POST } from "./route";

function post(body: unknown) {
  return new Request("http://test/api/lottery", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/lottery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureUser.mockResolvedValue("user-1");
    resolveActor.mockResolvedValue({ name: "모험가" });
  });

  it("로그인하지 않은 조회를 거부한다", async () => {
    ensureUser.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(getSnapshot).not.toHaveBeenCalled();
  });

  it("서버가 해석한 캐릭터 이름과 멱등 요청키로 구매한다", async () => {
    purchase.mockResolvedValue({
      ok: true,
      replayed: false,
      purchasedTickets: 3,
      amountPaid: 450_000,
      snapshot: { round: { id: 1 } },
    });
    const response = await POST(
      post({ ticketCount: 3, requestId: "request-123", actorName: "관리자" }),
    );
    expect(response.status).toBe(200);
    expect(purchase).toHaveBeenCalledWith({
      userId: "user-1",
      actorName: "모험가",
      ticketCount: 3,
      requestId: "request-123",
    });
  });

  it("구매 연타는 429와 abuse 기록을 남긴다", async () => {
    purchase.mockResolvedValue({ ok: false, error: "purchase_rate_limited" });
    const response = await POST(post({ ticketCount: 1, requestId: "request-123" }));
    expect(response.status).toBe(429);
    expect(recordAbuse).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: "lottery.purchase",
        reason: "rate_limited",
      }),
    );
  });

  it("회차 최대 구매량 초과는 남은 장수와 함께 거부한다", async () => {
    purchase.mockResolvedValue({
      ok: false,
      error: "round_ticket_limit",
      remainingTickets: 2,
    });
    const response = await POST(post({ ticketCount: 3, requestId: "request-123" }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "round_ticket_limit",
      remainingTickets: 2,
    });
  });
});
