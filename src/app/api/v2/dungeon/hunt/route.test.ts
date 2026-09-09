// Run the real route, combat, drops and save aggregation over an in-memory I/O boundary.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexMasteryGameplayEvent } from "@/lib/server/codexMasteryGameplay";
const { store, codexEvents } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  codexEvents: [] as CodexMasteryGameplayEvent[],
}));

vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: async () => "u-specialty" }));
vi.mock("@/lib/server/v2EnsureSoloGuild", () => ({ getGuildId: async () => null }));
vi.mock("@/lib/server/serverFeed", () => ({
  insertFeedEntry: async () => {}, resolveUserDisplayName: async () => "모험가",
}));
vi.mock("@/lib/server/codexMasteryGameplay", () => ({
  recordCodexMasteryGameplayBatch: async (_tx: unknown, _uid: string, events: CodexMasteryGameplayEvent[]) => {
    codexEvents.push(...events);
    return [];
  },
}));
vi.mock("@/lib/server/battleReplayStore", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/server/battleReplayStore")>(),
  deferLongBattleReplays: async (_tx: unknown, _uid: string, payloads: unknown[]) => payloads,
}));
// Exercise the real engine with a one-HP enemy and a separate combat RNG stream.
// This isolates reward routing from late-game difficulty and near-zero dodges.
vi.mock("@/adventure/v2/combat/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adventure/v2/combat/engine")>();
  return { ...actual, resolveBattle: (...args: Parameters<typeof actual.resolveBattle>) => {
    const dropRandom = Math.random;
    Math.random = () => 0.5;
    try { return actual.resolveBattle(args[0], { ...args[1], hp: 1 }, args[2], args[3]); }
    finally { Math.random = dropRandom; }
  } };
});
vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>(),
  HUNT_COOLDOWN_MODE: false,
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
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
  };
  return { db: { transaction: async (cb: (tx: unknown) => unknown) => cb(tx), select: () => chain } };
});
vi.mock("@/lib/server/savesKv", () => {
  const read = async (_tx: unknown, _uid: string, key: string, fallback: unknown) => store.has(key) ? store.get(key) : fallback;
  const readMany = async (_tx: unknown, _uid: string, fallbacks: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(fallbacks).map(([key, fallback]) => [key, store.has(key) ? store.get(key) : fallback]));
  return {
    readSave: read, lockSaveForUpdate: read, readSaves: readMany, lockSavesForUpdate: readMany,
    upsertSave: async (_tx: unknown, _uid: string, key: string, value: unknown) => { store.set(key, value); },
    upsertSaves: async (_tx: unknown, _uid: string, entries: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(entries)) store.set(key, value);
    },
  };
});

import { POST } from "./route";
import { resetUserRateLimitForTests } from "@/lib/server/userRateLimit";
import { newRareMapInstance } from "@/adventure/data/v2/rareMaps";

const focused = { mode: "focused", poolId: "iron_legion" } as const;

function seed(mode: unknown = { mode: "standard" }, depth = 80, rareMap = false) {
  store.clear();
  codexEvents.length = 0;
  resetUserRateLimitForTests();
  store.set("character.v2", {
    class: "warrior", level: 30, exp: 0, gold: 1_000, hp: 999_999,
    stamina: { current: 5_000, lastUpdatedAt: Date.now() }, frontierDepth: 84,
    unexploredHuntMode: mode,
    rareMaps: rareMap ? [newRareMapInstance("worn_map", depth, Date.now(), "map-test")] : [],
  });
  store.set("equipment.v2", {
    owned: [{ iid: "w1", id: "v2_storm_gale_bow" }], equipped: { weapon: "w1" },
  });
  store.set("proficiency.v2", {
    groups: { warrior: { tier: 1, points: 0, cumLevel: 30 } },
    grown: { str: 50_000, vit: 50_000, dex: 50_000, luk: 50_000 },
  });
  store.set("skills.v2", { learned: [], equipped: [] });
  store.set("inventory.v2", { hpCharges: 999_999, mpCharges: 999_999 });
  store.set("adventure-log.v2", { monsters: {}, battleLosses: 0 });
}

async function hunt(body: Record<string, unknown> = {}) {
  const response = await POST(new Request("http://t/api/v2/dungeon/hunt", {
    method: "POST", body: JSON.stringify({ floor: 80, ...body }),
  }));
  const result = await response.json();
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  expect(response.status).toBe(200);
  return result;
}

beforeEach(() => { seed(); });
afterEach(() => vi.restoreAllMocks());

describe("별의 무덤 일반 사냥 라우트", () => {
  it("ignores a legacy specialty mode saved on a normal Star Grave hunt", async () => {
    seed(focused);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const { result } = await hunt({ floor: 80 });

    expect(result).toMatchObject({
      won: true,
      enemyName: "성해의 파수꾼",
    });
  });

  it("keeps standard hunts on the existing enemy pool", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.003999);
    const { result } = await hunt();
    expect(result).toMatchObject({ won: true, enemyName: "성해의 파수꾼" });
  });

  it.each([[78, false], [80, true]] as const)("ignores saved specialty mode and preserves RNG at depth=%s rareMap=%s", async (depth, rareMap) => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    seed({ mode: "standard" }, depth, rareMap);
    const body = { floor: depth, ...(rareMap ? { rareMap: "map-test" } : {}) };
    const standard = await hunt(body);
    const standardCalls = random.mock.calls.length;
    random.mockClear();
    seed(focused, depth, rareMap);
    const specialty = await hunt(body);
    if (rareMap) expect(specialty.result.rewardRolls).toBe(30);
    expect(specialty.result.enemyName).toBe(standard.result.enemyName);
    expect(random).toHaveBeenCalledTimes(standardCalls);
  });
});
