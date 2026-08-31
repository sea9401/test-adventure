import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureUser, enforceUserAndIpRateLimit, attackGuildRaid } = vi.hoisted(() => ({
  ensureUser: vi.fn(),
  enforceUserAndIpRateLimit: vi.fn(),
  attackGuildRaid: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit }));
vi.mock("@/lib/server/guildRaidAttack", async (original) => ({
  ...(await original()),
  attackGuildRaid,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/v2/guild/raid/attack", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("길드 토벌전 공격 API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureUser.mockResolvedValue("u1");
    enforceUserAndIpRateLimit.mockReturnValue(null);
  });

  it("요청 식별자를 검증한다", async () => {
    const response = await POST(request({ requestId: "short" }));
    expect(response.status).toBe(400);
    expect(attackGuildRaid).not.toHaveBeenCalled();
  });

  it.each([
    ["no_guild", 403],
    ["guild_locked", 409],
    ["daily_limit", 429],
    ["event_ended", 410],
  ])("%s 오류를 HTTP %i로 매핑한다", async (error, status) => {
    attackGuildRaid.mockResolvedValue({ ok: false, error });
    const response = await POST(request({ requestId: "12345678-abcd" }));
    expect(response.status).toBe(status);
  });

  it("멱등 재요청의 기존 공격 결과도 성공으로 반환한다", async () => {
    attackGuildRaid.mockResolvedValue({
      ok: true,
      alreadyCommitted: true,
      attackId: 17,
      damageDealt: 500,
    });
    const response = await POST(request({ requestId: "12345678-abcd" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, alreadyCommitted: true, attackId: 17 });
  });
});
