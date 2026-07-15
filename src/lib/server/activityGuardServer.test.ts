import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyActivityGuardState,
  recordActivityStrongSignal,
} from "./activityGuard";
import { activityVerificationGateResponse } from "./activityGuardServer";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("activityVerificationGateResponse", () => {
  it("강신호 누적 후에는 대기를 먼저 적용하고 이후 사람 확인을 요구한다", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_EXPECTED_HOSTNAMES", "test.local");
    let state = emptyActivityGuardState();
    state = recordActivityStrongSignal(state, "fishing", 10_000).state;
    state = recordActivityStrongSignal(state, "woodcutting", 11_000).state;
    state = recordActivityStrongSignal(state, "mining", 12_000).state;

    vi.spyOn(Date, "now").mockReturnValue(12_001);
    const cooldown = activityVerificationGateResponse(state, "farming");
    expect(cooldown?.status).toBe(429);
    await expect(cooldown?.json()).resolves.toMatchObject({
      error: "activity_cooldown",
      activity: "farming",
      riskLevel: "high",
    });

    vi.spyOn(Date, "now").mockReturnValue(60_000);
    const verification = activityVerificationGateResponse(state, "farming");
    expect(verification?.status).toBe(403);
    await expect(verification?.json()).resolves.toMatchObject({
      error: "human_verification_required",
      activity: "farming",
    });
  });
});
