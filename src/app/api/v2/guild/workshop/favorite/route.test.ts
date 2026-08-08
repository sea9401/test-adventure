import { beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) =>
      callback({}),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "workshop-user"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx: object, _userId: string, key: string, fallback: object) =>
      store.get(key) ?? fallback,
  ),
  upsertSave: vi.fn(
    async (_tx: object, _userId: string, key: string, value: object) => {
      store.set(key, value as Record<string, unknown>);
    },
  ),
}));

import { PATCH } from "./route";

function request(recipeId: unknown): Request {
  return new Request("http://localhost/api/v2/guild/workshop/favorite", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipeId }),
  });
}

describe("PATCH /api/v2/guild/workshop/favorite", () => {
  beforeEach(() => {
    store.clear();
    store.set("crafting.v2", { artisan: { blacksmith: { xp: 123 } } });
  });

  it("제작 레시피 즐겨찾기를 추가하고 기존 제작 정보를 보존한다", async () => {
    const response = await PATCH(request("crafted_oathblade"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      favoriteRecipeIds: ["crafted_oathblade"],
    });
    expect(store.get("crafting.v2")).toEqual({
      artisan: { blacksmith: { xp: 123 } },
      workshopFavoriteRecipeIds: ["crafted_oathblade"],
    });
  });

  it("이미 즐겨찾는 레시피를 다시 누르면 해제한다", async () => {
    store.set("crafting.v2", {
      workshopFavoriteRecipeIds: ["crafted_oathblade"],
    });

    const response = await PATCH(request("crafted_oathblade"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, favoriteRecipeIds: [] });
    expect(store.get("crafting.v2")).toEqual({});
  });

  it("등록되지 않은 레시피는 거절한다", async () => {
    const response = await PATCH(request("unknown_recipe"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "invalid_recipe",
    });
    expect(store.get("crafting.v2")).toEqual({
      artisan: { blacksmith: { xp: 123 } },
    });
  });
});
