// 멤버십 훅 단위 테스트 — convertSoloTilesToGuild / releaseMemberFromGuildTiles /
//   neutralizeGuildTiles. 영토=길드 소유 모델: 탈퇴=멤버만 분리(타일 길드 잔류), 해산=중립화(빈 땅).
//   가짜 tx(drizzle 체인 흉내)로 호출 형태만 검증.

import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  occRows: [] as Array<{ outpostId: string }>, // 길드 타일 점령행
  setValues: [] as Array<Record<string, unknown>>, // update().set(v)
  deletes: 0, // delete 호출 수
}));

vi.mock("@/db", () => ({ db: { transaction: vi.fn() } }));

import {
  convertSoloTilesToGuild,
  neutralizeGuildTiles,
  releaseMemberFromGuildTiles,
} from "./tileOccupation";

type Tx = Parameters<typeof neutralizeGuildTiles>[0];

function makeTx(): Tx {
  const tx = {
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          h.setValues.push(v);
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: async () => h.occRows,
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
  h.setValues = [];
  h.deletes = 0;
}

describe("convertSoloTilesToGuild — 가입/창단", () => {
  it("잔존 솔로 타일 점령행 occupiedByGuildId 를 길드로 set", async () => {
    reset();
    await convertSoloTilesToGuild(makeTx(), "u1", 42);
    expect(h.setValues).toContainEqual({ occupiedByGuildId: 42 });
  });
});

describe("releaseMemberFromGuildTiles — 탈퇴/추방", () => {
  it("길드 타일 있음 → 떠난 멤버 영주/수비 2행만 정리(점령행은 길드 잔류)", async () => {
    reset();
    h.occRows = [{ outpostId: "tile:1,1" }, { outpostId: "tile:2,2" }];
    await releaseMemberFromGuildTiles(makeTx(), 7, "u1");
    expect(h.deletes).toBe(2); // 영주 + 수비 등록만
    expect(h.setValues).toHaveLength(0); // occupiedByGuildId 무변동 = 길드가 영지 유지
  });

  it("대상 타일 없음 → no-op", async () => {
    reset();
    h.occRows = [];
    await releaseMemberFromGuildTiles(makeTx(), 7, "u1");
    expect(h.deletes).toBe(0);
  });
});

describe("neutralizeGuildTiles — 해산(중립화)", () => {
  it("길드 타일 있음 → 금고·수비·영주·점령행·정착지 5행 제거(빈 땅)", async () => {
    reset();
    h.occRows = [{ outpostId: "tile:3,3" }];
    await neutralizeGuildTiles(makeTx(), 7);
    // treasury + defenders + lords + occupations + tile_settlements
    expect(h.deletes).toBe(5);
  });

  it("대상 타일 없음 → no-op", async () => {
    reset();
    h.occRows = [];
    await neutralizeGuildTiles(makeTx(), 7);
    expect(h.deletes).toBe(0);
  });
});
