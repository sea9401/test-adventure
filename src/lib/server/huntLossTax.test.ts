// 패배 페널티 카운터(코어루프) 통합 — huntCooldown.test.ts 와 같은 in-memory savesKv +
// coreLoopConfig importOriginal(flag만 on). 승리 시 atRiskGold 가 goldGained 만큼 누적되는
// 배선과, 패배 소실 골드가 금고에 입금되지 않는 것을 검증한다.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, treasuryInserts, battleOutcome } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  treasuryInserts: [] as unknown[],
  battleOutcome: { value: "win" as "win" | "lose" },
}));

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
      values: (value: unknown) => {
        treasuryInserts.push(value);
        return { onConflictDoUpdate: async () => undefined };
      },
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
vi.mock("@/adventure/v2/combat/engine", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/adventure/v2/combat/engine")>();
  return {
    ...actual,
    resolveBattle: vi.fn((player, enemy, _name) => {
      const outcome = battleOutcome.value;
      const playerMaxHp = Math.max(1, Number(player.maxHp) || 1);
      const playerMaxMp = Math.max(0, Number(player.maxMp) || 0);
      const playerMp = Math.max(0, Number(player.mp) || playerMaxMp);
      return {
        outcome,
        finalState: {
          enemy,
          enemyHp: outcome === "win" ? 0 : Math.max(1, Number(enemy.hp) || 1),
          playerHp: outcome === "win" ? playerMaxHp : 0,
          playerMaxHp,
          playerMp,
          playerMaxMp,
          log: [],
          phase: "ended",
          outcome,
        },
        potionsConsumed: {},
        turns: 1,
      };
    }),
  };
});

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

describe("POST /api/v2/dungeon/hunt — 패배 페널티 카운터(코어루프 on)", () => {
  beforeEach(() => {
    seedStrongWarrior();
    treasuryInserts.length = 0;
    battleOutcome.value = "win";
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
    expect(json.result.lossTax).toBe(0); // 승리 = 소실 0
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

  it("패배 시 잃은 골드는 금고에 입금하지 않고 소실한다", async () => {
    store.set("character.v2", {
      ...char(),
      atRiskGold: 200,
      gold: 1000,
      lastBattleAt: Date.now() - HUNT_COOLDOWN_MS - 1000,
    });
    battleOutcome.value = "lose";

    const res = await POST(
      huntReq({ floor: 1, outpostId: "neutral_north_outpost" }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      result: {
        won: boolean;
        goldAfter: number;
        lossTax: number;
        atRiskGold: number;
      };
    };

    expect(json.result.won).toBe(false);
    expect(json.result.lossTax).toBe(100);
    expect(json.result.goldAfter).toBe(900);
    expect(json.result.atRiskGold).toBe(0);
    expect(char().gold).toBe(900);
    expect(char().atRiskGold).toBe(0);
    expect(treasuryInserts).toEqual([]);
  });
});
