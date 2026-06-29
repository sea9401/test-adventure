// T2 — GET /api/v2/outpost/village?outpostId=tile:c,r 의 타일 단건(소유별 자원·골드) 분기.
//   길드 타일=길드 풀+길드 금고 / 솔로 타일=개인 풀+본인 골드 / 건설前=마을 없음+소유 골드만.
//   (카탈로그/무파라미터 GET 은 villageRoute.test 48개가 byte-identical 커버.)

import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rows: new Map<unknown, unknown[]>() }));

vi.mock("@/adventure/data/v2/settlementWarfareConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/settlementWarfareConfig")
    >();
  return { ...actual, V2_TILE_PRODUCTION: true };
});
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/db", () => {
  function chain() {
    let tbl: unknown = null;
    const c: Record<string, unknown> = {
      from: (t: unknown) => {
        tbl = t;
        return c;
      },
      where: () => c,
      for: () => c,
      orderBy: () => c,
      limit: async () => h.rows.get(tbl) ?? [],
    };
    return c;
  }
  return {
    db: {
      transaction: async (cb: (tx: unknown) => unknown) =>
        cb({ select: () => chain() }),
    },
  };
});

import { GET } from "@/app/api/v2/outpost/village/route";
import {
  outpostOccupations,
  tileSettlements,
  outpostVillages,
  v2GuildResources,
  userSettlementResources,
  savesKv,
} from "@/db/schema";

function villageRow(over: Record<string, unknown>) {
  return {
    outpostId: "tile:0,0",
    guildId: null,
    ownerUserId: null,
    tier: "village",
    name: "마을",
    productionKind: null,
    unlockedSlots: 1,
    slotKinds: {},
    buildings: {},
    jobs: {},
    ...over,
  };
}
function req(outpostId: string): Request {
  return new Request(
    `http://t/api/v2/outpost/village?outpostId=${encodeURIComponent(outpostId)}`,
  );
}

describe("GET village — 타일 단건", () => {
  it("솔로 타일(건설됨): 개인 자원 풀 + 본인 골드(+은행)", async () => {
    h.rows = new Map<unknown, unknown[]>([
      [outpostOccupations, []], // 점령행 없음 → 솔로
      [tileSettlements, [{ userId: "u-test" }]], // founder = 나
      [
        outpostVillages,
        [villageRow({ outpostId: "tile:2,3", ownerUserId: "u-test", tier: "village", name: "내마을" })],
      ],
      [userSettlementResources, [{ settlement: { crop: 5 } }]],
      [savesKv, [{ value: { gold: 50000, bankedGold: 1000 } }]],
    ]);
    const res = await GET(req("tile:2,3"));
    const j = (await res.json()) as {
      ok: boolean;
      villages: Array<{ outpostId: string; tier: string; name: string | null }>;
      resources: Record<string, number>;
      gold: number;
    };
    expect(j.ok).toBe(true);
    expect(j.villages).toHaveLength(1);
    expect(j.villages[0].outpostId).toBe("tile:2,3");
    expect(j.villages[0].tier).toBe("village");
    expect(j.resources.crop).toBe(5);
    expect(j.gold).toBe(51000); // 본인 골드 + 은행
  });

  it("길드 타일(건설됨): 길드 자원 풀 + 길드 금고 골드", async () => {
    h.rows = new Map<unknown, unknown[]>([
      [outpostOccupations, [{ g: 7 }]], // 점령행(길드 7)
      [
        outpostVillages,
        [villageRow({ outpostId: "tile:4,5", guildId: 7, tier: "city", name: "길드시" })],
      ],
      [v2GuildResources, [{ gold: 999, settlement: { ore: 8 } }]],
    ]);
    const res = await GET(req("tile:4,5"));
    const j = (await res.json()) as {
      ok: boolean;
      villages: Array<{ tier: string }>;
      resources: Record<string, number>;
      gold: number;
    };
    expect(j.villages[0].tier).toBe("city");
    expect(j.resources.ore).toBe(8);
    expect(j.gold).toBe(999);
  });

  it("솔로 타일(건설 前): 마을 없음 + 본인 골드만(건설 비용 표시용)", async () => {
    h.rows = new Map<unknown, unknown[]>([
      [outpostOccupations, []],
      [tileSettlements, [{ userId: "u-test" }]],
      [outpostVillages, []], // 아직 마을 없음(frontier)
      [userSettlementResources, []],
      [savesKv, [{ value: { gold: 100 } }]],
    ]);
    const res = await GET(req("tile:0,0"));
    const j = (await res.json()) as {
      villages: unknown[];
      gold: number;
    };
    expect(j.villages).toHaveLength(0);
    expect(j.gold).toBe(100);
  });
});
