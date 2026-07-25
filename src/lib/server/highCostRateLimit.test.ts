import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enforceHighCostRateLimit,
  HIGH_COST_RATE_LIMITS,
} from "./highCostRateLimit";
import { resetUserRateLimitForTests } from "./userRateLimit";

describe("highCostRateLimit", () => {
  beforeEach(() => {
    resetUserRateLimitForTests();
  });

  it("keeps every expensive route below the broad nginx API allowance", () => {
    for (const profile of Object.values(HIGH_COST_RATE_LIMITS)) {
      expect(profile.userLimit).toBeGreaterThan(0);
      expect(profile.ipLimit).toBeGreaterThanOrEqual(profile.userLimit);
      expect(profile.ipLimit).toBeLessThanOrEqual(300);
    }
  });

  it("returns 429 after a high-cost user exhausts its profile", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const req = new Request("https://example.test/api/v2/me/offline-settle", {
      headers: { "x-real-ip": "203.0.113.10" },
    });
    try {
      for (let index = 0; index < HIGH_COST_RATE_LIMITS.offlineSettle.userLimit; index += 1) {
        expect(
          enforceHighCostRateLimit(req, "user-1", "offlineSettle", 1_000 + index),
        ).toBeNull();
      }
      const limited = enforceHighCostRateLimit(
        req,
        "user-1",
        "offlineSettle",
        2_000,
      );
      expect(limited?.status).toBe(429);
      expect(limited?.headers.get("Retry-After")).toBeTruthy();
    } finally {
      warn.mockRestore();
    }
  });
});
