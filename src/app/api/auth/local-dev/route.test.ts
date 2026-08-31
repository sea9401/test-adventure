import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
}));

vi.mock("@/auth", () => ({
  signIn: mocks.signIn,
}));

import { GET } from "./route";

function request(host: string, origin?: string): Request {
  const headers = new Headers({ host });
  if (origin) headers.set("origin", origin);
  return new Request("http://localhost/api/auth/local-dev", { headers });
}

describe("GET /api/auth/local-dev", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOCAL_DEV_AUTO_LOGIN_USER_EMAIL", "owner@example.com");
    mocks.signIn.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loopback 개발 요청에 정상 Auth.js 로그인을 발급하고 게임 홈으로 보낸다", async () => {
    mocks.signIn.mockResolvedValue("/");

    const response = await GET(
      request("localhost:3000", "http://localhost:3000"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/");
    expect(mocks.signIn).toHaveBeenCalledWith("local-dev", {
      redirect: false,
      redirectTo: "/",
    });
  });

  it("원격 호스트 요청은 로그인 시도 없이 404로 숨긴다", async () => {
    const response = await GET(request("dev.example.com"));

    expect(response.status).toBe(404);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("개발 자동 로그인 설정이 없으면 404로 숨긴다", async () => {
    vi.stubEnv("LOCAL_DEV_AUTO_LOGIN_USER_EMAIL", "");

    const response = await GET(request("localhost:3000"));

    expect(response.status).toBe(404);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
