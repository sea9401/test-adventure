import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  cookieSet: vi.fn(),
  createIntent: vi.fn(async () => "secure-random-token"),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(async () =>
    mocks.userId ? { user: { id: mocks.userId } } : null,
  ),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: mocks.cookieSet })),
}));

vi.mock("@/lib/server/accountLinkIntent", () => ({
  ACCOUNT_LINK_INTENT_COOKIE: "account_link_intent",
  ACCOUNT_LINK_INTENT_TTL_SECONDS: 300,
  createAccountLinkIntent: mocks.createIntent,
  isAccountLinkProvider: (value: unknown) =>
    value === "google" || value === "kakao",
}));

import { POST } from "./route";

function request(body: string): Request {
  return new Request("http://test/api/auth/link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/auth/link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = "user-1";
    mocks.createIntent.mockResolvedValue("secure-random-token");
  });

  it("로그인하지 않은 요청을 거절한다", async () => {
    mocks.userId = null;
    const response = await POST(request(JSON.stringify({ provider: "google" })));
    expect(response.status).toBe(401);
    expect(mocks.createIntent).not.toHaveBeenCalled();
  });

  it("허용 목록 밖 provider와 잘못된 JSON을 거절한다", async () => {
    await expect(
      POST(request(JSON.stringify({ provider: "credentials" }))),
    ).resolves.toMatchObject({ status: 400 });
    await expect(POST(request("{"))).resolves.toMatchObject({ status: 400 });
    expect(mocks.createIntent).not.toHaveBeenCalled();
  });

  it("사용자 ID 대신 서버가 만든 무작위 token만 HttpOnly 쿠키에 둔다", async () => {
    const response = await POST(request(JSON.stringify({ provider: "google" })));

    expect(response.status).toBe(204);
    expect(mocks.createIntent).toHaveBeenCalledWith("user-1", "google");
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "account_link_intent",
      "secure-random-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        maxAge: 300,
        path: "/api/auth",
      }),
    );
    expect(mocks.cookieSet).not.toHaveBeenCalledWith(
      "account_link_intent",
      "user-1",
      expect.anything(),
    );
  });
});
