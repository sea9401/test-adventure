// 패배 세금 카운터(코어루프) 통합 — huntCooldown.test.ts 와 같은 in-memory savesKv +
// coreLoopConfig importOriginal(flag만 on). 승리 시 atRiskGold 가 goldGained 만큼 누적되는
// 배선을 검증한다(패배 세금 산술은 lossTaxOf 단위 테스트가 커버 — 결정적 패배 유도는 전투
// 밸런스에 취약해 통합에선 승리 누적만).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_CORE_LOOP_V2: true };
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
    atRiskGold?: number;
    gold: number;
    lastBattleAt?: number;
  };
}

describe("POST /api/v2/dungeon/hunt — 패배 세금 카운터(코어루프 on)", () => {
  beforeEach(() => {
    seedStrongWarrior();
    vi.spyOn(Math, "random").mockReturnValue(0.5); // 확정 승리
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("승리 시 atRiskGold 가 goldGained 만큼 누적 + 결과에 lossTax 0 노출", async () => {
    const res = await POST(huntReq({ floor: 1 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      result: { goldGained: number; lossTax: number; atRiskGold: number };
    };
    expect(json.result.goldGained).toBeGreaterThan(0);
    expect(json.result.lossTax).toBe(0); // 승리 = 세금 0
    // 0 에서 goldGained 만큼 누적.
    expect(json.result.atRiskGold).toBe(json.result.goldGained);
    expect(char().atRiskGold).toBe(json.result.goldGained);
  });

  it("두 번째 승리에서 atRiskGold 가 합산(누적 카운터)", async () => {
    const first = await POST(huntReq({ floor: 1 }));
    const j1 = (await first.json()) as { result: { goldGained: number } };
    const after1 = char().atRiskGold!;
    expect(after1).toBe(j1.result.goldGained);

    // 쿨다운 우회 — lastBattleAt 과거로.
    const c = char();
    c.lastBattleAt = Date.now() - HUNT_COOLDOWN_MS - 1000;
    store.set("character.v2", c);

    const second = await POST(huntReq({ floor: 1 }));
    const j2 = (await second.json()) as { result: { goldGained: number } };
    expect(char().atRiskGold).toBe(after1 + j2.result.goldGained);
  });
});
