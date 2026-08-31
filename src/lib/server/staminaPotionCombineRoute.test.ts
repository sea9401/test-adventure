import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-test"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  },
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

import { POST } from "@/app/api/v2/me/stamina-potion-combine/route";
import {
  STAMINA_SHARD_COMBINE_COST,
  STAMINA_SHARD_MATERIAL_ID,
} from "@/adventure/data/v2/staminaPotionCrafting";
import { STAMINA_POTIONS_KEY } from "@/adventure/v2/staminaPotions";
import { COMBINE_GOLD_COST } from "@/adventure/data/v2/v2EquipVariance";

const request = (quantity?: unknown) =>
  new Request("http://localhost/api/v2/me/stamina-potion-combine", {
    method: "POST",
    ...(quantity === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ quantity }),
        }),
  });

function seed(shards: number, potions = 0, gold = COMBINE_GOLD_COST * 2) {
  store.clear();
  store.set("character.v2", {
    gold,
    materials: { [STAMINA_SHARD_MATERIAL_ID]: shards },
  });
  store.set(STAMINA_POTIONS_KEY, { count: potions });
}

function character() {
  return store.get("character.v2") as {
    gold: number;
    materials: Record<string, number>;
  };
}

beforeEach(() => store.clear());

describe("POST /api/v2/me/stamina-potion-combine", () => {
  it("spends six shards and gold to add one stamina potion", async () => {
    seed(STAMINA_SHARD_COMBINE_COST + 2, 3);

    const response = await POST(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      shardsLeft: 2,
      staminaPotions: 4,
      goldCost: COMBINE_GOLD_COST,
    });
    expect(character().materials[STAMINA_SHARD_MATERIAL_ID]).toBe(2);
    expect(character().gold).toBe(COMBINE_GOLD_COST);
    expect(store.get(STAMINA_POTIONS_KEY)).toEqual({
      count: 4,
      boundCount: 0,
    });
  });

  it("removes the material key when exactly six shards are spent", async () => {
    seed(STAMINA_SHARD_COMBINE_COST);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(character().materials[STAMINA_SHARD_MATERIAL_ID]).toBeUndefined();
  });

  it("atomically combines the requested number of stamina potions", async () => {
    seed(STAMINA_SHARD_COMBINE_COST * 3 + 2, 4, COMBINE_GOLD_COST * 4);

    const response = await POST(request(3));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      quantity: 3,
      shardsLeft: 2,
      staminaPotions: 7,
      goldCost: COMBINE_GOLD_COST * 3,
    });
    expect(character().materials[STAMINA_SHARD_MATERIAL_ID]).toBe(2);
    expect(character().gold).toBe(COMBINE_GOLD_COST);
    expect(store.get(STAMINA_POTIONS_KEY)).toEqual({
      count: 7,
      boundCount: 0,
    });
  });

  it("rejects an invalid quantity without changing either save", async () => {
    seed(STAMINA_SHARD_COMBINE_COST * 3, 2, COMBINE_GOLD_COST * 3);
    const beforeCharacter = JSON.stringify(character());
    const beforePotions = JSON.stringify(store.get(STAMINA_POTIONS_KEY));

    const response = await POST(request(0));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "invalid_quantity",
    });
    expect(JSON.stringify(character())).toBe(beforeCharacter);
    expect(JSON.stringify(store.get(STAMINA_POTIONS_KEY))).toBe(beforePotions);
  });

  it("rejects insufficient shards without changing materials or potions", async () => {
    seed(STAMINA_SHARD_COMBINE_COST - 1, 2);
    const before = JSON.stringify(character());

    const response = await POST(request());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      error: "insufficient_material",
      need: STAMINA_SHARD_COMBINE_COST,
    });
    expect(JSON.stringify(character())).toBe(before);
    expect(store.get(STAMINA_POTIONS_KEY)).toEqual({ count: 2 });
  });

  it("rejects insufficient gold without changing materials or potions", async () => {
    seed(STAMINA_SHARD_COMBINE_COST, 2, COMBINE_GOLD_COST - 1);
    const before = JSON.stringify(character());

    const response = await POST(request());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      error: "insufficient_gold",
      goldCost: COMBINE_GOLD_COST,
    });
    expect(JSON.stringify(character())).toBe(before);
    expect(store.get(STAMINA_POTIONS_KEY)).toEqual({ count: 2 });
  });
});
