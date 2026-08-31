import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  featureEnabled: true,
  userId: "u-unexplored" as string | null,
  saves: new Map<string, unknown>(),
}));

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importActual) => {
  const actual =
    await importActual<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return {
    ...actual,
    V2_EQUIPMENT_LIBERATION: true,
    get V2_UNEXPLORED() {
      return mocks.featureEnabled;
    },
  };
});
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => mocks.userId),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) => callback({})),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  readSave: vi.fn(async (_db, _userId, key: string, fallback: unknown) =>
    mocks.saves.get(key) ?? fallback,
  ),
  lockSaveForUpdate: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    mocks.saves.get(key) ?? fallback,
  ),
  upsertSave: vi.fn(async (_tx, _userId, key: string, value: unknown) => {
    mocks.saves.set(key, value);
  }),
}));

import { GET, POST } from "./route";
import { UNEXPLORED_SUMMON_STONE_GOLD_COST } from "@/adventure/data/v2/unexploredBosses";
import { upsertSave } from "@/lib/server/savesKv";

function request(body: unknown): Request {
  return new Request("http://localhost/api/v2/unexplored", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.featureEnabled = true;
  mocks.userId = "u-unexplored";
  mocks.saves.clear();
  mocks.saves.set("character.v2", {
    level: 100,
    gold: 100_000,
    unexplored: { xpPoints: 3, selectedNodeIds: [] },
  });
});

describe("/api/v2/unexplored", () => {
  it("returns 401 without a user and 404 while the feature is off", async () => {
    mocks.userId = null;
    expect((await GET()).status).toBe(401);

    mocks.userId = "u-unexplored";
    mocks.featureEnabled = false;
    expect((await GET()).status).toBe(404);
    expect((await POST(request({ action: "activate", nodeId: "start" }))).status).toBe(404);
  });

  it("returns the current server snapshot", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      snapshot: {
        level: 100,
        eligible: true,
        earnedPoints: 3,
        spentPoints: 0,
        difficulty: 95,
      },
    });
  });

  it("returns the server-authoritative summon stone cost after the equipped ring discount", async () => {
    mocks.saves.set("equipment.v2", {
      owned: [{
        iid: "discount-ring",
        id: "v2_boss_catastrophe_ring",
        liberation: {
          rank: 1,
          lineCount: 1,
          revision: 1,
          options: [{ id: "personal_craft_gold_discount_pct", level: 20 }],
        },
      }],
      equipped: { ring: "discount-ring" },
    });

    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({
      snapshot: {
        summonStoneCraftCost: {
          baseGoldCost: UNEXPLORED_SUMMON_STONE_GOLD_COST,
          goldCost: UNEXPLORED_SUMMON_STONE_GOLD_COST * 0.9,
          liberationDiscountPct: 10,
        },
      },
    });
  });

  it("validates the request and level before mutation", async () => {
    expect((await POST(request({ action: "wat" }))).status).toBe(400);
    mocks.saves.set("character.v2", { level: 99, gold: 100_000 });
    const response = await POST(request({ action: "activate", nodeId: "start" }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "level_required",
    });
  });

  it("atomically persists a successful activation and returns its snapshot", async () => {
    const response = await POST(request({ action: "activate", nodeId: "start" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      snapshot: { selectedNodeIds: ["start"], spentPoints: 1 },
    });
    expect(upsertSave).toHaveBeenCalledOnce();
    expect(mocks.saves.get("character.v2")).toMatchObject({
      gold: 100_000,
      unexplored: { selectedNodeIds: ["start"] },
    });
  });

  it("does not persist a rejected mutation", async () => {
    const response = await POST(request({ action: "activate", nodeId: "deep-boss" }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "not_adjacent",
    });
    expect(upsertSave).not.toHaveBeenCalled();
  });
});
