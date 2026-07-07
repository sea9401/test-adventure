// T1b — 타일 정착지 생산(build/upgrade)이 길드/솔로 소유로 동작하고 tile_settlements.tier 를
//   동기화하는지 통합 검증. 단일 타일 시나리오용 표(table) 키 stateful @/db mock + REAL v2Settlement.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  outpostOccupations,
  outpostVillages,
  tileSettlements,
  v2GuildResources,
  userSettlementResources,
} from "@/db/schema";
import {
  MAX_SLOTS_BY_TIER,
  UPGRADE_COST,
  VILLAGE_BUILD_GOLD_COST,
} from "@/adventure/data/v2/settlement";

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
  upsertSave: vi.fn(async (_tx, uid: string, _k: string, v: Record<string, unknown>) => {
    soloSave.set(uid, v);
  }),
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

import {
  tileBuild,
  tileUpgrade,
} from "@/lib/server/tileVillageRoutes";
import {
  villageOwner,
  normalizeVillageToOwner,
  type VillageRow,
} from "@/lib/server/v2Settlement";
import {
  scaledTileGoldCost,
  scaledTileResourceCost,
} from "@/adventure/data/v2/tileConfig";

const TILE = "tile:3,5"; // 리베라(4,4) 체비셰프 거리 1 → 비용 1.5배
// 거리 스케일된 마을 건설비(서버 과금과 일치).
const BUILD_COST = scaledTileGoldCost(VILLAGE_BUILD_GOLD_COST, 3, 5);

function seedTile(tier = "frontier") {
  // name = 개척(found) 때 정한 이름 — 마을 건설이 이 이름을 그대로 재사용한다.
  store.set(tileSettlements, [
    { col: 3, row: 5, userId: ME, tier, name: "개척이름" },
  ]);
}
function village(over: Partial<VillageRow>): Record<string, unknown> {
  return {
    outpostId: TILE,
    guildId: null,
    ownerUserId: null,
    tier: "village",
    name: "내정착지",
    productionKind: null,
    unlockedSlots: MAX_SLOTS_BY_TIER.village,
    slotKinds: {},
    buildings: {},
    jobs: {},
    ...over,
  };
}

beforeEach(() => {
  store.clear();
  soloSave.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("villageOwner / normalizeVillageToOwner (순수)", () => {
  it("villageOwner — guildId→guild, ownerUserId→solo", () => {
    expect(villageOwner(village({ guildId: 7 }) as VillageRow)).toEqual({
      kind: "guild",
      guildId: 7,
    });
    expect(villageOwner(village({ ownerUserId: "u1" }) as VillageRow)).toEqual({
      kind: "solo",
      userId: "u1",
    });
  });
  it("normalizeVillageToOwner — 동일 소유 no-op, 변경 시 작업 비움", () => {
    const g = village({ guildId: 7, jobs: { "0": { kind: "crop", startedAt: 1 } } }) as VillageRow;
    expect(normalizeVillageToOwner(g, { kind: "guild", guildId: 7 })).toBe(g);
    const moved = normalizeVillageToOwner(g, { kind: "solo", userId: "u1" });
    expect(moved.guildId).toBeNull();
    expect(moved.ownerUserId).toBe("u1");
    expect(moved.jobs).toEqual({});
  });
});

describe("tileBuild — 개척마을→마을 + tier 동기화", () => {
  it("길드 타일: 길드 점령행 → 길드 마을 생성 + 길드 골드 차감 + tile_settlements.tier=village", async () => {
    seedTile();
    store.set(outpostOccupations, [{ outpostId: TILE, occupiedByGuildId: GUILD, g: GUILD }]);
    store.set(v2GuildResources, [{ guildId: GUILD, gold: 50_000_000, settlement: {} }]);
    const res = await tileBuild(ME, TILE);
    expect(res.status).toBe(200);
    const v = store.get(outpostVillages)![0];
    expect(v.guildId).toBe(GUILD);
    expect(v.ownerUserId).toBeNull();
    expect(v.tier).toBe("village");
    expect(v.name).toBe("개척이름"); // 개척 때 정한 이름 재사용(재입력 없음)
    expect(store.get(tileSettlements)![0].tier).toBe("village"); // 동기화
    expect(store.get(v2GuildResources)![0].gold).toBe(50_000_000 - BUILD_COST);
  });

  it("솔로 타일: 점령행 없음 → 길드 영토 필요로 차단", async () => {
    seedTile();
    soloSave.set(ME, { gold: 50_000_000, bankedGold: 0 });
    const res = await tileBuild(ME, TILE);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("need_guild_territory");
    expect(store.get(outpostVillages) ?? []).toHaveLength(0);
    expect(soloSave.get(ME)!.gold).toBe(50_000_000);
  });

  it("솔로 골드 부족보다 길드 영토 필요를 먼저 반환", async () => {
    seedTile();
    soloSave.set(ME, { gold: BUILD_COST - 1, bankedGold: 0 });
    const res = await tileBuild(ME, TILE);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("need_guild_territory");
    expect(store.get(outpostVillages) ?? []).toHaveLength(0);
  });
});

describe("tileUpgrade — 단계 상승 + tier 동기화 + 소유 자원 소비", () => {
  // 거리 스케일된 단계 승격 자원비(서버 차감과 일치).
  const cost = scaledTileResourceCost(UPGRADE_COST.village!, 3, 5);
  it("길드 타일: village→city, 길드 자원 소비 + tile_settlements.tier=city", async () => {
    seedTile("village");
    store.set(outpostOccupations, [{ outpostId: TILE, occupiedByGuildId: GUILD, g: GUILD }]);
    store.set(outpostVillages, [village({ guildId: GUILD, tier: "village" })]);
    store.set(v2GuildResources, [
      { guildId: GUILD, gold: 0, settlement: { crop: cost.crop! + 1, ore: cost.ore! + 2 } },
    ]);
    const res = await tileUpgrade(ME, TILE);
    expect(res.status).toBe(200);
    expect(store.get(outpostVillages)![0].tier).toBe("city");
    expect(store.get(tileSettlements)![0].tier).toBe("city");
    expect(store.get(v2GuildResources)![0].settlement).toEqual({ crop: 1, ore: 2 });
  });

  it("솔로 타일: village→city 승급 차단", async () => {
    seedTile("village");
    store.set(outpostVillages, [village({ ownerUserId: ME, tier: "village" })]);
    store.set(userSettlementResources, [
      { userId: ME, settlement: { crop: cost.crop!, ore: cost.ore! } },
    ]);
    const res = await tileUpgrade(ME, TILE);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("need_guild_territory");
    expect(store.get(outpostVillages)![0].tier).toBe("village");
    expect(store.get(tileSettlements)![0].tier).toBe("village");
    expect(store.get(userSettlementResources)![0].settlement).toEqual({
      crop: cost.crop!,
      ore: cost.ore!,
    });
  });
});
