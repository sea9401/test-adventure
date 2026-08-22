import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  const selectResults: unknown[][] = [];
  const insertResults: unknown[][] = [];
  const insertValues = vi.fn();
  const insertFeedEntry = vi.fn(async () => undefined);
  const ensureUser = vi.fn(async (): Promise<string | null> => "cook-user");

  function select() {
    let consumed = false;
    const take = () => {
      if (consumed) return [];
      consumed = true;
      return selectResults.shift() ?? [];
    };
    const builder: Record<string, unknown> = {};
    builder.from = vi.fn(() => builder);
    builder.where = vi.fn(() => builder);
    builder.limit = vi.fn(async () => take());
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(take()).then(resolve, reject);
    return builder;
  }

  function insert() {
    const builder: Record<string, unknown> = {};
    builder.values = vi.fn((value: unknown) => {
      insertValues(value);
      return builder;
    });
    builder.onConflictDoNothing = vi.fn(() => builder);
    builder.returning = vi.fn(async () => insertResults.shift() ?? []);
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve, reject);
    return builder;
  }

  const tx = { select, insert };
  const db = {
    select,
    insert,
    transaction: vi.fn(async (callback: (executor: typeof tx) => unknown) => callback(tx)),
  };
  return { store, selectResults, insertResults, insertValues, insertFeedEntry, ensureUser, db };
});

vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/serverFeed", () => ({ insertFeedEntry: mocks.insertFeedEntry }));
vi.mock("@/lib/server/userRateLimit", () => ({ enforceUserAndIpRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/server/referrals", () => ({
  rewardReferralTutorialTasks: vi.fn(async () => ({
    staminaPotions: 0,
    newlyCompletedTaskIds: [],
    completedTaskIds: [],
  })),
}));
vi.mock("@/lib/server/codexMasteryGameplay", () => ({
  recordCodexMasteryGameplayBatch: vi.fn(async () => []),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    mocks.store.has(key) ? mocks.store.get(key) : fallback),
  readSave: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    mocks.store.has(key) ? mocks.store.get(key) : fallback),
  upsertSave: vi.fn(async (_tx, _userId, key: string, value: unknown) => {
    mocks.store.set(key, value);
  }),
}));

import { GET, POST } from "./route";
import { emptyCookingState, cookingLevelXpThreshold } from "@/adventure/v2/cooking/state";
import { emptyFarmState } from "@/adventure/v2/farm";
import { emptyFishingStock } from "@/adventure/v2/fishingStock";
import { emptyV2SkillsState } from "@/adventure/data/v2/v2Skills";
import { COOKING_SECRET_RECIPE_BY_ID } from "@/lib/server/cooking/recipes";

const NOW = Date.parse("2026-08-22T12:00:00+09:00");

