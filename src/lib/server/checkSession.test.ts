import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  active: vi.fn(async () => null as { targetUserId: string } | null),
  stored: "other-session" as string | null,
}));

vi.mock("@/lib/server/adminImpersonation", () => ({
  getActiveAdminImpersonation: mocks.active,
}));
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ activeSessionId: mocks.stored }]),
        })),
      })),
    })),
  },
}));

import { checkSession, requireActiveDeviceSession } from "./checkSession";

function request(sessionId?: string): Request {
  return new Request("http://test/api/save", {
    headers: sessionId ? { "x-session-id": sessionId } : {},
  });
}

describe("checkSession impersonation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.active.mockResolvedValue(null);
    mocks.stored = "other-session";
  });

  it("일반 세션은 대상 계정의 단일 세션 불일치를 거절한다", async () => {
    const response = await checkSession("target", request("admin-device"));
    expect(response?.status).toBe(410);
  });

  it("HttpOnly 기기 쿠키가 일치하면 통과한다", async () => {
    mocks.stored = "cookie-device";
    const response = await checkSession(
      "target",
      new Request("http://test/api/save", {
        headers: { cookie: "game-device-session.v1=cookie-device" },
      }),
    );
    expect(response).toBeNull();
  });

  it("관리자 가장 중에는 대상의 실제 접속을 끊지 않고 통과한다", async () => {
    mocks.active.mockResolvedValue({ targetUserId: "target" });
    await expect(
      checkSession("target", request("admin-device")),
    ).resolves.toBeNull();
  });

  it("변경 API의 세션 헤더 요구는 가장 중에도 유지한다", async () => {
    mocks.active.mockResolvedValue({ targetUserId: "target" });
    const response = await requireActiveDeviceSession("target", request());
    expect(response?.status).toBe(401);
  });
});
