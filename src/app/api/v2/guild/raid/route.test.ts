import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureUser, readGuildRaidState } = vi.hoisted(() => ({
  ensureUser: vi.fn(),
  readGuildRaidState: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser }));
vi.mock("@/lib/server/guildRaidRead", () => ({ readGuildRaidState }));

import { GET } from "./route";

function request(query = "") {
  return new Request(`http://localhost/api/v2/guild/raid${query}`);
}

describe("길드 토벌전 상태 API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureUser.mockResolvedValue("u1");
  });

  it("인증되지 않은 요청을 거절한다", async () => {
    ensureUser.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
  });

  it("길드가 없으면 토벌전 접근을 거절한다", async () => {
    readGuildRaidState.mockResolvedValue({ ok: false, error: "no_guild" });
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "no_guild" });
  });

  it("서버가 계산한 토벌전 상태를 그대로 반환한다", async () => {
    readGuildRaidState.mockResolvedValue({ ok: true, event: { stage: 3 } });
    const response = await GET(request("?leaderboardPage=3&recentPage=2"));
    expect(response.status).toBe(200);
    expect(readGuildRaidState).toHaveBeenCalledWith("u1", expect.any(Date), {
      leaderboardPage: "3",
      recentPage: "2",
    });
    expect(await response.json()).toMatchObject({ ok: true, event: { stage: 3 } });
  });
});
