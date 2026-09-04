import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGE_ELIGIBILITY_COOKIE,
  verifyAgeEligibilityToken,
} from "@/lib/server/ageEligibility";
import { POST } from "./route";

function request(
  body: unknown,
  origin = "https://msmsge.com",
  url = "https://msmsge.com/api/age-eligibility",
) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "msmsge.com",
      origin,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/age-eligibility", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", "test-auth-secret-at-least-32-characters");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("명시적인 만 14세 이상 확인에만 보안 쿠키를 발급한다", async () => {
    const response = await POST(request({ confirmed: true }));
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(cookie).toContain(`${AGE_ELIGIBILITY_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const token = cookie.split(";", 1)[0]?.split("=", 2)[1];
    expect(
      verifyAgeEligibilityToken(
        token,
        "test-auth-secret-at-least-32-characters",
      ),
    ).toBe(true);
  });

  it("운영 환경에서는 Secure 속성도 설정한다", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await POST(request({ confirmed: true }));

    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("확인하지 않은 입력은 쿠키 없이 거부한다", async () => {
    const response = await POST(request({ confirmed: false }));

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("교차 출처 요청을 거부한다", async () => {
    const response = await POST(request({ confirmed: true }, "https://evil.example"));

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("서명 비밀키가 없으면 쿠키를 발급하지 않는다", async () => {
    vi.stubEnv("AUTH_SECRET", "");

    const response = await POST(request({ confirmed: true }));

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
