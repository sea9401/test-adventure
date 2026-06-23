// T1a — 솔로/길드 정착지 소유 추상화 + 자원 라우팅 단위 테스트(가짜 tx·DB 미접촉).

import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: { transaction: vi.fn() } }));

import {
  outpostOccupations,
  tileSettlements,
  userSettlementResources,
  v2GuildResources,
} from "@/db/schema";
import {
  lockSettlementResources,
  resolveTileSettlementOwner,
  type SettlementOwner,
} from "./v2Settlement";

function makeTx(rowsByTable: Map<unknown, unknown[]>) {
  const inserted: unknown[] = [];
  function chain() {
    let tbl: unknown = null;
    const c: Record<string, unknown> = {
      from: (t: unknown) => {
        tbl = t;
        return c;
      },
      where: () => c,
      for: () => c,
      limit: async () => rowsByTable.get(tbl) ?? [],
    };
    return c;
  }
  const tx = {
    select: () => chain(),
    insert: (t: unknown) => {
      inserted.push(t);
      return {
        values: () => ({
          onConflictDoNothing: async () => {},
          onConflictDoUpdate: async () => {},
        }),
      };
    },
  };
  type Tx = Parameters<typeof resolveTileSettlementOwner>[0];
  return { tx: tx as unknown as Tx, inserted };
}

describe("resolveTileSettlementOwner", () => {
  it("점령행(occupiedByGuildId) 있으면 길드", async () => {
    const { tx } = makeTx(new Map([[outpostOccupations, [{ g: 7 }]]]));
    expect(await resolveTileSettlementOwner(tx, 2, 3)).toEqual({
      kind: "guild",
      guildId: 7,
    });
  });

  it("점령행 없고 tile_settlements 있으면 솔로(founder)", async () => {
    const { tx } = makeTx(
      new Map<unknown, unknown[]>([
        [outpostOccupations, []],
        [tileSettlements, [{ userId: "u-solo" }]],
      ]),
    );
    expect(await resolveTileSettlementOwner(tx, 4, 5)).toEqual({
      kind: "solo",
      userId: "u-solo",
    });
  });

  it("둘 다 없으면 null", async () => {
    const { tx } = makeTx(
      new Map<unknown, unknown[]>([
        [outpostOccupations, []],
        [tileSettlements, []],
      ]),
    );
    expect(await resolveTileSettlementOwner(tx, 0, 0)).toBeNull();
  });
});

describe("lockSettlementResources — 소유별 풀 라우팅", () => {
  it("길드 → v2_guild_resources 풀", async () => {
    const { tx, inserted } = makeTx(new Map());
    const owner: SettlementOwner = { kind: "guild", guildId: 7 };
    await lockSettlementResources(tx, owner);
    expect(inserted).toContain(v2GuildResources);
    expect(inserted).not.toContain(userSettlementResources);
  });

  it("솔로 → user_settlement_resources 풀", async () => {
    const { tx, inserted } = makeTx(new Map());
    const owner: SettlementOwner = { kind: "solo", userId: "u-solo" };
    await lockSettlementResources(tx, owner);
    expect(inserted).toContain(userSettlementResources);
    expect(inserted).not.toContain(v2GuildResources);
  });
});
