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

import { POST } from "@/app/api/v2/me/scavenged-crafting/route";
import { RARE_MAP_CAP, newRareMapInstance } from "@/adventure/data/v2/rareMaps";
import {
  ENHANCE_EMBER_BLUE_COST,
  ENHANCE_EMBER_MATERIAL_ID,
  ENHANCE_EMBER_RED_COST,
  TORN_MAP_FRAGMENT_COMBINE_COST,
  TORN_MAP_FRAGMENT_MATERIAL_ID,
  type ScavengedCraftRecipeId,
} from "@/adventure/data/v2/scavengedCrafting";
import { ENHANCE_STONE_MATERIAL_ID } from "@/adventure/data/v2/v2Enhance";

function request(recipe: ScavengedCraftRecipeId | string) {
  return new Request("http://localhost/api/v2/me/scavenged-crafting", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipe }),
  });
}

function character() {
  return store.get("character.v2") as {
    materials: Record<string, number>;
    frontierDepth?: number;
    rareMaps?: ReturnType<typeof newRareMapInstance>[];
  };
}

beforeEach(() => {
  store.clear();
  vi.restoreAllMocks();
});

describe("POST /api/v2/me/scavenged-crafting", () => {
  it("turns eight embers into one blue enhancement stone", async () => {
    store.set("character.v2", {
      materials: { [ENHANCE_EMBER_MATERIAL_ID]: ENHANCE_EMBER_BLUE_COST + 2 },
    });

    const response = await POST(request("blue_enhance_stone"));

    expect(response.status).toBe(200);
    expect(character().materials[ENHANCE_EMBER_MATERIAL_ID]).toBe(2);
    expect(character().materials[ENHANCE_STONE_MATERIAL_ID.blue]).toBe(1);
  });

  it("turns twenty-four embers into one red stone and removes an empty key", async () => {
    store.set("character.v2", {
      materials: { [ENHANCE_EMBER_MATERIAL_ID]: ENHANCE_EMBER_RED_COST },
    });

    const response = await POST(request("red_enhance_stone"));

    expect(response.status).toBe(200);
    expect(character().materials[ENHANCE_EMBER_MATERIAL_ID]).toBeUndefined();
    expect(character().materials[ENHANCE_STONE_MATERIAL_ID.red]).toBe(1);
  });

  it("restores a weighted random rare map at the current frontier depth", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    store.set("character.v2", {
      frontierDepth: 37,
      materials: {
        [TORN_MAP_FRAGMENT_MATERIAL_ID]: TORN_MAP_FRAGMENT_COMBINE_COST,
      },
    });

    const response = await POST(request("rare_map"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.rareMap).toMatchObject({ kind: "worn_map", depth: 37 });
    expect(character().materials[TORN_MAP_FRAGMENT_MATERIAL_ID]).toBeUndefined();
    expect(character().rareMaps).toHaveLength(1);
  });

  it("keeps fragments when the active rare-map inventory is full", async () => {
    const now = Date.now();
    store.set("character.v2", {
      frontierDepth: 20,
      materials: {
        [TORN_MAP_FRAGMENT_MATERIAL_ID]: TORN_MAP_FRAGMENT_COMBINE_COST,
      },
      rareMaps: Array.from({ length: RARE_MAP_CAP }, (_, index) =>
        newRareMapInstance("worn_map", 20, now, `rm-full-${index}`),
      ),
    });
    const before = JSON.stringify(character());

    const response = await POST(request("rare_map"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toMatchObject({ error: "rare_map_full", cap: RARE_MAP_CAP });
    expect(JSON.stringify(character())).toBe(before);
  });

  it("rejects insufficient materials and unknown recipes without mutation", async () => {
    store.set("character.v2", {
      materials: { [ENHANCE_EMBER_MATERIAL_ID]: ENHANCE_EMBER_BLUE_COST - 1 },
    });
    const before = JSON.stringify(character());

    const insufficient = await POST(request("blue_enhance_stone"));
    const invalid = await POST(request("unknown"));

    expect(insufficient.status).toBe(400);
    expect((await insufficient.json()).error).toBe("insufficient_material");
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toBe("invalid_recipe");
    expect(JSON.stringify(character())).toBe(before);
  });
});
