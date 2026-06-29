import { beforeEach, describe, expect, it } from "vitest";
import {
  checkUserRateLimit,
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
});
