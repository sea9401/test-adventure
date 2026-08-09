import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(async () => "u-chat"),
  resolveActor: vi.fn(),
  recordAbuseEventSoon: vi.fn(),
  getViewerGuild: vi.fn(),
  readBlockedUserIds: vi.fn(),
  readCosmetics: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  channelRows: [] as Array<Array<Record<string, unknown>>>,
  select: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/resolveActor", () => ({ resolveActor: mocks.resolveActor }));
vi.mock("@/lib/server/bulletinAccess", () => ({
  getViewerGuild: mocks.getViewerGuild,
}));
vi.mock("@/lib/server/chatProgress", () => ({ recordUserChatMessageInTx: vi.fn() }));
vi.mock("@/lib/server/museunCosmetics", () => ({
  readMuseunCosmeticAppearanceMap: mocks.readCosmetics,
}));
vi.mock("@/lib/server/abuseLog", () => ({
  clientIpFromRequest: vi.fn(() => "127.0.0.1"),
  recordAbuseEventSoon: mocks.recordAbuseEventSoon,
}));
vi.mock("@/lib/server/ugcSafety", () => ({
  readBlockedUserIds: mocks.readBlockedUserIds,
  requireCurrentUgcConsent: vi.fn(),
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
  mocks.channelRows = [];
  mocks.ensureUser.mockResolvedValue("u-chat");
  mocks.getViewerGuild.mockResolvedValue({ guildId: 7 });
  mocks.readBlockedUserIds.mockResolvedValue([]);
  mocks.readCosmetics.mockResolvedValue(new Map());
  mocks.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: async () =>
            mocks.channelRows.length > 0
              ? (mocks.channelRows.shift() ?? [])
              : mocks.rows,
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
    const response = await GET(new Request("http://localhost/api/chat?channel=global"));
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

  it("거래 채팅을 전체 채팅과 다른 채널로 반환한다", async () => {
    mocks.rows = [{ ...row(6), channel: "trade" }];
    const response = await GET(new Request("http://localhost/api/chat?channel=trade"));
    const body = (await response.json()) as Array<{ id: number; channel: string }>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject([{ id: 6, channel: "trade" }]);
  });

  it("서버에 저장된 장비 링크를 안전하게 파싱해 반환한다", async () => {
    mocks.rows = [
      {
        ...row(6),
        itemLink: {
          kind: "equipment",
          itemId: "v2_iron_sword",
          enhance: { level: 4, bonusPct: 999 },
        },
      },
    ];
    const response = await GET(new Request("http://localhost/api/chat?channel=global"));
    const [message] = (await response.json()) as Array<{
      itemLink: { itemId: string; enhance?: { level: number; bonusPct: number } };
    }>;

    expect(message.itemLink).toMatchObject({
      itemId: "v2_iron_sword",
      enhance: { level: 4 },
    });
    expect(message.itemLink.enhance?.bonusPct).not.toBe(999);
  });

  it("잘못된 afterId는 DB 조회 전에 거부한다", async () => {
    const response = await GET(
      new Request("http://localhost/api/chat?channel=global&afterId=-1"),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("invalid after id");
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("한 인증으로 기본 채널 세 개를 묶고 외형 조회도 한 번만 한다", async () => {
    mocks.channelRows = [
      [row(1)],
      [{ ...row(2), channel: "trade" }],
      [{ ...row(3), channel: "guild" }],
    ];
    const response = await GET(
      new Request(
        "http://localhost/api/chat?channels=main&includeGuild=1&globalAfterId=0&tradeAfterId=0&guildAfterId=0",
      ),
    );
    const body = (await response.json()) as Record<string, Array<{ id: number }>>;

    expect(response.status).toBe(200);
    expect(body.global.map((message) => message.id)).toEqual([1]);
    expect(body.trade.map((message) => message.id)).toEqual([2]);
    expect(body.guild.map((message) => message.id)).toEqual([3]);
    expect(mocks.ensureUser).toHaveBeenCalledTimes(1);
    expect(mocks.readBlockedUserIds).toHaveBeenCalledTimes(1);
    expect(mocks.readCosmetics).toHaveBeenCalledTimes(1);
  });
});

describe("채팅 전송 검열", () => {
  it("잘못된 아이템 링크 형식은 사용자 정보를 조회하기 전에 거부한다", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: "장비 공유",
          channel: "global",
          itemIid: 123,
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("invalid item link");
    expect(mocks.resolveActor).not.toHaveBeenCalled();
  });

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
