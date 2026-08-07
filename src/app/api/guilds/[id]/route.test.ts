import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = { selectRows: [] as unknown[][] };
  return {
    state,
    ensureUser: vi.fn(async () => "viewer"),
    select: vi.fn(() => {
      const rows = state.selectRows.shift() ?? [];
      const builder: Record<string, unknown> & PromiseLike<unknown[]> = {
        from: vi.fn(),
        where: vi.fn(),
        limit: vi.fn(async () => rows),
        then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
      };
      (builder.from as ReturnType<typeof vi.fn>).mockReturnValue(builder);
      (builder.where as ReturnType<typeof vi.fn>).mockReturnValue(builder);
      return builder;
    }),
  };
});

vi.mock("@/db", () => ({
  db: { select: mocks.select },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));
vi.mock("@/lib/server/ugcSafety", () => ({
  readBlockedUserIds: vi.fn(async () => []),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureUser.mockResolvedValue("viewer");
  mocks.state.selectRows = [];
});

describe("공개 길드 정보", () => {
  it("길드원 이름·레벨·직책을 정렬해 반환한다", async () => {
    mocks.state.selectRows = [
      [
        {
          id: 7,
          name: "테스트길드",
          masterId: "u-master",
          description: "함께 모험해요",
          nationName: "리베라",
          level: 2,
        },
      ],
      [
        { userId: "u-member", role: "member", joinedAt: new Date("2026-01-02") },
        { userId: "u-master", role: "member", joinedAt: new Date("2026-01-01") },
      ],
      [
        { userId: "u-master", value: { name: "길드장" } },
        { userId: "u-member", value: { name: "길드원" } },
      ],
      [
        { userId: "u-master", value: { level: 50 } },
        { userId: "u-member", value: { level: 21 } },
      ],
    ];

    const response = await GET(
      new Request("http://localhost/api/guilds/7"),
      { params: Promise.resolve({ id: "7" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      guild: {
        id: 7,
        name: "테스트길드",
        description: "함께 모험해요",
        level: 2,
      },
      members: [
        { name: "길드장", level: 50, role: "master" },
        { name: "길드원", level: 21, role: "member" },
      ],
    });
  });

  it("잘못된 길드 ID를 거부한다", async () => {
    const response = await GET(
      new Request("http://localhost/api/guilds/nope"),
      { params: Promise.resolve({ id: "nope" }) },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("bad_guild_id");
  });
});
