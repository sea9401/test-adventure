import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, upsertSave } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/lib/server/farmingRateLimit", () => ({
  enforceFarmingRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: vi.fn(async () => false),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({}),
    ),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave,
}));

import { POST as feed } from "@/app/api/v2/farm/ranch/feed/route";
import { POST as collect } from "@/app/api/v2/farm/ranch/collect/route";
import { POST as upgrade } from "@/app/api/v2/farm/ranch/upgrade/route";
import { POST as craftFeed } from "@/app/api/v2/farm/feed-craft/route";
import {
  FARM_CROP_REQUIRED_SKILL_ID,
  FARM_SAVE_KEY,
  emptyFarmState,
  type FarmState,
} from "@/adventure/v2/farm";
import { addRanchFeed } from "@/adventure/v2/ranch";
import {
  LIFE_WORKSHOP_SAVE_KEY,
  emptyLifeWorkshopState,
  type LifeWorkshopState,
} from "@/adventure/v2/lifeWorkshop";

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

function request(url: string, body: Record<string, unknown>) {
  return new Request(`http://test.local${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function unlockRanch() {
  store.set("skills.v2", { learned: [FARM_CROP_REQUIRED_SKILL_ID] });
}

describe("ranch routes", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    unlockRanch();
  });

  afterEach(() => {
    store.clear();
    upsertSave.mockClear();
    vi.restoreAllMocks();
  });

  it("feeds a pen without resetting its partial production progress", async () => {
    const base = emptyFarmState(NOW - HOUR);
    store.set(FARM_SAVE_KEY, {
      ...base,
      inventory: { compound_feed: 6 },
      ranch: addRanchFeed(base.ranch, "coop-1", 1, NOW - HOUR),
    });

    const response = await feed(
      request("/api/v2/farm/ranch/feed", { penId: "coop-1", amount: 5 }),
    );
    expect(response.status).toBe(200);
    const farm = store.get(FARM_SAVE_KEY) as FarmState;
    expect(farm.inventory.compound_feed).toBe(1);
    expect(farm.ranch.pens["coop-1"]).toMatchObject({
      feed: 6,
      progressMs: HOUR,
    });
  });

  it("collects twelve hours of chicken output and xp only once", async () => {
    const base = emptyFarmState(NOW - 12 * HOUR);
    store.set(FARM_SAVE_KEY, {
      ...base,
      ranch: addRanchFeed(base.ranch, "coop-1", 6, NOW - 12 * HOUR),
    });

    const first = await collect(request("/api/v2/farm/ranch/collect", {}));
    expect(first.status).toBe(200);
    const farm = store.get(FARM_SAVE_KEY) as FarmState;
    expect(farm.inventory.egg).toBe(12);
    expect(farm.stats.farmingXp).toBe(12);

    const second = await collect(request("/api/v2/farm/ranch/collect", {}));
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ error: "nothing_to_collect" });
    expect((store.get(FARM_SAVE_KEY) as FarmState).inventory.egg).toBe(12);
  });

  it("buys a level-qualified pen once with available reputation", async () => {
    const base = emptyFarmState(NOW);
    store.set(FARM_SAVE_KEY, {
      ...base,
      stats: { ...base.stats, reputation: 30, farmingXp: 810 },
    });

    const first = await upgrade(
      request("/api/v2/farm/ranch/upgrade", { penId: "coop-2" }),
    );
    expect(first.status).toBe(200);
    expect((store.get(FARM_SAVE_KEY) as FarmState).stats.reputationSpent).toBe(30);

    const second = await upgrade(
      request("/api/v2/farm/ranch/upgrade", { penId: "coop-2" }),
    );
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ error: "already_unlocked" });
  });

  it("crafts feed from farm crops and records the life craft atomically", async () => {
    store.set(FARM_SAVE_KEY, {
      ...emptyFarmState(NOW),
      inventory: { wheat: 8, corn: 6, herb: 2 },
    });
    const workshopBase = emptyLifeWorkshopState();
    store.set(LIFE_WORKSHOP_SAVE_KEY, {
      ...workshopBase,
      crafting: {
        ...workshopBase.crafting,
        craftCounts: { compound_feed: 1 },
        discoveredRecipeIds: ["compound_feed"],
        totalCrafts: 1,
      },
    });

    const response = await craftFeed(
      request("/api/v2/farm/feed-craft", { quantity: 2 }),
    );
    expect(response.status).toBe(200);
    const farm = store.get(FARM_SAVE_KEY) as FarmState;
    const workshop = store.get(LIFE_WORKSHOP_SAVE_KEY) as LifeWorkshopState;
    expect(farm.inventory).toEqual({ compound_feed: 10 });
    expect(workshop.crafting.craftCounts.compound_feed).toBe(3);
    expect(workshop.crafting.discoveredRecipeIds).toContain("compound_feed");
    expect(workshop.crafting.totalCrafts).toBe(3);
  });

  it("writes neither save when feed crafting is locked or underfunded", async () => {
    store.set("skills.v2", { learned: [] });
    const farm = { ...emptyFarmState(NOW), inventory: { wheat: 8 } };
    const workshop = emptyLifeWorkshopState();
    store.set(FARM_SAVE_KEY, farm);
    store.set(LIFE_WORKSHOP_SAVE_KEY, workshop);

    const response = await craftFeed(
      request("/api/v2/farm/feed-craft", { quantity: 1 }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "ranch_locked" });
    expect(store.get(FARM_SAVE_KEY)).toBe(farm);
    expect(store.get(LIFE_WORKSHOP_SAVE_KEY)).toBe(workshop);
    expect(upsertSave).not.toHaveBeenCalled();
  });
});
