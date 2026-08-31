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
import { POST as rebuild } from "@/app/api/v2/farm/ranch/rebuild/route";
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

  it("feeds a slot without resetting its partial production progress", async () => {
    const base = emptyFarmState(NOW - HOUR);
    store.set(FARM_SAVE_KEY, {
      ...base,
      inventory: { compound_feed: 6 },
      ranch: addRanchFeed(base.ranch, "slot-1", 1, NOW - HOUR),
    });

    const response = await feed(
      request("/api/v2/farm/ranch/feed", { slotId: "slot-1", amount: 5 }),
    );
    expect(response.status).toBe(200);
    const farm = store.get(FARM_SAVE_KEY) as FarmState;
    expect(farm.inventory.compound_feed).toBe(1);
    expect(farm.ranch.slots["slot-1"]).toMatchObject({
      feed: 6,
      progressMs: HOUR,
    });
  });

  it("collects twelve hours of chicken output and xp only once", async () => {
    const base = emptyFarmState(NOW - 12 * HOUR);
    store.set(FARM_SAVE_KEY, {
      ...base,
      ranch: addRanchFeed(base.ranch, "slot-1", 6, NOW - 12 * HOUR),
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

  it("constructs a selected level-qualified building once with available reputation", async () => {
    const base = emptyFarmState(NOW);
    store.set(FARM_SAVE_KEY, {
      ...base,
      stats: { ...base.stats, reputation: 30, farmingXp: 810 },
    });

    const first = await upgrade(
      request("/api/v2/farm/ranch/upgrade", {
        slotId: "slot-2",
        animalId: "chicken",
      }),
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      ranchUpgradeResult: {
        slotId: "slot-2",
        animalId: "chicken",
        costReputation: 30,
      },
    });
    expect((store.get(FARM_SAVE_KEY) as FarmState).stats.reputationSpent).toBe(30);

    const second = await upgrade(
      request("/api/v2/farm/ranch/upgrade", {
        slotId: "slot-2",
        animalId: "chicken",
      }),
    );
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ error: "already_unlocked" });
    expect(upsertSave).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed slot and animal identifiers before touching saves", async () => {
    const response = await upgrade(
      request("/api/v2/farm/ranch/upgrade", {
        slotId: "coop-2",
        animalId: "dragon",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_request" });
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("rebuilds an idle slot once and does not charge a repeated request", async () => {
    const base = emptyFarmState(NOW);
    store.set(FARM_SAVE_KEY, {
      ...base,
      ranch: {
        ...base.ranch,
        slots: {
          ...base.ranch.slots,
          "slot-2": {
            ...base.ranch.slots["slot-2"],
            unlocked: true,
            animalId: "chicken",
          },
        },
      },
      stats: { ...base.stats, reputation: 1_000, farmingXp: 3_610 },
    });

    const first = await rebuild(
      request("/api/v2/farm/ranch/rebuild", {
        slotId: "slot-2",
        animalId: "cow",
      }),
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      ranchRebuildResult: {
        slotId: "slot-2",
        animalId: "cow",
        costReputation: 1_000,
      },
    });
    expect((store.get(FARM_SAVE_KEY) as FarmState).stats.reputationSpent).toBe(1_000);

    const second = await rebuild(
      request("/api/v2/farm/ranch/rebuild", {
        slotId: "slot-2",
        animalId: "cow",
      }),
    );
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ error: "same_animal" });
    expect(upsertSave).toHaveBeenCalledTimes(1);
  });

  it("does not rebuild or spend when a slot still has feed", async () => {
    const base = emptyFarmState(NOW);
    const farm = {
      ...base,
      ranch: addRanchFeed(base.ranch, "slot-1", 1, NOW),
      stats: { ...base.stats, reputation: 1_000, farmingXp: 3_610 },
    };
    store.set(FARM_SAVE_KEY, farm);

    const response = await rebuild(
      request("/api/v2/farm/ranch/rebuild", {
        slotId: "slot-1",
        animalId: "cow",
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "slot_not_empty" });
    expect(store.get(FARM_SAVE_KEY)).toBe(farm);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("crafts feed from any mix of farm crops and records the life craft atomically", async () => {
    store.set(FARM_SAVE_KEY, {
      ...emptyFarmState(NOW),
      inventory: {
        wheat: 2,
        corn: 4,
        tomato: 4,
        egg: 7,
        milk: 5,
        pork: 2,
      },
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
      request("/api/v2/farm/feed-craft", {
        quantity: 2,
        cropSelection: { wheat: 1, corn: 2, tomato: 2 },
      }),
    );
    expect(response.status).toBe(200);
    const farm = store.get(FARM_SAVE_KEY) as FarmState;
    const workshop = store.get(LIFE_WORKSHOP_SAVE_KEY) as LifeWorkshopState;
    expect(farm.inventory).toEqual({
      compound_feed: 10,
      egg: 7,
      milk: 5,
      pork: 2,
    });
    expect(workshop.crafting.craftCounts.compound_feed).toBe(3);
    expect(workshop.crafting.discoveredRecipeIds).toContain("compound_feed");
    expect(workshop.crafting.totalCrafts).toBe(3);
  });

  it("crafts feed from only the crops explicitly selected by the player", async () => {
    store.set(FARM_SAVE_KEY, {
      ...emptyFarmState(NOW),
      inventory: { wheat: 5, golden_wheat: 5 },
    });

    const response = await craftFeed(
      request("/api/v2/farm/feed-craft", {
        quantity: 1,
        cropSelection: { golden_wheat: 5 },
      }),
    );

    expect(response.status).toBe(200);
    expect((store.get(FARM_SAVE_KEY) as FarmState).inventory).toEqual({
      wheat: 5,
      compound_feed: 5,
    });
  });

  it("requires an exact five-crop selection before touching saves", async () => {
    const farm = {
      ...emptyFarmState(NOW),
      inventory: { wheat: 10 },
    };
    store.set(FARM_SAVE_KEY, farm);

    for (const cropSelection of [undefined, { wheat: 4 }, { wheat: 5, egg: 1 }]) {
      const response = await craftFeed(
        request("/api/v2/farm/feed-craft", { quantity: 1, cropSelection }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "bad_request" });
    }
    expect(store.get(FARM_SAVE_KEY)).toBe(farm);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("does not count ranch products as feed recipe crops", async () => {
    const farm = {
      ...emptyFarmState(NOW),
      inventory: { wheat: 4, egg: 20, milk: 20, pork: 20 },
    };
    store.set(FARM_SAVE_KEY, farm);

    const response = await craftFeed(
      request("/api/v2/farm/feed-craft", {
        quantity: 1,
        cropSelection: { wheat: 5 },
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "not_enough_items" });
    expect(store.get(FARM_SAVE_KEY)).toBe(farm);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("crafts five feed from twenty-five failed dishes and records the recycle recipe", async () => {
    store.set(FARM_SAVE_KEY, {
      ...emptyFarmState(NOW),
      inventory: { compound_feed: 3 },
    });
    store.set("inventory.v2", {
      failedCookingDishes: 51,
      cookingFoods: { "food:rustic_bread:normal:regular:0": 2 },
    });
    const workshopBase = emptyLifeWorkshopState();
    store.set(LIFE_WORKSHOP_SAVE_KEY, {
      ...workshopBase,
      crafting: {
        ...workshopBase.crafting,
        craftCounts: { failed_dish_feed: 1 },
        discoveredRecipeIds: ["failed_dish_feed"],
        totalCrafts: 1,
      },
    });

    const response = await craftFeed(
      request("/api/v2/farm/feed-craft", {
        recipeId: "failed_dish_feed",
        quantity: 2,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      feedCraftResult: {
        recipeId: "failed_dish_feed",
        quantity: 2,
        produced: 10,
      },
    });
    expect((store.get(FARM_SAVE_KEY) as FarmState).inventory.compound_feed).toBe(13);
    expect(store.get("inventory.v2")).toEqual({
      failedCookingDishes: 1,
      cookingFoods: { "food:rustic_bread:normal:regular:0": 2 },
    });
    expect(store.get(LIFE_WORKSHOP_SAVE_KEY)).toMatchObject({
      crafting: {
        craftCounts: { failed_dish_feed: 3 },
        discoveredRecipeIds: ["failed_dish_feed"],
        totalCrafts: 3,
      },
    });
  });

  it("does not change any save when failed dishes cannot cover recycled feed", async () => {
    const farm = { ...emptyFarmState(NOW), inventory: { compound_feed: 3 } };
    const inventory = { failedCookingDishes: 24, cookingFoods: {} };
    store.set(FARM_SAVE_KEY, farm);
    store.set("inventory.v2", inventory);

    const response = await craftFeed(
      request("/api/v2/farm/feed-craft", {
        recipeId: "failed_dish_feed",
        quantity: 1,
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "not_enough_failed_dishes",
    });
    expect(store.get(FARM_SAVE_KEY)).toBe(farm);
    expect(store.get("inventory.v2")).toBe(inventory);
    expect(store.has(LIFE_WORKSHOP_SAVE_KEY)).toBe(false);
    expect(upsertSave).not.toHaveBeenCalled();
  });

  it("writes neither save when feed crafting is locked or underfunded", async () => {
    store.set("skills.v2", { learned: [] });
    const farm = { ...emptyFarmState(NOW), inventory: { wheat: 8 } };
    const workshop = emptyLifeWorkshopState();
    store.set(FARM_SAVE_KEY, farm);
    store.set(LIFE_WORKSHOP_SAVE_KEY, workshop);

    const response = await craftFeed(
      request("/api/v2/farm/feed-craft", {
        quantity: 1,
        cropSelection: { wheat: 5 },
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "ranch_locked" });
    expect(store.get(FARM_SAVE_KEY)).toBe(farm);
    expect(store.get(LIFE_WORKSHOP_SAVE_KEY)).toBe(workshop);
    expect(upsertSave).not.toHaveBeenCalled();
  });
});
