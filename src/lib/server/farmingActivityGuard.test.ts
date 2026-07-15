import { afterEach, describe, expect, it, vi } from "vitest";

const { readSave } = vi.hoisted(() => ({
  readSave: vi.fn(async () => ({})),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("./savesKv", () => ({ readSave }));

import { enforceFarmingMutation } from "./farmingActivityGuard";
import { resetUserRateLimitForTests } from "./userRateLimit";

function request() {
  return new Request("http://test.local/api/v2/farm/plant", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.10" },
  });
}

afterEach(() => {
  readSave.mockReset();
  readSave.mockResolvedValue({});
  resetUserRateLimitForTests();
  vi.unstubAllEnvs();
});

describe("enforceFarmingMutation", () => {
  it("평상시 농장 변경은 통과시킨다", async () => {
    await expect(enforceFarmingMutation(request(), "u-farm")).resolves.toBeNull();
  });

  it("공유 위험도가 높으면 농장 변경에도 사람 확인을 요구한다", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_EXPECTED_HOSTNAMES", "test.local");
    readSave.mockResolvedValue({
      version: 2,
      activities: {},
      risk: { score: 50, updatedAt: Date.now() },
    });

    const response = await enforceFarmingMutation(request(), "u-farm");

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      error: "human_verification_required",
      activity: "farming",
      riskLevel: "high",
    });
  });

  it("농장 변경 31번째 요청은 사용자 단위로 제한한다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let index = 0; index < 30; index += 1) {
      await expect(
        enforceFarmingMutation(request(), "u-volume"),
      ).resolves.toBeNull();
    }

    const response = await enforceFarmingMutation(request(), "u-volume");

    expect(response?.status).toBe(429);
    await expect(response?.json()).resolves.toMatchObject({
      error: "rate_limited",
    });
  });
});
