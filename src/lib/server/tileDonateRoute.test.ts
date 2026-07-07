// PR-2b — tileDonate(개인 인벤 통나무/철광석 → 정착지 재화 풀 crop/ore) 통합 검증.
//   stateful @/db mock + savesKv mock(개인 character.v2 재료) + REAL v2Settlement.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  outpostOccupations,
  tileSettlements,
  v2GuildResources,
  userSettlementResources,
} from "@/db/schema";

const ME = "u-me";
const GUILD = 7;

const { store, soloSave } = vi.hoisted(() => ({
  store: new Map<unknown, Array<Record<string, unknown>>>(),
  soloSave: new Map<string, Record<string, unknown>>(),
}));

vi.mock("@/adventure/data/v2/settlementWarfareConfig", async (orig) => ({
  ...(await orig<
    typeof import("@/adventure/data/v2/settlementWarfareConfig")
  >()),
  V2_TILE_PRODUCTION: true,
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => GUILD),
}));
vi.mock("@/lib/server/guildAdmin", () => ({
  isGuildMasterOrManager: vi.fn(async () => true),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, uid: string, _k: string, fb: unknown) =>
    soloSave.has(uid) ? soloSave.get(uid) : fb,
  ),
  upsertSave: vi.fn(
    async (_tx, uid: string, _k: string, v: Record<string, unknown>) => {
      soloSave.set(uid, v);
    },
  ),
}));
vi.mock("@/db", () => {
  const rows = (t: unknown) => store.get(t) ?? [];
  function selectChain() {
    let tbl: unknown = null;
    const c: Record<string, unknown> = {
      from: (t: unknown) => {
        tbl = t;
        return c;
      },
      where: () => c,
      for: () => c,
      orderBy: async () => rows(tbl),
      limit: async () => rows(tbl),
    };
    return c;
  }
  const insert = (t: unknown) => ({
    values: (v: Record<string, unknown>) => ({
      onConflictDoNothing: async () => {
        if (rows(t).length === 0) store.set(t, [{ ...v }]);
      },
      onConflictDoUpdate: async () => {
        const cur = rows(t)[0] ?? {};
        store.set(t, [{ ...cur, ...v }]);
      },
    }),
  });
  const update = (t: unknown) => ({
    set: (v: Record<string, unknown>) => ({
      where: async () => {
        const cur = rows(t)[0] ?? {};
        store.set(t, [{ ...cur, ...v }]);
      },
    }),
  });
  const tx = { select: selectChain, insert, update };
  return {
    db: {
      transaction: async (cb: (tx: unknown) => unknown) => cb(tx),
      select: selectChain,
      insert,
      update,
    },
  };
});

import { tileDonate } from "@/lib/server/tileVillageRoutes";

const TILE = "tile:3,5";

function seedSoloSettlementTile() {
  // 점령행 없음 → 솔로 founder 소유(tile_settlements.userId).
  store.set(tileSettlements, [
    { col: 3, row: 5, userId: ME, tier: "village", name: "내정착지" },
  ]);
}
function seedGuildOccupation(guildId = GUILD) {
  store.set(outpostOccupations, [
    { outpostId: TILE, occupiedByGuildId: guildId, g: guildId },
  ]);
}

beforeEach(() => {
  store.clear();
  soloSave.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("tileDonate — 개인 재료 → 정착지 풀 기부", () => {
  it("길드원: 통나무+철광석 기부 → 개인 재료 차감 + 길드 풀 crop/ore 적립", async () => {
    seedGuildOccupation();
    store.set(v2GuildResources, [
      { guildId: GUILD, gold: 0, settlement: { crop: 5, ore: 3 } },
    ]);
    soloSave.set(ME, { materials: { v2_timber: 100, v2_iron_ore: 50 } });

    const res = await tileDonate(ME, TILE, { v2_timber: 10, v2_iron_ore: 4 });
    expect(res.status).toBe(200);

    expect((soloSave.get(ME)!.materials as Record<string, number>)).toEqual({
      v2_timber: 90,
      v2_iron_ore: 46,
    });
    expect(store.get(v2GuildResources)![0].settlement).toEqual({
      crop: 15,
      ore: 7,
    });
  });

  it("솔로 소유자: 기부 차단 → 길드 영토 필요", async () => {
    seedSoloSettlementTile();
    store.set(userSettlementResources, [{ userId: ME, settlement: {} }]);
    soloSave.set(ME, { materials: { v2_timber: 20, v2_iron_ore: 10 } });

    const res = await tileDonate(ME, TILE, { v2_timber: 5, v2_iron_ore: 2 });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("need_guild_territory");

    expect((soloSave.get(ME)!.materials as Record<string, number>)).toEqual({
      v2_timber: 20,
      v2_iron_ore: 10,
    });
    expect(store.get(userSettlementResources)![0].settlement).toEqual({});
  });

  it("재료 부족 → 409 insufficient_material (차감/적립 없음)", async () => {
    seedGuildOccupation();
    store.set(v2GuildResources, [
      { guildId: GUILD, gold: 0, settlement: { crop: 1, ore: 1 } },
    ]);
    soloSave.set(ME, { materials: { v2_timber: 3 } });

    const res = await tileDonate(ME, TILE, { v2_timber: 10 });
    expect(res.status).toBe(409);
    // 보유분 불변, 풀 불변.
    expect((soloSave.get(ME)!.materials as Record<string, number>)).toEqual({
      v2_timber: 3,
    });
    expect(store.get(v2GuildResources)![0].settlement).toEqual({
      crop: 1,
      ore: 1,
    });
  });

  it("비소속(타 길드 점령) → 403 not_owner", async () => {
    seedGuildOccupation(999); // 내 길드(GUILD=7) 아님
    soloSave.set(ME, { materials: { v2_timber: 100 } });
    const res = await tileDonate(ME, TILE, { v2_timber: 10 });
    expect(res.status).toBe(403);
    expect((soloSave.get(ME)!.materials as Record<string, number>)).toEqual({
      v2_timber: 100,
    });
  });

  it("잘못된 기부(0·음수·미상 재료·빈 본문) → 400 bad_request (트랜잭션 전)", async () => {
    seedGuildOccupation();
    soloSave.set(ME, { materials: { v2_timber: 100 } });
    expect((await tileDonate(ME, TILE, { v2_timber: 0 })).status).toBe(400);
    expect((await tileDonate(ME, TILE, { v2_timber: -5 })).status).toBe(400);
    expect((await tileDonate(ME, TILE, { bogus: 5 })).status).toBe(400);
    expect((await tileDonate(ME, TILE, {})).status).toBe(400);
    // 어느 경우도 차감 없음.
    expect((soloSave.get(ME)!.materials as Record<string, number>)).toEqual({
      v2_timber: 100,
    });
  });
});
