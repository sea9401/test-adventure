import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureUser, enforceUserAndIpRateLimit, claimGuildRaidReward } =
  vi.hoisted(() => ({
    ensureUser: vi.fn(),
    enforceUserAndIpRateLimit: vi.fn(),
    claimGuildRaidReward: vi.fn(),
  }));

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit }));
vi.mock("@/lib/server/guildRaidRewardClaim", () => ({ claimGuildRaidReward }));

import { POST } from "./route";

function request() {
  return new Request("http://localhost/api/v2/guild/raid/claim", {
    method: "POST",
  });
}

describe("길드 토벌전 보상 수령 API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureUser.mockResolvedValue("u1");
    enforceUserAndIpRateLimit.mockReturnValue(null);
  });

  it("로그인하지 않은 요청을 거절한다", async () => {
    ensureUser.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(claimGuildRaidReward).not.toHaveBeenCalled();
  });

  it.each([
    ["claim_not_open", 409],
    ["not_settled", 409],
    ["not_eligible", 403],
    ["already_claimed", 409],
    ["reward_expired", 410],
  ])("%s 오류를 HTTP %i로 매핑한다", async (error, status) => {
    claimGuildRaidReward.mockResolvedValue({ ok: false, error });
    const response = await POST(request());
    expect(response.status).toBe(status);
  });

  it("개인 보상 수령 결과를 반환한다", async () => {
    claimGuildRaidReward.mockResolvedValue({
      ok: true,
      rank: 1,
      reward: { gold: 5_000_000, masteryCertificates: 500 },
      gold: 6_000_000,
      masteryCertificates: 510,
      claimedAt: 1,
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, rank: 1 });
  });
});
