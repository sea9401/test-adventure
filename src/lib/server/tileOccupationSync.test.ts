// 멤버십 동기화 헬퍼 — convertSoloTilesToGuild / revertGuildTilesToSolo 단위 테스트.
//   가짜 tx(drizzle 체인 흉내·컬럼 모양으로 select 구분) + v2GuildResources 모킹.

import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  occRows: [] as Array<{ outpostId: string }>, // revert 대상 점령행
  treasuryGold: 0, // 거점 금고 합산(단일 행 반환)
  guildGold: 0, // 길드 금고 현재 잔액
  guildUpserts: [] as Array<{ guildId: number; patch: { gold?: number } }>,
  setValues: [] as Array<Record<string, unknown>>, // update().set(v)
  deletes: 0, // delete 호출 수
}));

vi.mock("@/db", () => ({ db: { transaction: vi.fn() } }));
vi.mock("@/lib/server/v2GuildResources", () => ({
  lockGuildResources: vi.fn(async () => ({ gold: h.guildGold })),
  upsertGuildResources: vi.fn(async (_tx, guildId: number, patch: unknown) => {
    h.guildUpserts.push({ guildId, patch: patch as { gold?: number } });
  }),
}));

import {
  convertSoloTilesToGuild,
  revertGuildTilesToSolo,
} from "./tileOccupation";

type Tx = Parameters<typeof revertGuildTilesToSolo>[0];

function makeTx(): Tx {
  const tx = {
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          h.setValues.push(v);
        },
      }),
    }),
    select: (cols?: Record<string, unknown>) => ({
      from: () => ({
        where: async () =>
          cols && "gold" in cols ? [{ gold: h.treasuryGold }] : h.occRows,
      }),
    }),
    delete: () => ({
      where: async () => {
        h.deletes += 1;
      },
    }),
  };
  return tx as unknown as Tx;
}

function reset() {
  h.occRows = [];
  h.treasuryGold = 0;
  h.guildGold = 0;
  h.guildUpserts = [];
  h.setValues = [];
  h.deletes = 0;
}

describe("convertSoloTilesToGuild", () => {
  it("점령행 occupiedByGuildId 를 길드로 set", async () => {
    reset();
    await convertSoloTilesToGuild(makeTx(), "u1", 42);
    expect(h.setValues).toContainEqual({ occupiedByGuildId: 42 });
  });
});

describe("revertGuildTilesToSolo", () => {
  it("탈퇴(depositTreasury) — 금고 길드 입금 + 솔로 복귀 + 3행 정리", async () => {
    reset();
    h.occRows = [{ outpostId: "tile:1,1" }, { outpostId: "tile:2,2" }];
    h.treasuryGold = 100;
    h.guildGold = 50;
    await revertGuildTilesToSolo(makeTx(), {
      guildId: 7,
      userId: "u1",
      depositTreasury: true,
    });
    // 금고 합산(100)을 길드 금고(50)에 입금 → 150.
    expect(h.guildUpserts).toContainEqual({ guildId: 7, patch: { gold: 150 } });
    // 점령행 솔로 복귀.
    expect(h.setValues).toContainEqual({ occupiedByGuildId: null });
    // 금고/수비큐/영주 3행 delete.
    expect(h.deletes).toBe(3);
  });

  it("해산(depositTreasury=false) — 금고 입금 없이 솔로 복귀", async () => {
    reset();
    h.occRows = [{ outpostId: "tile:3,3" }];
    h.treasuryGold = 999; // 입금 안 함(해산=금고 소멸)
    await revertGuildTilesToSolo(makeTx(), {
      guildId: 7,
      depositTreasury: false,
    });
    expect(h.guildUpserts).toHaveLength(0);
    expect(h.setValues).toContainEqual({ occupiedByGuildId: null });
    expect(h.deletes).toBe(3);
  });

  it("대상 없음 — no-op(입금·복귀·delete 전부 없음)", async () => {
    reset();
    h.occRows = [];
    await revertGuildTilesToSolo(makeTx(), {
      guildId: 7,
      userId: "u1",
      depositTreasury: true,
    });
    expect(h.guildUpserts).toHaveLength(0);
    expect(h.setValues).toHaveLength(0);
    expect(h.deletes).toBe(0);
  });
});
