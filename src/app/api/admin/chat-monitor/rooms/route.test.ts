import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(async () => null as Response | null),
  readTargets: vi.fn(),
}));

vi.mock("@/lib/server/isAdmin", () => ({
  requireAdminRole: mocks.gate,
}));
vi.mock("@/lib/server/adminChatMonitor", () => ({
  readAdminChatTargets: mocks.readTargets,
}));

import { GET } from "./route";

const responseBody = {
  targets: [
    {
      targetKey: "global" as const,
      kind: "global" as const,
      label: "전체 채팅",
      latestMessageAt: "2026-08-27T09:00:00.000Z",
    },
    {
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
  ],
  total: 2,
  hasMore: false,
};

describe("GET /api/admin/chat-monitor/rooms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gate.mockResolvedValue(null);
    mocks.readTargets.mockResolvedValue(responseBody);
  });

  it("super 권한이 없으면 채팅 대상 정보를 노출하지 않는다", async () => {
    mocks.gate.mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );

    const response = await GET(
      new Request("http://test/api/admin/chat-monitor/rooms"),
    );

    expect(response.status).toBe(403);
    expect(mocks.readTargets).not.toHaveBeenCalled();
  });

  it("검증한 필터의 채팅 대상 목록을 반환한다", async () => {
    const response = await GET(
      new Request(
        "http://test/api/admin/chat-monitor/rooms?visibility=private&q=%EC%9E%91%EC%A0%84&offset=5&limit=25",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.readTargets).toHaveBeenCalledWith({
      kind: "all",
      visibility: "private",
      q: "작전",
      offset: 5,
      limit: 25,
    });
    expect(await response.json()).toEqual(responseBody);
  });

  it("잘못된 필터에는 400을 반환하고 조회하지 않는다", async () => {
    const response = await GET(
      new Request("http://test/api/admin/chat-monitor/rooms?kind=unknown"),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("invalid kind");
    expect(mocks.readTargets).not.toHaveBeenCalled();
  });
});
