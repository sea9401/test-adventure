import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  activeSessionId: null as string | null,
  takeover: false,
  updated: null as Record<string, unknown> | null,
  cookieSet: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureOriginalUser: vi.fn(async () => mocks.userId),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn((name: string) =>
      name === "game-session-takeover.v1" && mocks.takeover
        ? { name, value: "1" }
        : undefined,
    ),
    set: mocks.cookieSet,
  })),
}));

vi.mock("@/db", () => {
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    for: () => selectChain,
    limit: async () => [{ activeSessionId: mocks.activeSessionId }],
  };
  const tx = {
    select: () => selectChain,
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mocks.updated = values;
        return { where: async () => undefined };
      },
    }),
  };
  return {
    db: {
      transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    },
  };
});

import { POST } from "@/app/api/session/claim/route";

function claim(sessionId = "device-new"): Request {
  return new Request("http://test/api/session/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}

describe("POST /api/session/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = "user-1";
    mocks.activeSessionId = null;
    mocks.takeover = false;
    mocks.updated = null;
  });

  it("활성 기기가 없으면 현재 기기를 등록하고 HttpOnly 쿠키를 발급한다", async () => {
    const response = await POST(claim());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, replaced: false });
    expect(mocks.updated).toMatchObject({ activeSessionId: "device-new" });
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "game-device-session.v1",
      "device-new",
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
  });

  it("같은 기기의 새로고침은 세션을 다시 교체하지 않는다", async () => {
    mocks.activeSessionId = "device-new";
    const response = await POST(claim());
    expect(response.status).toBe(200);
    expect(mocks.updated).toBeNull();
  });

  it("로그인 우선권 없는 다른 기기의 새로고침은 기존 세션을 탈취하지 못한다", async () => {
    mocks.activeSessionId = "device-active";
    const response = await POST(claim("device-old"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "session_in_use",
    });
    expect(mocks.updated).toBeNull();
  });

  it("새 OAuth 로그인 기기는 기존 활성 기기를 교체한다", async () => {
    mocks.activeSessionId = "device-old";
    mocks.takeover = true;
    const response = await POST(claim("device-new"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, replaced: true });
    expect(mocks.updated).toMatchObject({ activeSessionId: "device-new" });
  });
});
