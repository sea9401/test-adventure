import { afterEach, describe, expect, it, vi } from "vitest";
import { turnstileAction, turnstileConfig, verifyTurnstileToken } from "./turnstile";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("turnstile", () => {
  it("키가 없으면 기능을 비활성화한다", () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(turnstileConfig()).toMatchObject({ configured: false });
  });

  it("활동별 action 값을 분리한다", () => {
    expect(turnstileAction("fishing")).toBe("activity_fishing");
    expect(turnstileAction("woodcutting")).toBe("activity_woodcutting");
  });

  it("서버 검증 성공과 action 일치를 모두 요구한다", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({ success: true, action: "activity_fishing", hostname: "test.local" }),
        { status: 200 },
      ),
    );
    await expect(
      verifyTurnstileToken({ token: "token", activity: "fishing" }),
    ).resolves.toEqual({ ok: true, hostname: "test.local" });
    await expect(
      verifyTurnstileToken({ token: "token", activity: "woodcutting" }),
    ).resolves.toMatchObject({ ok: false, error: "invalid" });
  });
});
