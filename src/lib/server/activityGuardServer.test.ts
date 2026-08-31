import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyActivityGuardState,
  recordActivityStrongSignal,
  setManualActivityVerification,
} from "./activityGuard";
import { activityVerificationGateResponse } from "./activityGuardServer";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("activityVerificationGateResponse", () => {
  it("관리자 일반 확인 요청은 수동 테스트 표시와 함께 Turnstile만 요구한다", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_EXPECTED_HOSTNAMES", "test.local");
    vi.stubEnv("HCAPTCHA_SITE_KEY", "captcha-site");
    vi.stubEnv("HCAPTCHA_SECRET_KEY", "captcha-secret");
    const state = setManualActivityVerification(
      emptyActivityGuardState(),
      "woodcutting",
      "standard",
      10_000,
    );
    vi.spyOn(Date, "now").mockReturnValue(11_000);

    const response = activityVerificationGateResponse(state, "woodcutting");

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      error: "human_verification_required",
      activity: "woodcutting",
      reason: "volume",
      manualTest: true,
      captchaSiteKey: null,
    });
  });

  it("관리자 2단계 확인 요청은 실제 강신호 없이도 hCaptcha를 요구한다", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_EXPECTED_HOSTNAMES", "test.local");
    vi.stubEnv("HCAPTCHA_SITE_KEY", "captcha-site");
    vi.stubEnv("HCAPTCHA_SECRET_KEY", "captcha-secret");
    const state = setManualActivityVerification(
      emptyActivityGuardState(),
      "mining",
      "captcha",
      20_000,
    );
    vi.spyOn(Date, "now").mockReturnValue(21_000);

    const response = activityVerificationGateResponse(state, "mining");

    await expect(response?.json()).resolves.toMatchObject({
      reason: "strong_signal",
      manualTest: true,
      captchaSiteKey: "captcha-site",
    });
  });

  it("강신호 누적 후에는 대기를 먼저 적용하고 이후 사람 확인을 요구한다", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_EXPECTED_HOSTNAMES", "test.local");
    vi.stubEnv("HCAPTCHA_SITE_KEY", "captcha-site");
    vi.stubEnv("HCAPTCHA_SECRET_KEY", "captcha-secret");
    let state = emptyActivityGuardState();
    state = recordActivityStrongSignal(state, "fishing", 10_000).state;
    state = recordActivityStrongSignal(state, "woodcutting", 11_000).state;
    state = recordActivityStrongSignal(state, "mining", 12_000).state;

    vi.spyOn(Date, "now").mockReturnValue(12_001);
    const cooldown = activityVerificationGateResponse(state, "fishing");
    expect(cooldown?.status).toBe(429);
    await expect(cooldown?.json()).resolves.toMatchObject({
      error: "activity_cooldown",
      activity: "fishing",
      riskLevel: "high",
    });

    vi.spyOn(Date, "now").mockReturnValue(60_000);
    const verification = activityVerificationGateResponse(state, "fishing");
    expect(verification?.status).toBe(403);
    await expect(verification?.json()).resolves.toMatchObject({
      error: "human_verification_required",
      activity: "fishing",
      manualTest: false,
      captchaSiteKey: "captcha-site",
    });
  });
});
