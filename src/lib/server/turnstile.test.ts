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

  it("호스트 허용 목록까지 있어야 활성화한다", () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_EXPECTED_HOSTNAMES", "msmsge.com, www.msmsge.com");
    expect(turnstileConfig()).toMatchObject({
      configured: true,
      expectedHostnames: ["msmsge.com", "www.msmsge.com"],
    });
  });

  it("활동별 action 값을 분리한다", () => {
    expect(turnstileAction("fishing")).toBe("activity_fishing");
    expect(turnstileAction("woodcutting")).toBe("activity_woodcutting");
    expect(turnstileAction("mining")).toBe("activity_mining");
  });

  it("서버 검증 성공과 action 일치를 모두 요구한다", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_EXPECTED_HOSTNAMES", "test.local");
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

  it("서버에서 허용하지 않은 hostname 토큰을 거부한다", async () => {
    vi.stubEnv("TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_EXPECTED_HOSTNAMES", "msmsge.com");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          action: "activity_fishing",
          hostname: "attacker.example",
        }),
        { status: 200 },
      ),
    );

    await expect(
      verifyTurnstileToken({ token: "token", activity: "fishing" }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid",
      codes: ["hostname-mismatch"],
    });
  });
});
