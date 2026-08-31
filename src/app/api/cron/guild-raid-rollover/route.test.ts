import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireCronAuth, rolloverGuildRaids } = vi.hoisted(() => ({
  requireCronAuth: vi.fn(),
  rolloverGuildRaids: vi.fn(),
}));

vi.mock("@/lib/server/cronAuth", () => ({ requireCronAuth }));
vi.mock("@/lib/server/guildRaidLifecycle", () => ({ rolloverGuildRaids }));

import { GET } from "./route";

describe("길드 토벌전 롤오버 cron", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cron 인증 실패 응답을 그대로 반환한다", async () => {
    requireCronAuth.mockReturnValue(Response.json({ ok: false }, { status: 401 }));
    const response = await GET(new Request("http://localhost"));
    expect(response.status).toBe(401);
    expect(rolloverGuildRaids).not.toHaveBeenCalled();
  });

  it("멱등 롤오버 결과를 반환한다", async () => {
    requireCronAuth.mockReturnValue(null);
    rolloverGuildRaids.mockResolvedValue({ settled: 1, eventId: "guild-raid:2026-08-17" });
    const response = await GET(new Request("http://localhost"));
    expect(await response.json()).toEqual({
      ok: true,
      settled: 1,
      eventId: "guild-raid:2026-08-17",
    });
  });
});
