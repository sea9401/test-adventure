// 레어맵 판수 차감 "영속" 회귀 테스트 — 사냥 입장 시 runsLeft 가 차감되어
// character.v2 저장에 반영되는지 검증한다.
//
// 🐛 과거 버그(2026-06-12~): 레어맵 갱신 블록(판수 차감 + 신규 드랍)이
//   upsertSave("character.v2", next) "뒤"에 있어, 차감된 rareMaps 가 저장되지 않았다.
//   응답에는 줄어든 값이 실렸지만 DB(save)는 원복 → "횟수 차감이 안 됨".
//   수정: 갱신 블록을 next 빌드 전으로 이동. 이 테스트가 그 회귀를 막는다.
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
  return { ...actual, V2_CORE_LOOP_V2: true, HUNT_COOLDOWN_MODE: false };
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
  chain.for = () => chain;
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
  readSave: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/dungeon/hunt/route";
import type { RareMapInstance } from "@/adventure/data/v2/rareMaps";

// 강한 전사 + hunt 계열 레어맵 1장(worn_map). frontierDepth 를 높여 지도 깊이가
// 깊이 게이트(depth ≤ frontierDepth+1)를 통과하게 둔다.
function seedWithMap(runsLeft: number, depth = 2) {
  store.clear();
  const now = Date.now();
  const map: RareMapInstance = {
    iid: "rm1",
    kind: "worn_map",
    depth,
    runsLeft,
    foundAt: now,
    expiresAt: now + 48 * 3_600_000,
  };
  store.set("character.v2", {
    class: "warrior",
    level: 30,
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

describe("POST /api/v2/dungeon/hunt — 레어맵 판수 차감 영속(회귀)", () => {
  beforeEach(() => {
    // 0.5 = 강한 전사 승리(승패 무관하게 차감되지만 200 확정용).
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("레어맵 입장 시 runsLeft 가 1 차감되어 '저장'에 영속된다", async () => {
    seedWithMap(3, 2);
    const res = await POST(huntReq({ floor: 2, rareMap: "rm1" }));
    expect(res.status).toBe(200);
    // 🔑 회귀 핵심: 응답뿐 아니라 저장된 character.v2 에 차감이 반영돼야 한다.
    //   (버그 시절엔 save 가 차감 전 값이라 여기서 3 이 나와 실패했다.)
    const m = savedMaps().find((x) => x.iid === "rm1");
    expect(m?.runsLeft).toBe(2);
  });

  it("마지막 판수 소진 시 레어맵이 저장에서 제거된다(runsLeft>0 필터)", async () => {
    seedWithMap(1, 2);
    const res = await POST(huntReq({ floor: 2, rareMap: "rm1" }));
    expect(res.status).toBe(200);
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
