// 희귀 탐사 1회 압축 정산 통합 테스트 — 승리하면 runsLeft만큼 보상을 정산하고
// character.v2 저장에서 지도를 제거하는지 실제 POST 핸들러로 검증한다.
//
// 스태미나 모드(라이브 .env.production = V2_HUNT_USE_STAMINA) 하니스 —
// huntStaminaMode.test.ts 와 동일한 in-memory savesKv 위에서 REAL POST 핸들러를 돌린다.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  // 코어루프 on, 사냥 throttle = 스태미나(쿨다운 모드 off) = 라이브.
  return {
    ...actual,
    V2_CORE_LOOP_V2: true,
    HUNT_COOLDOWN_MODE: false,
    V2_UNEXPLORED: true,
  };
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
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.for = async () => [];
  chain.limit = async () => [];
  const tx = {
    select: () => chain,
    insert: () => ({
      values: () => ({ onConflictDoUpdate: async () => undefined }),
    }),
  };
  return {
    db: {
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
      select: () => chain,
    },
  };
});
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  lockSavesForUpdate: vi.fn(async (_tx, _uid, fallbacks: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(fallbacks).map(([key, fallback]) => [key, store.has(key) ? store.get(key) : fallback])),
  ),
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  readSaves: vi.fn(async (_tx, _uid, fallbacks: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(fallbacks).map(([key, fallback]) => [key, store.has(key) ? store.get(key) : fallback])),
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
  upsertSaves: vi.fn(async (_tx, _uid, entries: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(entries)) store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/dungeon/hunt/route";
import type { RareMapInstance } from "@/adventure/data/v2/rareMaps";

// 강한 전사 + hunt 계열 레어맵 1장(worn_map). frontierDepth 를 높여 지도 깊이가
// 깊이 게이트(depth ≤ frontierDepth+1)를 통과하게 둔다.
function seedWithMap(runsLeft: number, depth = 2, level = 30) {
  store.clear();
  const now = Date.now();
  const map: RareMapInstance = {
    iid: "rm1",
    kind: "worn_map",
    depth,
    runsLeft,
    foundAt: now,
  };
  store.set("character.v2", {
    class: "warrior",
    level,
    exp: 0,
    gold: 1000,
    hp: 999999,
    stamina: { current: 5000, lastUpdatedAt: now },
    frontierDepth: 6,
    rareMaps: [map],
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

function savedMaps(): RareMapInstance[] {
  return (
    (store.get("character.v2") as { rareMaps?: RareMapInstance[] }).rareMaps ??
    []
  );
}

describe("POST /api/v2/dungeon/hunt — 희귀 탐사 1회 압축 정산", () => {
  beforeEach(() => {
    // 0.5 = 강한 전사 승리(승패 무관하게 차감되지만 200 확정용).
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("승리 시 남은 보상 횟수를 한 번에 정산하고 지도를 저장에서 제거한다", async () => {
    seedWithMap(3, 2);
    const res = await POST(huntReq({ floor: 2, rareMap: "rm1" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      result?: { rewardRolls?: number; rareMapRunsLeft?: number };
    };
    expect(json.result?.rewardRolls).toBe(3);
    expect(json.result?.rareMapRunsLeft).toBe(0);
    expect(savedMaps().find((x) => x.iid === "rm1")).toBeUndefined();
  });

  it("100레벨 희귀 탐사의 압축 보상은 탐사 경험치에 한 번만 반영한다", async () => {
    seedWithMap(30, 2, 100);
    const res = await POST(huntReq({ floor: 2, rareMap: "rm1" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      result?: {
        expGained?: number;
        rewardRolls?: number;
        exploration?: { xpGained?: number; xpAfter?: number };
      };
    };
    expect(json.result?.rewardRolls).toBe(30);
    expect(json.result?.expGained).toBeGreaterThan(1);
    expect(json.result?.exploration).toMatchObject({
      xpGained: 1,
      xpAfter: 1,
    });
  });

  it("마지막 판수 소진 시 레어맵이 저장에서 제거된다(runsLeft>0 필터)", async () => {
    seedWithMap(1, 2);
    const res = await POST(huntReq({ floor: 2, rareMap: "rm1" }));
    expect(res.status).toBe(200);
    expect(savedMaps().find((x) => x.iid === "rm1")).toBeUndefined();
  });

  it("레거시 홀수 깊이 지도는 같은 정확한 깊이로 계속 입장 가능", async () => {
    seedWithMap(2, 3);
    const res = await POST(huntReq({ floor: 3, rareMap: "rm1" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      result?: { rewardRolls?: number };
    };
    expect(json.result?.rewardRolls).toBe(2);
    expect(savedMaps().find((x) => x.iid === "rm1")).toBeUndefined();
  });

  it("깊이 불일치 레어맵은 입장 거부(400)이고 차감되지 않는다", async () => {
    seedWithMap(3, 2);
    const res = await POST(huntReq({ floor: 3, rareMap: "rm1" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("rare_map_invalid");
    // 거부는 save 전 반환 → 원본 판수 보존.
    expect(savedMaps().find((x) => x.iid === "rm1")?.runsLeft).toBe(3);
  });
});
