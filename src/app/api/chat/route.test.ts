import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(async () => "u-chat"),
  resolveActor: vi.fn(),
  recordAbuseEventSoon: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  select: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/resolveActor", () => ({ resolveActor: mocks.resolveActor }));
vi.mock("@/lib/server/bulletinAccess", () => ({ getViewerGuild: vi.fn() }));
vi.mock("@/lib/server/chatProgress", () => ({ recordUserChatMessageInTx: vi.fn() }));
vi.mock("@/lib/server/museunCosmetics", () => ({
  readMuseunCosmeticAppearanceMap: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/server/abuseLog", () => ({
  clientIpFromRequest: vi.fn(() => "127.0.0.1"),
  recordAbuseEventSoon: mocks.recordAbuseEventSoon,
}));

import { GET, POST } from "./route";

function request(content: string) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, channel: "global" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [];
  mocks.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: async () => mocks.rows,
        }),
      }),
    }),
  }));
});

describe("채팅 증분 조회", () => {
  const row = (id: number) => ({
    id,
    channel: "global",
    roomId: null,
    name: `user-${id}`,
    className: "warrior",
    title: null,
    content: `message-${id}`,
    createdAt: new Date(id * 1000),
    mine: id === 2 ? "u-chat" : "other",
  });

  it("최초 조회 결과는 최신순 DB 결과를 시간순으로 뒤집는다", async () => {
    mocks.rows = [row(3), row(2)];

    const response = await GET(
      new Request("http://localhost/api/chat?channel=global"),
    );
    const body = (await response.json()) as Array<{ id: number; mine: boolean }>;

    expect(response.status).toBe(200);
    expect(body.map((message) => message.id)).toEqual([2, 3]);
    expect(body[0]?.mine).toBe(true);
  });

  it("afterId 조회 결과는 서버가 준 오래된 순서를 유지한다", async () => {
    mocks.rows = [row(4), row(5)];

    const response = await GET(
      new Request("http://localhost/api/chat?channel=global&afterId=3"),
    );
    const body = (await response.json()) as Array<{ id: number }>;

    expect(response.status).toBe(200);
    expect(body.map((message) => message.id)).toEqual([4, 5]);
  });

  it("잘못된 afterId는 DB 조회 전에 거부한다", async () => {
    const response = await GET(
      new Request("http://localhost/api/chat?channel=global&afterId=-1"),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("invalid after id");
    expect(mocks.select).not.toHaveBeenCalled();
  });
});

describe("채팅 전송 검열", () => {
  it("부적절한 표현은 사용자 정보를 조회하거나 저장하기 전에 거부한다", async () => {
    const response = await POST(request("씨 발"));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("inappropriate content");
    expect(mocks.resolveActor).not.toHaveBeenCalled();
    expect(mocks.recordAbuseEventSoon).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-chat",
        action: "chat.message",
        reason: "inappropriate_content",
        detail: expect.objectContaining({ channel: "global" }),
      }),
    );
  });
});
