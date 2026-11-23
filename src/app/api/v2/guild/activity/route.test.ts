import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-viewer"),
}));
vi.mock("@/lib/server/museunCosmetics", () => ({
  readMuseunCosmeticAppearanceMap: vi.fn(
    async () => new Map([["u-actor", { profileBorder: "border-test" }]]),
  ),
}));

import { db } from "@/db";
import { GET } from "./route";

function queueSelectResults(results: unknown[][]) {
  vi.mocked(db.select).mockImplementation(() => {
    const rows = results.shift() ?? [];
    const query = Object.assign(Promise.resolve(rows), {
      from: () => query,
      where: () => query,
      limit: () => query,
      orderBy: () => query,
    });
    return query as never;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("길드 활동 내역 조회", () => {
  it("활동한 사람의 이름·프사·테두리를 함께 내려준다", async () => {
    queueSelectResults([
      [{ guildId: 7 }],
      [
        {
          id: 1,
          type: "gold_deposit",
          actorUserId: "u-actor",
          targetUserId: null,
          meta: { amount: 500 },
          createdAt: "2026-11-23T00:00:00.000Z",
        },
        {
          id: 2,
          type: "member_join",
          actorUserId: "u-actor",
          targetUserId: "u-new",
          meta: null,
          createdAt: "2026-11-22T00:00:00.000Z",
        },
      ],
      [
        { userId: "u-actor", value: { name: "금고지기", gender: "female2" } },
        { userId: "u-new", value: { name: "새내기", gender: "male3" } },
      ],
    ]);

    const body = await (await GET()).json();

    expect(body.activity[0].person).toEqual({
      name: "금고지기",
      avatar: "female2",
      profileBorder: "border-test",
    });
    // 가입 기록의 주인공은 받아 준 사람이 아니라 들어온 사람이다.
    expect(body.activity[1].person).toEqual({
      name: "새내기",
      avatar: "male3",
      profileBorder: null,
    });
  });
});
