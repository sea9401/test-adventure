import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureUser, selectGuildRaidBoss } = vi.hoisted(() => ({
  ensureUser: vi.fn(),
  selectGuildRaidBoss: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser }));
vi.mock("@/lib/server/guildRaidSelect", () => ({ selectGuildRaidBoss }));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: () => null,
}));

import { POST } from "./route";

function request(body: string) {
  return new Request("http://localhost/api/v2/guild/raid/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("길드 토벌전 보스 선택 API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureUser.mockResolvedValue("u1");
  });

  it("인증되지 않은 요청을 거절한다", async () => {
    ensureUser.mockResolvedValue(null);
    const response = await POST(request("{}"));
    expect(response.status).toBe(401);
  });

  it("JSON이 아니면 400을 돌려준다", async () => {
    const response = await POST(request("nope"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_json" });
  });

  it.each([
    ["no_guild", 403],
    ["forbidden", 403],
    ["event_ended", 410],
    ["bad_boss", 400],
    ["already_selected", 409],
  ] as const)("%s 오류는 %i 상태로 돌려준다", async (error, status) => {
    selectGuildRaidBoss.mockResolvedValue({ ok: false, error });
    const response = await POST(request('{"bossId":"canyon_predator_raid"}'));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ ok: false, error });
  });

  it("요청한 보스를 서비스에 넘기고 결과를 그대로 돌려준다", async () => {
    selectGuildRaidBoss.mockResolvedValue({
      ok: true,
      bossId: "canyon_predator_raid",
      selectedAt: 1,
    });
    const response = await POST(request('{"bossId":"canyon_predator_raid"}'));
    expect(response.status).toBe(200);
    expect(selectGuildRaidBoss).toHaveBeenCalledWith({
      userId: "u1",
      bossId: "canyon_predator_raid",
    });
    expect(await response.json()).toEqual({
      ok: true,
      bossId: "canyon_predator_raid",
      selectedAt: 1,
    });
  });
});
