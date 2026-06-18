// insertFeedEntry 정책 테스트 — 항상 기록(옛 opt-out/force 제거, 2026-06-13) +
// 디바운스(같은 유저+type 60s 내 차단). db 는 "테이블 → rows" 모킹.

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

describe("insertFeedEntry — 항상 기록 + 디바운스", () => {
  beforeEach(() => {
    tableRows.clear();
    inserted.length = 0;
    tableRows.set(serverFeed, []); // 디바운스 무·trim cut 무
  });

  it("자랑거리 — 기록 + actorName 스냅샷", async () => {
    tableRows.set(users, [{ gameName: "자랑꾼" }]);
    await insertFeedEntry("u1", "unique_drop", { itemId: "x" });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].values).toMatchObject({
      userId: "u1",
      actorName: "자랑꾼",
      type: "unique_drop",
    });
  });

  it("전쟁 사건 — 동일 경로로 기록(옛 force 구분 없음)", async () => {
    tableRows.set(users, [{ gameName: "은둔자" }]);
    await insertFeedEntry("u1", "outpost_capture", {
      outpostId: "op-1",
      guildName: "검은바위",
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].values).toMatchObject({
      userId: "u1",
      actorName: "은둔자",
      type: "outpost_capture",
    });
  });

  it("디바운스 — 같은 유저+type 60s 내 항목 있으면 차단(도배 방지)", async () => {
    tableRows.set(users, [{ gameName: "은둔자" }]);
    tableRows.set(serverFeed, [{ id: 1 }]); // 최근 동일 type 항목 존재로 모킹
    await insertFeedEntry("u1", "outpost_siege", {
      outpostId: "op-1",
      fortHp: 60,
      fortMaxHp: 100,
    });
    expect(inserted).toHaveLength(0);
  });

  it("user row 없음 — 조용히 skip", async () => {
    tableRows.set(users, []);
    await insertFeedEntry("u1", "unique_drop", { itemId: "x" });
    expect(inserted).toHaveLength(0);
  });
});
