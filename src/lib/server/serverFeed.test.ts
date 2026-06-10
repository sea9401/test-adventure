// insertFeedEntry 정책 테스트 — opt-out(shareFeed=false) 기본 차단 vs force(전쟁 등
// 공적 사건) 우회, 그리고 force 여도 디바운스는 유지되는지. db 는 "테이블 → rows" 모킹.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { tableRows, inserted } = vi.hoisted(() => ({
  tableRows: new Map<unknown, unknown[]>(),
  inserted: [] as Array<{ table: unknown; values: unknown }>,
}));

vi.mock("@/db", () => {
  const chain = (rows: unknown[]) => {
    const c: {
      where: () => typeof c;
      orderBy: () => typeof c;
      offset: () => typeof c;
      limit: () => typeof c;
      then: (
        res: (v: unknown[]) => unknown,
        rej?: (e: unknown) => unknown,
      ) => Promise<unknown>;
    } = {
      where: () => c,
      orderBy: () => c,
      offset: () => c,
      limit: () => c,
      then: (res, rej) => Promise.resolve(rows).then(res, rej),
    };
    return c;
  };
  return {
    db: {
      select: () => ({
        from: (tbl: unknown) => chain(tableRows.get(tbl) ?? []),
      }),
      insert: (table: unknown) => ({
        values: async (values: unknown) => {
          inserted.push({ table, values });
        },
      }),
      delete: () => ({ where: async () => undefined }),
    },
  };
});

import { insertFeedEntry } from "@/lib/server/serverFeed";
import { serverFeed, users } from "@/db/schema";

describe("insertFeedEntry — opt-out vs force", () => {
  beforeEach(() => {
    tableRows.clear();
    inserted.length = 0;
    tableRows.set(serverFeed, []); // 디바운스 무·trim cut 무
  });

  it("opt-out(shareFeed=false) — 기본은 기록 안 함", async () => {
    tableRows.set(users, [{ shareFeed: false, gameName: "은둔자" }]);
    await insertFeedEntry("u1", "unique_drop", { itemId: "x" });
    expect(inserted).toHaveLength(0);
  });

  it("opt-out 이어도 force(전쟁 사건)는 기록", async () => {
    tableRows.set(users, [{ shareFeed: false, gameName: "은둔자" }]);
    await insertFeedEntry(
      "u1",
      "outpost_capture",
      { outpostId: "op-1", guildName: "검은바위" },
      { force: true },
    );
    expect(inserted).toHaveLength(1);
    expect(inserted[0].values).toMatchObject({
      userId: "u1",
      actorName: "은둔자",
      type: "outpost_capture",
    });
  });

  it("force 여도 디바운스(같은 유저+type 60s 내)는 유지 — 도배 방지", async () => {
    tableRows.set(users, [{ shareFeed: false, gameName: "은둔자" }]);
    tableRows.set(serverFeed, [{ id: 1 }]); // 최근 동일 type 항목 존재로 모킹
    await insertFeedEntry(
      "u1",
      "outpost_siege",
      { outpostId: "op-1", fortHp: 60, fortMaxHp: 100 },
      { force: true },
    );
    expect(inserted).toHaveLength(0);
  });

  it("공유 켠 유저 — 기존 타입은 force 없이 기록(기존 동작 보존)", async () => {
    tableRows.set(users, [{ shareFeed: true, gameName: "자랑꾼" }]);
    await insertFeedEntry("u1", "unique_drop", { itemId: "x" });
    expect(inserted).toHaveLength(1);
  });
});
