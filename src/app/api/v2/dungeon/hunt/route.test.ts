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
import { parseEquipmentSave } from "@/adventure/data/v2/v2Equipment";
import { newRareMapInstance } from "@/adventure/data/v2/rareMaps";
import type { UnexploredHuntMode } from "@/adventure/data/v2/unexploredSpecialtyPools";

const focused = { mode: "focused", poolId: "iron_legion" } as const;

function seed(mode: UnexploredHuntMode = { mode: "standard" }, depth = 80, rareMap = false) {
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

describe("unexplored specialty hunt route", () => {
  it.each([
    [{ mode: "random" }, 0.003999, "v2_unexplored_iron_line_armor"],
    [{ mode: "random" }, 0.004, null],
    [focused, 0.005999, "v2_unexplored_iron_line_armor"],
    [focused, 0.006, null],
  ] as const)("uses saved %j with drop boundary %s", async (mode, roll, expected) => {
    seed(mode);
    vi.spyOn(Math, "random").mockReturnValue(roll);
    // A conflicting body field must not override the saved mode.
    const { result } = await hunt({ unexploredHuntMode: { mode: "standard" } });
    expect(result).toMatchObject({ won: true, enemyName: "철갑 방패병", droppedSpecialty: expected,
      droppedSpecialties: expected ? [expected] : [] });
    expect(result.droppedEquipment).not.toBe("v2_unexplored_iron_line_armor");
    expect(result.droppedUnique).not.toBe("v2_unexplored_iron_line_armor");
    const instances = parseEquipmentSave(store.get("equipment.v2")).owned.filter(({ id }) => id.startsWith("v2_unexplored_"));
    expect(instances).toHaveLength(expected ? 1 : 0);
    if (expected) {
      expect(instances[0]).toMatchObject({ id: expected, iid: expect.any(String), roll: expect.any(Object) });
      expect(codexEvents).toContainEqual({ category: "equipment", entryId: expected, amount: 1, source: "equipment.drop" });
    }
    // Specialty display names preserve the underlying monster identity used by material/codex routing.
    expect(codexEvents).toContainEqual({ category: "monster", entryId: "성해의 파수꾼", amount: 1, source: "hunt.victory" });
  });

  it("keeps standard hunts on the existing enemy pool", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.003999);
    const { result } = await hunt();
    expect(result).toMatchObject({ won: true, enemyName: "성해의 파수꾼", droppedSpecialty: null, droppedSpecialties: [] });
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
    expect(specialty.result.droppedSpecialties).toEqual([]);
    expect(random).toHaveBeenCalledTimes(standardCalls);
  });

  it("aggregates all five specialty drops, persists unique instances and records all equipment events", async () => {
    seed(focused);
    vi.spyOn(Math, "random").mockReturnValue(0.005999);
    const { batch } = await hunt({ count: 5 });
    expect(batch).toMatchObject({ completed: 5, wins: 5,
      droppedSpecialties: Array(5).fill("v2_unexplored_iron_line_armor") });
    const instances = parseEquipmentSave(store.get("equipment.v2")).owned.filter(({ id }) => id === "v2_unexplored_iron_line_armor");
    expect(instances).toHaveLength(5);
    expect(new Set(instances.map(({ iid }) => iid)).size).toBe(5);
    expect(codexEvents.filter(({ entryId }) => entryId === "v2_unexplored_iron_line_armor")).toHaveLength(5);
    expect(batch.replays.every((replay: { enemyName: string }) => replay.enemyName === "철갑 방패병")).toBe(true);
  });
});
