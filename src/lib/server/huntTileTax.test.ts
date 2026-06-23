// 타일 전쟁(P2) — 마커가 길드 점령 정착지 위일 때 사냥세가 그 타일 금고로 가는 배선 통합 검증.
//   huntLossTax.test.ts 패턴 + V2_TILE_WARFARE on + tile 점령 행 반환 mock + treasury insert 캡처.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, inserts } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  inserts: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return { ...actual, V2_CORE_LOOP_V2: true };
});
vi.mock("@/adventure/data/v2/settlementWarfareConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/settlementWarfareConfig")
    >();
  return { ...actual, V2_TILE_WARFARE: true };
});

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({
  getGuildId: vi.fn(async () => null),
}));
vi.mock("@/lib/server/serverFeed", () => ({
  insertFeedEntry: vi.fn(async () => {}),
  resolveUserDisplayName: vi.fn(async () => "이름 없는 모험가"),
}));
vi.mock("@/db", () => {
  // select(cols) — tile 점령 조회는 {occupiedByGuildId, taxRate} 컬럼 모양으로 구분(길드 행 반환).
  //   그 외 select 는 [] (huntLossTax mock 과 동일 graceful).
  function chain(cols?: unknown) {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.for = () => c;
    c.limit = async () =>
      cols &&
      typeof cols === "object" &&
      "occupiedByGuildId" in (cols as object) &&
      "taxRate" in (cols as object)
        ? [{ occupiedByGuildId: 7, taxRate: "0.100" }]
        : [];
    return c;
  }
  const tx = {
    select: (cols?: unknown) => chain(cols),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserts.push(v);
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
  };
  return {
    db: {
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
      select: (cols?: unknown) => chain(cols),
    },
  };
});
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/dungeon/hunt/route";

function seedOnGuildTile() {
  store.clear();
  inserts.length = 0;
  store.set("character.v2", {
    class: "warrior",
    level: 30,
    exp: 0,
    gold: 1000,
    hp: 999999,
    stamina: { current: 5000, lastUpdatedAt: 1 },
    frontierDepth: 2,
    tilePos: { col: 2, row: 3, at: 1 }, // 길드 점령 정착지 위.
  });
  store.set("equipment.v2", {
    owned: [{ iid: "w1", id: "v2_cave_greatsword" }],
    equipped: { weapon: "w1" },
  });
  store.set("proficiency.v2", {
    groups: { warrior: { tier: 1, points: 0, cumLevel: 30 } },
    grown: { str: 50, vit: 50 },
  });
  store.set("skills.v2", { learned: [], equipped: [] });
  store.set("inventory.v2", { hpCharges: 0, mpCharges: 0 });
  store.set("adventure-log.v2", { monsters: {}, battleLosses: 0 });
}

function huntReq(body: Record<string, unknown>): Request {
  return new Request("http://t/api/v2/dungeon/hunt", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/v2/dungeon/hunt — 타일 전쟁 사냥세(마커 위치 기준)", () => {
  beforeEach(() => {
    seedOnGuildTile();
    vi.spyOn(Math, "random").mockReturnValue(0.5); // 확정 승리
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("길드 점령 타일 위에서 승리 → 사냥세가 그 타일 금고(tile:2,3)로 누적", async () => {
    const res = await POST(huntReq({ floor: 1 })); // base outpostId 없음 — tilePos 가 행선지.
    expect(res.status).toBe(200);
    const tileTreasury = inserts.find((v) => v.outpostId === "tile:2,3");
    expect(tileTreasury).toBeDefined();
    expect(Number(tileTreasury!.gold)).toBeGreaterThan(0);
    // 다른 거점/개인 금고로 새지 않음 — 캡처된 treasury insert 는 타일 것뿐.
    expect(inserts.filter((v) => typeof v.outpostId === "string")).toHaveLength(
      1,
    );
  });
});
