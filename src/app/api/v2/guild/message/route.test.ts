import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUILD_MESSAGE_DAILY_LIMIT,
  GUILD_MESSAGE_MAX_LENGTH,
} from "@/adventure/data/guild";

const mocks = vi.hoisted(() => {
  const state = {
    selectRows: [] as unknown[][],
    inserted: null as Record<string, unknown>[] | null,
  };
  const tx = {
    select: vi.fn(() => {
      const rows = state.selectRows.shift() ?? [];
      const builder = {
        from: vi.fn(),
        where: vi.fn(),
        for: vi.fn(),
        limit: vi.fn(async () => rows),
        then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
      };
      builder.from.mockReturnValue(builder);
      builder.where.mockReturnValue(builder);
      builder.for.mockReturnValue(builder);
      return builder;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>[]) => {
        state.inserted = values;
      }),
    })),
  };
  return {
    state,
    tx,
    ensureUser: vi.fn(async () => "u-master"),
    rateLimit: vi.fn(() => null),
    requireConsent: vi.fn(async (): Promise<Response | null> => null),
    requireTradeParticipants: vi.fn(async () => undefined),
  };
});

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: typeof mocks.tx) => unknown) =>
      callback(mocks.tx),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: mocks.rateLimit,
}));
vi.mock("@/lib/server/ugcSafety", () => ({
  requireCurrentUgcConsent: mocks.requireConsent,
}));
vi.mock("@/lib/server/tradeSuspension", () => ({
  TradeSuspendedError: class TradeSuspendedError extends Error {},
  requireTradeParticipants: mocks.requireTradeParticipants,
  tradeSuspendedResponse: () => new Response("suspended", { status: 403 }),
}));

import { GET, POST } from "./route";

const MEMBERS = [
  { userId: "u-master" },
  { userId: "u-manager" },
  { userId: "u-a" },
  { userId: "u-b" },
];

// 라우트의 select 순서: 내 멤버십 → 길드(잠금) → 내 닉네임 → 길드원 목록 → 최근 발송 수 → 차단 관계.
function sendRows({
  role = "master",
  masterId = "u-master",
  sentToday = 0,
  blocks = [] as { blockerUserId: string; blockedUserId: string }[],
} = {}) {
  return [
    [{ guildId: 7, role }],
    [{ masterId, name: "새벽별" }],
    [{ name: "길마" }],
    MEMBERS,
    [{ n: sentToday }],
    blocks,
  ];
}

function request(text: unknown) {
  return new Request("http://localhost/api/v2/guild/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.inserted = null;
  mocks.state.selectRows = sendRows();
  mocks.ensureUser.mockResolvedValue("u-master");
  mocks.rateLimit.mockReturnValue(null);
  mocks.requireConsent.mockResolvedValue(null);
  mocks.requireTradeParticipants.mockResolvedValue(undefined);
});

describe("길드 쪽지 발송", () => {
  it("마스터가 보낸 쪽지를 본인을 뺀 길드원 우편함에 한 통씩 넣는다", async () => {
    const response = await POST(request("  오늘 밤 9시 토벌전 모여요  "));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      sentCount: 3,
      remaining: GUILD_MESSAGE_DAILY_LIMIT - 1,
      limit: GUILD_MESSAGE_DAILY_LIMIT,
    });
    const inserted = mocks.state.inserted ?? [];
    expect(inserted.map((row) => row.userId)).toEqual(["u-manager", "u-a", "u-b"]);
    expect(inserted[0]).toMatchObject({
      kind: "guild_message",
      payload: { text: "오늘 밤 9시 토벌전 모여요", guild_id: 7, guild_name: "새벽별" },
      fromUserId: "u-master",
      fromName: "길마",
    });
    // 한 번의 발송은 같은 시각으로 묶여야 길드 단위 횟수를 셀 수 있다.
    const stamps = new Set(inserted.map((row) => (row.createdAt as Date).getTime()));
    expect(stamps.size).toBe(1);
  });

  it("관리자도 보낼 수 있다", async () => {
    mocks.ensureUser.mockResolvedValue("u-manager");
    mocks.state.selectRows = sendRows({ role: "manager" });

    const response = await POST(request("공지"));

    expect(response.status).toBe(200);
    expect((mocks.state.inserted ?? []).map((row) => row.userId)).toEqual([
      "u-master",
      "u-a",
      "u-b",
    ]);
  });

  it("일반 길드원은 보낼 수 없다", async () => {
    mocks.ensureUser.mockResolvedValue("u-a");
    mocks.state.selectRows = sendRows({ role: "member" });

    const response = await POST(request("공지"));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("not_manager");
    expect(mocks.state.inserted).toBeNull();
  });

  it("길드가 없으면 거부한다", async () => {
    mocks.state.selectRows = [[]];

    const response = await POST(request("공지"));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("no_guild");
  });

  it("빈 내용과 길이 초과를 거부한다", async () => {
    const empty = await POST(request("   "));
    expect(empty.status).toBe(400);
    expect((await empty.json()).error).toBe("empty_text");

    const long = await POST(request("가".repeat(GUILD_MESSAGE_MAX_LENGTH + 1)));
    expect(long.status).toBe(400);
    expect((await long.json()).error).toBe("text_too_long");
    expect(mocks.state.inserted).toBeNull();
  });

  it("길드 단위 24시간 한도를 넘으면 거부한다", async () => {
    mocks.state.selectRows = sendRows({ sentToday: GUILD_MESSAGE_DAILY_LIMIT });

    const response = await POST(request("공지"));

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "daily_limit",
      remaining: 0,
    });
    expect(mocks.state.inserted).toBeNull();
  });

  it("어느 쪽이든 차단 관계인 길드원은 받는 대상에서 뺀다", async () => {
    mocks.state.selectRows = sendRows({
      blocks: [
        { blockerUserId: "u-a", blockedUserId: "u-master" },
        { blockerUserId: "u-master", blockedUserId: "u-b" },
      ],
    });

    const response = await POST(request("공지"));

    expect(response.status).toBe(200);
    expect((await response.json()).sentCount).toBe(1);
    expect((mocks.state.inserted ?? []).map((row) => row.userId)).toEqual([
      "u-manager",
    ]);
  });

  it("받을 길드원이 없으면 횟수를 쓰지 않고 거부한다", async () => {
    mocks.state.selectRows = [
      [{ guildId: 7, role: "master" }],
      [{ masterId: "u-master", name: "새벽별" }],
      [{ name: "길마" }],
      [{ userId: "u-master" }],
      [{ n: 0 }],
      [],
    ];

    const response = await POST(request("공지"));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("no_recipients");
    expect(mocks.state.inserted).toBeNull();
  });

  it("커뮤니티 운영정책 동의가 없으면 거부한다", async () => {
    mocks.requireConsent.mockResolvedValue(
      new Response("ugc consent required", { status: 403 }),
    );

    const response = await POST(request("공지"));

    expect(response.status).toBe(403);
    expect(mocks.state.inserted).toBeNull();
  });
});

describe("길드 쪽지 남은 횟수 조회", () => {
  it("마스터·관리자에게 오늘 남은 횟수를 알려준다", async () => {
    mocks.state.selectRows = [
      [{ guildId: 7, role: "master" }],
      [{ masterId: "u-master", name: "새벽별" }],
      MEMBERS,
      [{ n: 1 }],
    ];

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      remaining: GUILD_MESSAGE_DAILY_LIMIT - 1,
      limit: GUILD_MESSAGE_DAILY_LIMIT,
      recipientCount: 3,
    });
  });
});
