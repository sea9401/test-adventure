// tileOccupation 헬퍼 — 가짜 tx 위 단위 테스트(drizzle 체인 흉내·DB 미접촉).
//   소유 분기(길드원=길드 소유·무길드=솔로 소유) + 철거 정리(전쟁 4테이블 + 생산 마을 delete) 검증.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: { transaction: vi.fn() } }));

import { createTileOccupation, removeTileWarfare } from "./tileOccupation";

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

describe("createTileOccupation", () => {
  it("길드원 → 길드 점령행 생성(guildId 반환)", async () => {
    const { tx, inserted } = makeTx([{ guildId: 42 }]);
    const r = await createTileOccupation(tx, {
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

  it("길드 미소속 → 솔로 점령행 생성(occupiedByGuildId=null)", async () => {
    const { tx, inserted } = makeTx([]);
    const r = await createTileOccupation(tx, {
      userId: "solo",
      col: 0,
      row: 0,
      tier: "frontier",
    });
    expect(r).toEqual({ created: true, guildId: null });
    expect(inserted).toHaveLength(1);
    expect((inserted[0] as { occupiedByUserId: string }).occupiedByUserId).toBe(
      "solo",
    );
    expect(
      (inserted[0] as { occupiedByGuildId: number | null }).occupiedByGuildId,
    ).toBeNull();
  });
});

describe("removeTileWarfare", () => {
  it("전쟁 4테이블(점령/금고/수비큐/영주) + 생산 마을(outpost_villages) 모두 delete", async () => {
    const { tx, getDeletes } = makeTx([]);
    await removeTileWarfare(tx, 4, 4);
    // 점령/금고/수비큐/영주 + 생산 마을 = 5. 생산 마을을 빼면 철거→재개척 시 옛 마을 부활.
    expect(getDeletes()).toBe(5);
  });
});
