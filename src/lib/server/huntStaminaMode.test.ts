// 사냥 스태미나 모드 통합 테스트 — 코어루프 on(V2_CORE_LOOP_V2=true) 이지만 사냥 throttle 만
// 스태미나로 되돌린 상태(HUNT_COOLDOWN_MODE=false). huntCooldown.test.ts 와 같은 in-memory
// savesKv 위에서 REAL 핸들러를 돌린다. 검증:
//   1) 첫 사냥 = 200 + 스태미나 HUNT_COST 차감(쿨다운 throttle 아님) · lastBattleAt 미기록.
//   2) 즉시 재요청도 200(쿨다운 없음) — 스태미나가 throttle.
//   3) count>1 = 일괄 허용(batch 집계 존재).
//   4) 스태미나 부족 = 409 out_of_stamina.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  // 코어루프는 on, 사냥만 스태미나(쿨다운 모드 off).
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
import { HUNT_COST } from "@/adventure/v2/stamina";
import { requiredExpToNext } from "@/lib/leveling";

function seedStrongWarrior(
  staminaCurrent: number,
  adventureSupportActive = false,
) {
  store.clear();
  store.set("character.v2", {
    class: "warrior",
    level: 30,
    exp: 0,
    gold: 1000,
    hp: 999999,
    stamina: { current: staminaCurrent, lastUpdatedAt: Date.now() },
    frontierDepth: 2,
    ...(adventureSupportActive
      ? {
          adventureSupport: {
            activatedAt: Date.now() - 1_000,
            activeUntil: Date.now() + 86_400_000,
          },
        }
      : {}),
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

describe("POST /api/v2/dungeon/hunt — 스태미나 모드(코어루프 on)", () => {
  beforeEach(() => {
    seedStrongWarrior(5000);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("첫 사냥 = 200 + 스태미나 HUNT_COST 차감, lastBattleAt 기록", async () => {
    const res = await POST(huntReq({ floor: 2 }));
    expect(res.status).toBe(200);
    const c = char();
    // 스태미나가 throttle — HUNT_COST 만큼 차감.
    expect(c.stamina.current).toBe(5000 - HUNT_COST);
    // lastBattleAt 은 기록됨 — 코어루프 사냥/오프라인 정산 기준 시각으로 사용한다.
    expect(typeof c.lastBattleAt).toBe("number");
  });

  it("즉시 재요청도 200(쿨다운 없음) — 스태미나가 throttle(lastBattleAt 무시)", async () => {
    const first = await POST(huntReq({ floor: 2 }));
    expect(first.status).toBe(200);
    // lastBattleAt 이 방금 기록됐어도 사냥은 스태미나로 게이트라 즉시 재사냥 가능(429 아님).
    const res = await POST(huntReq({ floor: 2 }));
    expect(res.status).toBe(200);
    // 두 판 차감.
    expect(char().stamina.current).toBe(5000 - HUNT_COST * 2);
  });

  it("count>1 = 일괄 허용(batch 집계 존재)", async () => {
    const res = await POST(huntReq({ floor: 2, count: 5 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { batch?: unknown };
    expect(json.batch).toBeDefined();
  });

  it("자동 일괄 사냥은 100레벨에 도달한 판에서 즉시 중단한다", async () => {
    const before = store.get("character.v2") as Record<string, unknown>;
    store.set("character.v2", {
      ...before,
      level: 99,
      exp: requiredExpToNext(99)! - 1,
    });

    const res = await POST(
      huntReq({
        floor: 2,
        count: 5,
        autoStopConfig: { level100Enabled: true },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      batch: {
        attempted: number;
        completed: number;
        levelsGained: number;
        stoppedReason: string | null;
        finalLevelAfter: number | null;
        replays: unknown[];
      };
    };
    expect(json.batch).toMatchObject({
      attempted: 5,
      completed: 1,
      levelsGained: 1,
      stoppedReason: "level_100",
      finalLevelAfter: 100,
    });
    expect(json.batch.replays).toHaveLength(1);
    expect(char().stamina.current).toBe(5000 - HUNT_COST);
  });

  it("지원권이 없으면 50회 요청을 서버에서 거부한다", async () => {
    const res = await POST(huntReq({ floor: 2, count: 50 }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "adventure_support_required",
      maxCount: 10,
    });
  });

  it("활성 지원권 이용자는 50회 일괄 사냥을 실행할 수 있다", async () => {
    seedStrongWarrior(5000, true);
    const res = await POST(huntReq({ floor: 2, count: 50 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { batch?: { attempted?: number } };
    expect(json.batch?.attempted).toBe(50);
  });

  it("스태미나 부족 = 409 out_of_stamina", async () => {
    seedStrongWarrior(0);
    const res = await POST(huntReq({ floor: 2 }));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toBe("out_of_stamina");
  });
});
