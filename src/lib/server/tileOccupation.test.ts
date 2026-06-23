// tileOccupation 헬퍼 — 가짜 tx 위 단위 테스트(drizzle 체인 흉내·DB 미접촉).
//   길드 게이팅(길드원만 점령행 생성) + 철거 정리(4개 전쟁 테이블 delete) 검증.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: { transaction: vi.fn() } }));

import { createTileGuildOccupation, removeTileWarfare } from "./tileOccupation";

type Tx = Parameters<typeof removeTileWarfare>[0];

function makeTx(guildRows: Array<{ guildId: number }>) {
  const inserted: unknown[] = [];
  let deletes = 0;
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => guildRows }),
      }),
    }),
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoNothing: async () => {
          inserted.push(v);
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        deletes += 1;
      },
    }),
  };
  return { tx: tx as unknown as Tx, inserted, getDeletes: () => deletes };
}

describe("createTileGuildOccupation", () => {
  it("길드원 → 점령행 생성(guildId 반환)", async () => {
    const { tx, inserted } = makeTx([{ guildId: 42 }]);
    const r = await createTileGuildOccupation(tx, {
      userId: "u1",
      col: 2,
      row: 3,
      tier: "frontier",
    });
    expect(r).toEqual({ created: true, guildId: 42 });
    expect(inserted).toHaveLength(1);
    expect((inserted[0] as { outpostId: string }).outpostId).toBe("tile:2,3");
    expect((inserted[0] as { occupiedByGuildId: number }).occupiedByGuildId).toBe(
      42,
    );
  });

  it("길드 미소속 → 점령행 미생성(개인 정착지)", async () => {
    const { tx, inserted } = makeTx([]);
    const r = await createTileGuildOccupation(tx, {
      userId: "solo",
      col: 0,
      row: 0,
      tier: "frontier",
    });
    expect(r).toEqual({ created: false, guildId: null });
    expect(inserted).toHaveLength(0);
  });
});

describe("removeTileWarfare", () => {
  it("전쟁 4테이블(점령/금고/수비큐/영주) 모두 delete", async () => {
    const { tx, getDeletes } = makeTx([]);
    await removeTileWarfare(tx, 4, 4);
    expect(getDeletes()).toBe(4);
  });
});
