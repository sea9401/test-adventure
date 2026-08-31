import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, verifyTurnstileToken, verifyHcaptchaToken, recordAbuseEventSoon } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  verifyTurnstileToken: vi.fn(),
  verifyHcaptchaToken: vi.fn(),
  recordAbuseEventSoon: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/db", () => ({
  db: { transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})) },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_db, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));
vi.mock("@/lib/server/abuseLog", () => ({
  clientIpFromRequest: vi.fn(() => "127.0.0.1"),
  recordAbuseEventSoon,
}));
vi.mock("@/lib/server/turnstile", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/turnstile")>();
  return { ...original, verifyTurnstileToken };
});
vi.mock("@/lib/server/hcaptcha", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/server/hcaptcha")>();
  return { ...original, verifyHcaptchaToken };
});

import { POST } from "@/app/api/v2/activity-verification/route";
import {
  ACTIVITY_GUARD_KEY,
  activityGuardView,
  emptyActivityGuardState,
  parseActivityGuardState,
  recordActivityStrongSignal,
  setManualActivityVerification,
} from "@/lib/server/activityGuard";
import { resetUserRateLimitForTests } from "@/lib/server/userRateLimit";

function request(activity = "fishing", token = "token", captchaToken?: string) {
  return new Request("http://test.local/api/v2/activity-verification", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ activity, token, captchaToken }),
  });
}

beforeEach(() => {
  vi.stubEnv("TURNSTILE_SITE_KEY", "site");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
  vi.stubEnv("TURNSTILE_EXPECTED_HOSTNAMES", "test.local");
  let state = emptyActivityGuardState();
  state = recordActivityStrongSignal(state, "fishing", 10_000).state;
  state = recordActivityStrongSignal(state, "fishing", 11_000).state;
  state = recordActivityStrongSignal(state, "fishing", 12_000).state;
  store.set(ACTIVITY_GUARD_KEY, state);
});

afterEach(() => {
  store.clear();
  verifyTurnstileToken.mockReset();
  verifyHcaptchaToken.mockReset();
  recordAbuseEventSoon.mockReset();
  resetUserRateLimitForTests();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/v2/activity-verification", () => {
  it("검증 성공 시 해당 활동 체크포인트를 초기화한다", async () => {
    verifyTurnstileToken.mockResolvedValue({ ok: true, hostname: "test.local" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    const state = parseActivityGuardState(store.get(ACTIVITY_GUARD_KEY));
    expect(activityGuardView(state, "fishing")).toMatchObject({
      completedSinceVerification: 0,
      verificationRequiredAt: null,
      strongSignals: 0,
    });
  });

  it("검증 실패는 상태를 유지하고 운영 로그를 남긴다", async () => {
    verifyTurnstileToken.mockResolvedValue({
      ok: false,
      error: "invalid",
      codes: ["invalid-input-response"],
    });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(recordAbuseEventSoon).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "human_verification_failed" }),
    );
    const state = parseActivityGuardState(store.get(ACTIVITY_GUARD_KEY));
    expect(activityGuardView(state, "fishing").verificationRequiredAt).not.toBeNull();
  });

  it("체크포인트가 없으면 미리 검증해 활동 횟수를 초기화할 수 없다", async () => {
    store.set(ACTIVITY_GUARD_KEY, {});
    verifyTurnstileToken.mockResolvedValue({ ok: true, hostname: "test.local" });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(activityGuardView(
      parseActivityGuardState(store.get(ACTIVITY_GUARD_KEY)),
      "fishing",
    ).completedSinceVerification).toBe(0);
  });

  it("다른 생활 활동에서 쌓인 공통 위험도도 보호 대상 활동 확인으로 해제할 수 있다", async () => {
    let state = emptyActivityGuardState();
    state = recordActivityStrongSignal(state, "fishing", 1_000).state;
    state = recordActivityStrongSignal(state, "woodcutting", 2_000).state;
    state = recordActivityStrongSignal(state, "mining", 3_000).state;
    store.set(ACTIVITY_GUARD_KEY, state);
    verifyTurnstileToken.mockResolvedValue({ ok: true, hostname: "test.local" });

    const response = await POST(request("fishing"));

    expect(response.status).toBe(200);
    expect(
      activityGuardView(
        parseActivityGuardState(store.get(ACTIVITY_GUARD_KEY)),
        "fishing",
      ).riskScore,
    ).toBeLessThan(50);
  });

  it("강한 의심 신호이고 hCaptcha가 설정되면 2단계 토큰을 함께 요구한다", async () => {
    vi.stubEnv("HCAPTCHA_SITE_KEY", "captcha-site");
    vi.stubEnv("HCAPTCHA_SECRET_KEY", "captcha-secret");
    vi.stubEnv("HCAPTCHA_EXPECTED_HOSTNAMES", "test.local");

    const missing = await POST(request());
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({
      error: "captcha_verification_required",
    });

    verifyTurnstileToken.mockResolvedValue({ ok: true, hostname: "test.local" });
    verifyHcaptchaToken.mockResolvedValue({ ok: true, hostname: "test.local" });
    const response = await POST(request("fishing", "turnstile", "captcha"));

    expect(response.status).toBe(200);
    expect(verifyHcaptchaToken).toHaveBeenCalledWith(
      expect.objectContaining({ token: "captcha" }),
    );
  });

  it("관리자 일반 확인 성공은 수동 요청만 지우고 위험 점수와 일일 확인 수를 보존한다", async () => {
    let state = recordActivityStrongSignal(
      emptyActivityGuardState(),
      "fishing",
      Date.now() - 1_000,
    ).state;
    state = setManualActivityVerification(
      state,
      "fishing",
      "standard",
      Date.now(),
    );
    store.set(ACTIVITY_GUARD_KEY, state);
    verifyTurnstileToken.mockResolvedValue({ ok: true, hostname: "test.local" });

    const response = await POST(request());
    const stored = parseActivityGuardState(store.get(ACTIVITY_GUARD_KEY));

    expect(response.status).toBe(200);
    expect(activityGuardView(stored, "fishing")).toMatchObject({
      riskScore: 18,
      strongSignals: 1,
      dailyVerifications: 0,
    });
    expect(recordAbuseEventSoon).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "human_verification_succeeded",
        detail: expect.objectContaining({ manualTest: true }),
      }),
    );
  });

  it("관리자 확인 실패는 수동 요청을 유지하고 운영 테스트로 기록한다", async () => {
    const state = setManualActivityVerification(
      emptyActivityGuardState(),
      "mining",
      "standard",
      Date.now(),
    );
    store.set(ACTIVITY_GUARD_KEY, state);
    verifyTurnstileToken.mockResolvedValue({
      ok: false,
      error: "invalid",
      codes: ["invalid-input-response"],
    });

    const response = await POST(request("mining"));

    expect(response.status).toBe(400);
    expect(recordAbuseEventSoon).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "human_verification_failed",
        detail: expect.objectContaining({ manualTest: true }),
      }),
    );
    expect(
      activityGuardView(
        parseActivityGuardState(store.get(ACTIVITY_GUARD_KEY)),
        "mining",
      ).riskScore,
    ).toBe(0);
  });
});
