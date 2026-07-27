import { afterEach, describe, expect, it, vi } from "vitest";
import { hcaptchaConfig, verifyHcaptchaToken } from "./hcaptcha";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("hcaptcha", () => {
  it("키가 없으면 2단계 CAPTCHA를 비활성화한다", () => {
    vi.stubEnv("HCAPTCHA_SITE_KEY", "");
    vi.stubEnv("HCAPTCHA_SECRET_KEY", "");
    expect(hcaptchaConfig()).toMatchObject({ configured: false });
  });

  it("별도 호스트 목록이 없으면 Turnstile 허용 호스트를 재사용한다", () => {
    vi.stubEnv("HCAPTCHA_SITE_KEY", "site");
    vi.stubEnv("HCAPTCHA_SECRET_KEY", "secret");
    vi.stubEnv("TURNSTILE_EXPECTED_HOSTNAMES", "test.local");
    expect(hcaptchaConfig()).toMatchObject({
      configured: true,
      expectedHostnames: ["test.local"],
    });
  });

  it("토큰을 form 형식으로 서버 검증하고 호스트를 확인한다", async () => {
    vi.stubEnv("HCAPTCHA_SITE_KEY", "site");
    vi.stubEnv("HCAPTCHA_SECRET_KEY", "secret");
    vi.stubEnv("HCAPTCHA_EXPECTED_HOSTNAMES", "test.local");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, hostname: "test.local" })),
    );

    await expect(
      verifyHcaptchaToken({
        token: "captcha-token",
        remoteIp: "127.0.0.1",
      }),
    ).resolves.toEqual({ ok: true, hostname: "test.local" });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(URLSearchParams);
    expect(String(init?.body)).toContain("sitekey=site");
  });

  it("hCaptcha가 hostname을 생략해도 sitekey 검증 성공 결과를 허용한다", async () => {
    vi.stubEnv("HCAPTCHA_SITE_KEY", "site");
    vi.stubEnv("HCAPTCHA_SECRET_KEY", "secret");
    vi.stubEnv("HCAPTCHA_EXPECTED_HOSTNAMES", "test.local");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true })),
    );

    await expect(
      verifyHcaptchaToken({ token: "captcha-token" }),
    ).resolves.toEqual({ ok: true, hostname: null });
  });

  it("허용 목록 밖의 hostname으로 발급된 토큰을 거부한다", async () => {
    vi.stubEnv("HCAPTCHA_SITE_KEY", "site");
    vi.stubEnv("HCAPTCHA_SECRET_KEY", "secret");
    vi.stubEnv("HCAPTCHA_EXPECTED_HOSTNAMES", "msmsge.com,www.msmsge.com");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, hostname: "attacker.example" }),
      ),
    );

    await expect(
      verifyHcaptchaToken({ token: "captcha-token" }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid",
      codes: ["hostname-mismatch"],
    });
  });
});
