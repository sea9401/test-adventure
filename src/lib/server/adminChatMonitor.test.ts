import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { AdminChatTarget } from "@/lib/admin-chat-monitor";
import {
  adminChatMessageWhere,
  buildAdminChatMessagePage,
  paginateAdminChatTargets,
  readAdminChatTargets,
} from "./adminChatMonitor";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { select: mocks.select },
}));

function queryRows(rows: readonly unknown[]) {
  const query = {
    from: () => query,
    leftJoin: () => query,
    where: () => query,
    groupBy: () => query,
    then: (
      resolve: (value: readonly unknown[]) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject),
  };
  return query;
}

const targets: AdminChatTarget[] = [
  {
    targetKey: "global",
    kind: "global",
    label: "전체 채팅",
    latestMessageAt: "2026-08-27T09:00:00.000Z",
  },
  {
    targetKey: "trade",
    kind: "trade",
    label: "거래 채팅",
    latestMessageAt: null,
  },
  {
    targetKey: "guild:3",
    kind: "guild",
    scopeId: 3,
    label: "은하 길드",
    latestMessageAt: "2026-08-27T08:00:00.000Z",
  },
  {
    targetKey: "room:7",
    kind: "room",
    scopeId: 7,
    label: "비밀 작전방",
    visibility: "private",
    ownerId: "owner-1",
    ownerName: "방장",
    memberCount: 2,
    latestMessageAt: "2026-08-27T07:00:00.000Z",
  },
  {
    targetKey: "room:9",
    kind: "room",
    scopeId: 9,
    label: "공개 수다방",
    visibility: "public",
    ownerId: "owner-2",
    ownerName: "모험가",
    memberCount: 1,
    latestMessageAt: null,
  },
];

describe("paginateAdminChatTargets", () => {
  it("고정 채널을 앞에 두고 동적 대상을 최근 활동순으로 정렬한다", () => {
    const result = paginateAdminChatTargets(targets, {
      kind: "all",
      visibility: "all",
      q: "",
      offset: 0,
      limit: 10,
    });

    expect(result.targets.map((target) => target.targetKey)).toEqual([
      "global",
      "trade",
      "guild:3",
      "room:7",
      "room:9",
    ]);
    expect(result.total).toBe(5);
    expect(result.hasMore).toBe(false);
  });

  it("종류·공개 여부·이름 검색을 함께 적용한다", () => {
    const result = paginateAdminChatTargets(targets, {
      kind: "room",
      visibility: "private",
      q: "작전",
      offset: 0,
      limit: 10,
    });

    expect(result.targets.map((target) => target.targetKey)).toEqual([
      "room:7",
    ]);
  });

  it("숫자 ID 검색과 offset 페이지를 적용한다", () => {
    expect(
      paginateAdminChatTargets(targets, {
        kind: "all",
        visibility: "all",
        q: "3",
        offset: 0,
        limit: 10,
      }).targets.map((target) => target.targetKey),
    ).toEqual(["guild:3"]);

    const page = paginateAdminChatTargets(targets, {
      kind: "all",
      visibility: "all",
      q: "",
      offset: 2,
      limit: 2,
    });
    expect(page.targets.map((target) => target.targetKey)).toEqual([
      "guild:3",
      "room:7",
    ]);
    expect(page.total).toBe(5);
    expect(page.hasMore).toBe(true);
  });
});

describe("readAdminChatTargets", () => {
  beforeEach(() => {
    mocks.select.mockReset();
  });

  it("SQL 집계 시각이 문자열이어도 ISO 시각으로 직렬화한다", async () => {
    mocks.select
      .mockReturnValueOnce(
        queryRows([
          {
            channel: "global",
            latestMessageAt: "2026-08-27 21:36:00",
          },
        ]),
      )
      .mockReturnValueOnce(queryRows([]))
      .mockReturnValueOnce(queryRows([]))
      .mockReturnValueOnce(queryRows([]))
      .mockReturnValueOnce(queryRows([]));

    const result = await readAdminChatTargets({
      kind: "all",
      visibility: "all",
      q: "",
      offset: 0,
      limit: 50,
    });

    expect(result.targets[0]).toMatchObject({
      targetKey: "global",
      latestMessageAt: "2026-08-27T21:36:00.000Z",
    });
  });
});

describe("adminChatMessageWhere", () => {
  it("사용자방 ID와 room 채널만 선택하고 guild 범위를 제외한다", () => {
    const compiled = new PgDialect().sqlToQuery(
      adminChatMessageWhere({
        kind: "room",
        scopeId: 7,
        beforeId: 31,
        limit: 100,
      }),
    );

    expect(compiled.sql).toContain('"messages"."channel" = $1');
    expect(compiled.sql).toContain('"messages"."room_id" = $2');
    expect(compiled.sql).toContain('"messages"."guild_id" is null');
    expect(compiled.sql).toContain('"messages"."id" < $3');
    expect(compiled.params).toEqual(["room", 7, 31]);
  });

  it("길드방 ID와 guild 채널만 선택하고 room 범위를 제외한다", () => {
    const compiled = new PgDialect().sqlToQuery(
      adminChatMessageWhere({
        kind: "guild",
        scopeId: 3,
        beforeId: null,
        limit: 100,
      }),
    );

    expect(compiled.sql).toContain('"messages"."channel" = $1');
    expect(compiled.sql).toContain('"messages"."guild_id" = $2');
    expect(compiled.sql).toContain('"messages"."room_id" is null');
    expect(compiled.params).toEqual(["guild", 3]);
  });

  it("전체 채팅은 guild와 room 범위가 모두 없는 메시지만 선택한다", () => {
    const compiled = new PgDialect().sqlToQuery(
      adminChatMessageWhere({
        kind: "global",
        scopeId: null,
        beforeId: null,
        limit: 100,
      }),
    );

    expect(compiled.sql).toContain('"messages"."channel" = $1');
    expect(compiled.sql).toContain('"messages"."guild_id" is null');
    expect(compiled.sql).toContain('"messages"."room_id" is null');
    expect(compiled.params).toEqual(["global"]);
  });
});

describe("buildAdminChatMessagePage", () => {
  const rows = [31, 30, 29].map((id) => ({
    id,
    authorUserId: `user-${id}`,
    name: `모험가${id}`,
    className: "전사",
    title: null,
    content: `메시지 ${id}`,
    itemLink: null,
    createdAt: new Date(`2026-08-27T08:00:${id - 20}.000Z`),
  }));

  it("limit 다음 행으로 이전 페이지 존재 여부와 커서를 계산한다", () => {
    expect(buildAdminChatMessagePage(rows, 2)).toEqual({
      messages: [
        expect.objectContaining({ id: 31, createdAt: "2026-08-27T08:00:11.000Z" }),
        expect.objectContaining({ id: 30, createdAt: "2026-08-27T08:00:10.000Z" }),
      ],
      hasMore: true,
      nextBeforeId: 30,
      latestMessageAt: new Date("2026-08-27T08:00:11.000Z"),
    });
  });

  it("마지막 페이지에는 다음 커서를 만들지 않는다", () => {
    expect(buildAdminChatMessagePage(rows.slice(0, 2), 2)).toEqual(
      expect.objectContaining({ hasMore: false, nextBeforeId: null }),
    );
  });
});
