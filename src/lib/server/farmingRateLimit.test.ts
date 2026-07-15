import { afterEach, describe, expect, it, vi } from "vitest";
import { enforceFarmingRateLimit } from "./farmingRateLimit";
import { resetUserRateLimitForTests } from "./userRateLimit";

function request() {
  return new Request("http://test.local/api/v2/farm/plant", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.10" },
  });
}

afterEach(() => {
  resetUserRateLimitForTests();
  vi.restoreAllMocks();
});

describe("enforceFarmingRateLimit", () => {
  it("평상시 농장 변경은 통과시킨다", () => {
    expect(enforceFarmingRateLimit(request(), "u-farm")).toBeNull();
  });

  it("농장 변경 31번째 요청은 일반 요청 제한만 적용한다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let index = 0; index < 30; index += 1) {
      expect(enforceFarmingRateLimit(request(), "u-volume")).toBeNull();
    }

    const response = enforceFarmingRateLimit(request(), "u-volume");

    expect(response?.status).toBe(429);
    await expect(response?.json()).resolves.toMatchObject({
      error: "rate_limited",
    });
  });
});
