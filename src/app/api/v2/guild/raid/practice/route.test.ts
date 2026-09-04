import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureUser, enforceHighCostRateLimit, practiceGuildRaid } = vi.hoisted(
  () => ({
    ensureUser: vi.fn(),
    enforceHighCostRateLimit: vi.fn(),
    practiceGuildRaid: vi.fn(),
  }),
);

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser }));
vi.mock("@/lib/server/highCostRateLimit", () => ({
  enforceHighCostRateLimit,
}));
vi.mock("@/lib/server/guildRaidPractice", () => ({ practiceGuildRaid }));

import { POST } from "./route";

function request() {
  return new Request("http://localhost/api/v2/guild/raid/practice", {
    method: "POST",
  });
}

describe("길드 토벌전 연습 API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureUser.mockResolvedValue("u1");
    enforceHighCostRateLimit.mockReturnValue(null);
  });

  it("로그인하지 않은 요청을 거절한다", async () => {
    ensureUser.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(enforceHighCostRateLimit).not.toHaveBeenCalled();
    expect(practiceGuildRaid).not.toHaveBeenCalled();
  });

  it("고비용 요청 제한 응답을 그대로 반환한다", async () => {
    const limited = Response.json(
      { ok: false, error: "rate_limited" },
      { status: 429 },
    );
    enforceHighCostRateLimit.mockReturnValue(limited);

    const response = await POST(request());

    expect(response).toBe(limited);
    expect(enforceHighCostRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "u1",
      "guildRaidPractice",
    );
    expect(practiceGuildRaid).not.toHaveBeenCalled();
  });

  it.each([
    ["no_guild", 403],
    ["no_character", 400],
    ["bad_boss", 500],
    ["event_ended", 410],
  ])("%s 오류를 HTTP %i로 매핑한다", async (error, status) => {
    practiceGuildRaid.mockResolvedValue({ ok: false, error });

    const response = await POST(request());

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ ok: false, error });
  });

  it("서버가 계산한 일회성 연습 결과를 반환한다", async () => {
    practiceGuildRaid.mockResolvedValue({
      ok: true,
      practice: true,
      bossKind: "mountain_chief_hard",
      damageDealt: 1_234,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      practice: true,
      damageDealt: 1_234,
    });
    expect(practiceGuildRaid).toHaveBeenCalledWith({ userId: "u1" });
  });
});
