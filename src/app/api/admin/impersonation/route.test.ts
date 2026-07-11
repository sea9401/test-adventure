import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(async () => null as Response | null),
  auth: vi.fn(async () => ({
    user: { id: "admin", email: "admin@example.com" },
  })),
  enabled: vi.fn(() => true),
  active: vi.fn(async () => null as {
    adminId: string;
    targetUserId: string;
    issuedAt: number;
    expiresAt: number;
  } | null),
  set: vi.fn(async () => ({
    adminId: "admin",
    targetUserId: "target",
    issuedAt: 1_000,
    expiresAt: 3_601_000,
  })),
  clear: vi.fn(async () => {}),
  audit: vi.fn(async () => {}),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/server/isAdmin", () => ({
  requireAdminRole: mocks.gate,
  currentAdminEmail: vi.fn(async () => "admin@example.com"),
}));
vi.mock("@/lib/server/adminAudit", () => ({ logAdminAction: mocks.audit }));
vi.mock("@/lib/server/adminImpersonation", () => ({
  isAdminImpersonationEnabled: mocks.enabled,
  getActiveAdminImpersonation: mocks.active,
  setAdminImpersonation: mocks.set,
  clearAdminImpersonation: mocks.clear,
}));
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            { id: "target", gameName: "대상", email: "target@example.com" },
          ]),
        })),
      })),
    })),
  },
}));

import { DELETE, GET, POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://test/api/admin/impersonation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/admin/impersonation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.active.mockResolvedValue(null);
    mocks.gate.mockResolvedValue(null);
  });

  it("최고 관리자가 존재하는 대상으로 가장을 시작하고 감사 로그를 남긴다", async () => {
    const response = await POST(request({ userId: "target" }));
    const json = (await response.json()) as { ok?: boolean };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mocks.set).toHaveBeenCalledWith("admin", "target");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "impersonation.start",
        targetUserId: "target",
      }),
    );
  });

  it("운영 허용이 꺼진 환경에서는 시작을 거절한다", async () => {
    mocks.enabled.mockReturnValue(false);
    const response = await POST(request({ userId: "target" }));
    expect(response.status).toBe(403);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("현재 상태를 조회하고 종료 시 쿠키와 감사 로그를 정리한다", async () => {
    mocks.active.mockResolvedValue({
      adminId: "admin",
      targetUserId: "target",
      issuedAt: 1_000,
      expiresAt: 3_601_000,
    });
    const status = await GET();
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      enabled: true,
      active: { targetUserId: "target", gameName: "대상" },
    });

    const ended = await DELETE();
    expect(ended.status).toBe(200);
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "impersonation.end",
        targetUserId: "target",
      }),
    );
  });
});