function post(body: Record<string, unknown>) {
  return POST(new Request("http://localhost/api/v2/cooking", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function seed() {
  mocks.store.clear();
  mocks.store.set("character.v2", { class: "none", level: 1, gold: 10_000, name: "테스터" });
  mocks.store.set("skills.v2", emptyV2SkillsState());
  mocks.store.set("farm.v2", emptyFarmState(NOW));
  mocks.store.set("fishing-stock.v1", emptyFishingStock());
  mocks.store.set("cooking.v2", emptyCookingState(NOW));
  mocks.store.set("inventory.v2", {});
}

describe("/api/v2/cooking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.selectResults.length = 0;
    mocks.insertResults.length = 0;
    mocks.insertValues.mockClear();
    mocks.insertFeedEntry.mockClear();
    mocks.ensureUser.mockResolvedValue("cook-user");
    seed();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("인증되지 않은 요청을 거부한다", async () => {
    mocks.ensureUser.mockResolvedValueOnce(null);
    const response = await GET(new Request("http://localhost/api/v2/cooking"));
    expect(response.status).toBe(401);
  });

  it("GET은 공개 카탈로그와 발견한 조합만 반환한다", async () => {
    mocks.selectResults.push([]);
    const response = await GET(new Request("http://localhost/api/v2/cooking"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.recipes).toHaveLength(100);
    expect(json.recipes.find((entry: { id: string }) => entry.id === "tomato_salad")).not.toHaveProperty("ingredients");
    expect(json.knownRecipes.map((entry: { id: string }) => entry.id)).not.toContain("tomato_salad");
    expect(json.knownRecipes).toHaveLength(6);
  });

  it("정답 연구를 개인 도감에 저장하고 DB insert 승자만 최초 발견자로 기록한다", async () => {
    const recipe = COOKING_SECRET_RECIPE_BY_ID.get("tomato_salad")!;
    const cooking = emptyCookingState(NOW);
    mocks.store.set("cooking.v2", { ...cooking, xp: cookingLevelXpThreshold(10) });
    const farm = emptyFarmState(NOW);
    const farmItems: Record<string, number> = {};
    const kitchenItems: Record<string, number> = {};
    for (const ingredient of recipe.ingredients) {
      const [kind, id] = ingredient.id.split(":");
      if (kind === "farm") farmItems[id] = 1;
      else kitchenItems[ingredient.id] = 1;
    }
    mocks.store.set("farm.v2", { ...farm, inventory: farmItems });
    mocks.store.set("cooking.v2", { ...cooking, xp: cookingLevelXpThreshold(10), kitchenItems });
    mocks.selectResults.push([], [{ recipeId: recipe.id, userId: "cook-user", actorName: "테스터", discoveredAt: new Date(NOW) }]);
    mocks.insertResults.push([{ recipeId: recipe.id }]);

    const response = await post({
      action: "research",
      method: recipe.method,
      ingredientIds: recipe.ingredients.map((entry) => entry.id).reverse(),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.result).toMatchObject({ outcome: "success", recipeId: recipe.id, firstDiscovery: true });
    expect((mocks.store.get("cooking.v2") as { discoveredRecipeIds: string[] }).discoveredRecipeIds).toContain(recipe.id);
    expect(mocks.insertFeedEntry).toHaveBeenCalledWith("cook-user", "cooking_discovery", { recipeId: recipe.id });
  });

  it("오답은 한 개씩 소비하고 실패 조합과 실패 음식을 남긴다", async () => {
    const cooking = emptyCookingState(NOW);
    mocks.store.set("cooking.v2", { ...cooking, xp: cookingLevelXpThreshold(10) });
    const farm = emptyFarmState(NOW);
    mocks.store.set("farm.v2", { ...farm, inventory: { wheat: 1, milk: 1, rice: 1 } });
    mocks.selectResults.push([], []);

    const response = await post({ action: "research", method: "stir_fry", ingredientIds: ["farm:wheat", "farm:milk", "farm:rice"] });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.result).toMatchObject({ outcome: "failure", earnedXp: 6, failedDishCount: 1 });
    expect(mocks.store.get("inventory.v2")).toMatchObject({ failedCookingDishes: 1 });
    expect((mocks.store.get("farm.v2") as { inventory: object }).inventory).toEqual({});
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ userId: "cook-user", method: "stir_fry" }));
  });

  it("전문 분야는 조건 달성 후 한 번만 정한다", async () => {
    const hidden = [
      "tomato_salad", "herb_omelet", "egg_fried_rice", "herb_roasted_pork", "crispy_pork_cutlet",
      "soy_pork_rice_bowl", "soy_braised_eggs", "onion_steak", "golden_corn_fritters", "tomato_pork_skewers",
    ];
    const cooking = emptyCookingState(NOW);
    mocks.store.set("cooking.v2", {
      ...cooking,
      xp: cookingLevelXpThreshold(20),
      discoveredRecipeIds: [...cooking.discoveredRecipeIds, ...hidden],
    });
    mocks.selectResults.push([]);

    const first = await post({ action: "choose_specialty", field: "hearth" });
    expect(first.status).toBe(200);
    expect((mocks.store.get("cooking.v2") as { specialty: object }).specialty).toEqual({ field: "hearth", xp: 0 });

    const second = await post({ action: "choose_specialty", field: "pot" });
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({ error: "specialty_permanent" });
  });

  it("가공은 농장 재료를 차감하고 주방 재료를 저장한다", async () => {
    const farm = emptyFarmState(NOW);
    mocks.store.set("farm.v2", { ...farm, inventory: { wheat: 6 } });
    mocks.selectResults.push([]);

    const response = await post({ action: "process", itemId: "processed:flour", quantity: 2 });
    expect(response.status).toBe(200);
    expect((mocks.store.get("farm.v2") as { inventory: object }).inventory).toEqual({});
    expect(mocks.store.get("cooking.v2")).toMatchObject({ kitchenItems: { "processed:flour": 2 } });
  });
});
