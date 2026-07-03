import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkUserRateLimit,
  enforceUserAndIpRateLimit,
  enforceUserRateLimit,
  resetUserRateLimitForTests,
} from "./userRateLimit";

describe("userRateLimit", () => {
  beforeEach(() => {
    resetUserRateLimitForTests();
  });

  it("allows up to the configured limit inside a window", () => {
    expect(
      checkUserRateLimit({
        userId: "u1",
        action: "hunt",
        limit: 2,
        windowMs: 60_000,
        now: 1_000,
      }).ok,
    ).toBe(true);
    expect(
      checkUserRateLimit({
        userId: "u1",
        action: "hunt",
        limit: 2,
        windowMs: 60_000,
        now: 1_100,
      }).ok,
    ).toBe(true);

    const limited = checkUserRateLimit({
      userId: "u1",
      action: "hunt",
      limit: 2,
      windowMs: 60_000,
      now: 1_200,
    });
    expect(limited.ok).toBe(false);
    if (!limited.ok) expect(limited.retryAfterSec).toBe(60);
  });

  it("keeps actions and users isolated", () => {
    expect(
      checkUserRateLimit({
        userId: "u1",
        action: "hunt",
        limit: 1,
        windowMs: 60_000,
        now: 1_000,
      }).ok,
    ).toBe(true);
    expect(
      checkUserRateLimit({
        userId: "u1",
        action: "enhance",
        limit: 1,
        windowMs: 60_000,
        now: 1_100,
      }).ok,
    ).toBe(true);
    expect(
      checkUserRateLimit({
        userId: "u2",
        action: "hunt",
        limit: 1,
        windowMs: 60_000,
        now: 1_100,
      }).ok,
    ).toBe(true);
  });

  it("resets after the window expires", () => {
    expect(
      checkUserRateLimit({
        userId: "u1",
        action: "hunt",
        limit: 1,
        windowMs: 60_000,
        now: 1_000,
      }).ok,
    ).toBe(true);
    expect(
      checkUserRateLimit({
        userId: "u1",
        action: "hunt",
        limit: 1,
        windowMs: 60_000,
        now: 61_001,
      }).ok,
    ).toBe(true);
  });

  it("returns a 429 response and throttles abuse logs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(
        enforceUserRateLimit({
          userId: "u1",
          action: "spam",
          limit: 1,
          windowMs: 60_000,
          now: 1_000,
        }),
      ).toBeNull();

      const firstLimited = enforceUserRateLimit({
        userId: "u1",
        action: "spam",
        limit: 1,
        windowMs: 60_000,
        now: 1_100,
      });
      expect(firstLimited?.status).toBe(429);
      expect(warn).toHaveBeenCalledTimes(1);

      const secondLimited = enforceUserRateLimit({
        userId: "u1",
        action: "spam",
        limit: 1,
        windowMs: 60_000,
        now: 1_200,
      });
      expect(secondLimited?.status).toBe(429);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("can limit multiple users behind the same IP", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const req = new Request("https://example.test", {
        headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
      });
      expect(
        enforceUserAndIpRateLimit(req, {
          userId: "u1",
          action: "cast",
          userLimit: 10,
          ipLimit: 2,
          windowMs: 60_000,
          now: 1_000,
        }),
      ).toBeNull();
      expect(
        enforceUserAndIpRateLimit(req, {
          userId: "u2",
          action: "cast",
          userLimit: 10,
          ipLimit: 2,
          windowMs: 60_000,
          now: 1_100,
        }),
      ).toBeNull();

      const limited = enforceUserAndIpRateLimit(req, {
        userId: "u3",
        action: "cast",
        userLimit: 10,
        ipLimit: 2,
        windowMs: 60_000,
        now: 1_200,
      });
      expect(limited?.status).toBe(429);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});
