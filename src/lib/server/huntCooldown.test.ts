// 사냥 전투 쿨다운(코어루프) 통합 테스트 — huntRoute.test.ts 와 같은 in-memory
// savesKv 위에서 REAL 핸들러를 돌리되, coreLoopConfig 를 importOriginal 로 받아 V2_CORE_LOOP_V2
// 만 true 로 덮는다(나머지 다이얼·헬퍼는 실값 유지 → derive/proficiency 정상). 검증:
//   1) 코어루프 첫 사냥 = 200 + lastBattleAt 기록(스태미나 미차감).
//   2) 쿨다운 중(즉시 재요청) = 429 on_cooldown(nextBattleAt/cooldownMs).
//   3) 쿨다운 경과 후 = 다시 200.
//   4) count>1 요청도 단판(batch 없음) — 일괄 폐지.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

// 🔑 flag 만 on 으로 — 나머지 export(HUNT_COOLDOWN_MS·coreLoopMaxHpMult·effectiveLevelCap 입력
//   다이얼 등)는 실값 보존(부분 모킹이면 derive/proficiency 가 깨진다).
vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  // HUNT_COOLDOWN_MODE 는 actual 에서 V2_CORE_LOOP_V2=false 기준으로 계산되므로 함께 덮는다
  //   (이 테스트는 쿨다운 모드 = 스태미나 미사용 검증).
  return { ...actual, V2_CORE_LOOP_V2: true, HUNT_COOLDOWN_MODE: true };
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
import { HUNT_COOLDOWN_MS } from "@/adventure/data/v2/coreLoopConfig";

function seedStrongWarrior() {
  store.clear();
  store.set("character.v2", {
    class: "warrior",
    level: 30,
    exp: 0,
    gold: 1000,
    hp: 999999,
    stamina: { current: 5000, lastUpdatedAt: 1 },
    frontierDepth: 2,
    // lastBattleAt 없음 → 첫 사냥 즉시 가능.
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

function char() {
  return store.get("character.v2") as {
    lastBattleAt?: number;
    stamina: { current: number };
  };
}

describe("POST /api/v2/dungeon/hunt — 전투 쿨다운(코어루프 on)", () => {
  beforeEach(() => {
    seedStrongWarrior();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("첫 사냥 = 200 + lastBattleAt 기록, 스태미나 미차감(쿨다운이 throttle)", async () => {
    const before = Date.now();
    const res = await POST(huntReq({ floor: 1 }));
    expect(res.status).toBe(200);
    const c = char();
    expect(typeof c.lastBattleAt).toBe("number");
    expect(c.lastBattleAt!).toBeGreaterThanOrEqual(before);
    // 스태미나 폐지 — 차감 없음(회복만, 풀충 유지).
    expect(c.stamina.current).toBe(5000);
  });

  it("쿨다운 중 재요청 = 429 on_cooldown(nextBattleAt/cooldownMs)", async () => {
    const first = await POST(huntReq({ floor: 1 }));
    expect(first.status).toBe(200);
    const lastBattleAt = char().lastBattleAt!;

    const res = await POST(huntReq({ floor: 1 }));
    expect(res.status).toBe(429);
    const json = (await res.json()) as {
      ok: boolean;
      error: string;
      nextBattleAt: number;
      cooldownMs: number;
    };
    expect(json.ok).toBe(false);
    expect(json.error).toBe("on_cooldown");
    expect(json.cooldownMs).toBe(HUNT_COOLDOWN_MS);
    expect(json.nextBattleAt).toBe(lastBattleAt + HUNT_COOLDOWN_MS);
  });

  it("쿨다운 경과 후 = 다시 200", async () => {
    const first = await POST(huntReq({ floor: 1 }));
    expect(first.status).toBe(200);
    // lastBattleAt 을 쿨다운 한참 전으로 되돌림 → 다음 요청 통과.
    const c = char();
    c.lastBattleAt = Date.now() - HUNT_COOLDOWN_MS - 1000;
    store.set("character.v2", c);

    const res = await POST(huntReq({ floor: 1 }));
    expect(res.status).toBe(200);
  });

  it("count>1 요청도 단판 — 일괄 폐지(batch 필드 없음)", async () => {
    const res = await POST(huntReq({ floor: 1, count: 5 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { batch?: unknown; result?: unknown };
    // 코어루프는 항상 단판 → batch 집계 없이 단일 result.
    expect(json.batch).toBeUndefined();
    expect(json.result).toBeDefined();
    // 단판 1회만 실행 → 즉시 재요청은 쿨다운.
    const again = await POST(huntReq({ floor: 1, count: 5 }));
    expect(again.status).toBe(429);
  });
});
