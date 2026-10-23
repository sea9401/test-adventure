import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => {
      const builder = {
        from: vi.fn(),
        where: vi.fn(),
        limit: vi.fn(async () => mocks.rows),
      };
      builder.from.mockReturnValue(builder);
      builder.where.mockReturnValue(builder);
      return builder;
    }),
  },
}));

import { resolveUgcSource } from "./ugcSafety";

const createdAt = new Date("2026-10-24T00:00:00Z");

function inboxRow(kind: string, payload: Record<string, unknown>) {
  return {
    recipientUserId: "u-viewer",
    senderUserId: "u-sender",
    senderName: "길마",
    kind,
    message: null,
    payload,
    createdAt,
  };
}

beforeEach(() => {
  mocks.rows = [];
});

describe("우편함 쪽지 신고 대상 해석", () => {
  it("길드 쪽지를 신고하면 보낸 사람과 본문을 남긴다", async () => {
    mocks.rows = [
      inboxRow("guild_message", { text: "토벌전 모여요", guild_id: 7, guild_name: "새벽별" }),
    ];

    const source = await resolveUgcSource("u-viewer", "inbox_message", "11");

    expect(source).toMatchObject({
      targetUserId: "u-sender",
      targetName: "길마",
      contentSnapshot: "토벌전 모여요",
    });
  });

  it("1:1 쪽지도 payload 본문을 신고 기록에 남긴다", async () => {
    mocks.rows = [inboxRow("user_message", { text: "안녕하세요" })];

    const source = await resolveUgcSource("u-viewer", "inbox_message", "12");

    expect(source?.contentSnapshot).toBe("안녕하세요");
  });

  it("사람이 쓴 쪽지가 아닌 우편은 신고 대상이 아니다", async () => {
    mocks.rows = [inboxRow("guild_invite", { invite_id: 1 })];

    expect(await resolveUgcSource("u-viewer", "inbox_message", "13")).toBeNull();
  });
});
