import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(async () => null as Response | null),
  email: vi.fn(async () => "admin@example.com"),
  readMessages: vi.fn(),
  audit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/server/isAdmin", () => ({
  requireAdminRole: mocks.gate,
  currentAdminEmail: mocks.email,
}));
vi.mock("@/lib/server/adminChatMonitor", () => ({
  readAdminChatMessages: mocks.readMessages,
}));
vi.mock("@/lib/server/adminAudit", () => ({
  logAdminAction: mocks.audit,
}));

import { GET } from "./route";

const roomResponse = {
  target: {
    targetKey: "room:7" as const,
    kind: "room" as const,
    scopeId: 7,
    label: "비밀 작전방",
    visibility: "private" as const,
    ownerId: "owner-1",
    ownerName: "방장",
    memberCount: 2,
    latestMessageAt: "2026-08-27T08:00:00.000Z",
  },
  participants: [
    {
      userId: "owner-1",
      name: "방장",
      role: "owner" as const,
      joinedAt: "2026-08-26T08:00:00.000Z",
    },
    {
      userId: "member-1",
      name: "참여자",
      role: "member" as const,
      joinedAt: "2026-08-26T09:00:00.000Z",
    },
  ],
  messages: [
    {
      id: 31,
      authorUserId: "owner-1",
      name: "방장",
      className: "전사",
      title: null,
      content: "작전 시작",
      itemLink: null,
      createdAt: "2026-08-27T08:00:00.000Z",
    },
  ],
  hasMore: false,
  nextBeforeId: null,
};

describe("GET /api/admin/chat-monitor/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gate.mockResolvedValue(null);
    mocks.email.mockResolvedValue("admin@example.com");
    mocks.readMessages.mockResolvedValue(roomResponse);
  });

  it("super 권한이 없으면 메시지와 감사 정보를 만들지 않는다", async () => {
    mocks.gate.mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );

    const response = await GET(
      new Request(
        "http://test/api/admin/chat-monitor/messages?kind=room&scopeId=7",
      ),
    );

    expect(response.status).toBe(403);
    expect(mocks.readMessages).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("멤버십과 무관하게 선택 범위의 메시지와 참여자를 반환한다", async () => {
    const response = await GET(
      new Request(
        "http://test/api/admin/chat-monitor/messages?kind=room&scopeId=7",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.readMessages).toHaveBeenCalledWith({
      kind: "room",
      scopeId: 7,
      beforeId: null,
      limit: 100,
    });
    expect(await response.json()).toEqual(roomResponse);
  });

  it("성공한 조회는 메시지 본문 없이 감사 로그를 남긴다", async () => {
    await GET(
      new Request(
        "http://test/api/admin/chat-monitor/messages?kind=room&scopeId=7&beforeId=31&limit=20",
      ),
    );

    expect(mocks.audit).toHaveBeenCalledWith({
      adminEmail: "admin@example.com",
      action: "chat_monitor.read",
      detail: {
        kind: "room",
        scopeId: 7,
        beforeId: 31,
        messageCount: 1,
      },
    });
    expect(JSON.stringify(mocks.audit.mock.calls[0])).not.toContain(
      "작전 시작",
    );
  });

  it("없는 범위에는 404를 반환하고 감사 로그를 남기지 않는다", async () => {
    mocks.readMessages.mockResolvedValue(null);

    const response = await GET(
      new Request(
        "http://test/api/admin/chat-monitor/messages?kind=room&scopeId=999",
      ),
    );

    expect(response.status).toBe(404);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("잘못된 범위에는 400을 반환한다", async () => {
    const response = await GET(
      new Request("http://test/api/admin/chat-monitor/messages?kind=room"),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("invalid scope id");
    expect(mocks.readMessages).not.toHaveBeenCalled();
  });
});
