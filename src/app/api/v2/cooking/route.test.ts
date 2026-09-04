import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  const selectResults: unknown[][] = [];
  const insertResults: unknown[][] = [];
  const insertValues = vi.fn();
  const insertFeedEntry = vi.fn(async () => undefined);
  const resolveUserDisplayName = vi.fn(async () => "나리");
  const ensureUser = vi.fn(async (): Promise<string | null> => "cook-user");
  const rateLimitCounts = new Map<string, number>();
  const enforceUserAndIpRateLimit = vi.fn((
    _request: Request,
    options: { action: string; userLimit: number },
  ) => {
    const next = (rateLimitCounts.get(options.action) ?? 0) + 1;
    rateLimitCounts.set(options.action, next);
    return next > options.userLimit
      ? Response.json({ ok: false, error: "rate_limited", retryAfterSec: 60 }, { status: 429 })
      : null;
  });

  function select() {
    let consumed = false;
    const take = () => {
      if (consumed) return [];
      consumed = true;
      return selectResults.shift() ?? [];
    };
    const builder: Record<string, unknown> = {};
    builder.from = vi.fn(() => builder);
    builder.innerJoin = vi.fn(() => builder);
    builder.leftJoin = vi.fn(() => builder);
    builder.where = vi.fn(() => builder);
    builder.orderBy = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
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
  return {
    originalCoreLoopEnv: process.env.NEXT_PUBLIC_V2_CORE_LOOP_V2,
    store,
    selectResults,
    insertResults,
    insertValues,
    insertFeedEntry,
    resolveUserDisplayName,
    ensureUser,
    rateLimitCounts,
    enforceUserAndIpRateLimit,
    db,
  };
});

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_V2_CORE_LOOP_V2 = "true";
});

vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("@/lib/server/ensureUser", () => ({ ensureUser: mocks.ensureUser }));
vi.mock("@/lib/server/serverFeed", () => ({
  insertFeedEntry: mocks.insertFeedEntry,
  resolveUserDisplayName: mocks.resolveUserDisplayName,
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: mocks.enforceUserAndIpRateLimit,
}));
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
import { COOKING_PUBLIC_RECIPES } from "@/adventure/v2/cooking/catalog";
import { emptyLifeWorkshopState } from "@/adventure/v2/lifeWorkshop";

const NOW = Date.parse("2026-08-22T12:00:00+09:00");

afterAll(() => {
  if (mocks.originalCoreLoopEnv === undefined) {
    delete process.env.NEXT_PUBLIC_V2_CORE_LOOP_V2;
  } else {
    process.env.NEXT_PUBLIC_V2_CORE_LOOP_V2 = mocks.originalCoreLoopEnv;
  }
});

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
  mocks.store.set("life-workshop.v1", emptyLifeWorkshopState());
}

describe("/api/v2/cooking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.selectResults.length = 0;
    mocks.insertResults.length = 0;
    mocks.insertValues.mockClear();
    mocks.insertFeedEntry.mockClear();
    mocks.resolveUserDisplayName.mockReset();
    mocks.resolveUserDisplayName.mockResolvedValue("나리");
    mocks.ensureUser.mockResolvedValue("cook-user");
    mocks.rateLimitCounts.clear();
    mocks.enforceUserAndIpRateLimit.mockClear();
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

  it("GET은 미발견 카탈로그를 숨기고 개인·공개 발견 정보만 반환한다", async () => {
    const cooking = emptyCookingState(NOW);
    mocks.store.set("cooking.v2", {
      ...cooking,
      discoveredRecipeIds: [...cooking.discoveredRecipeIds, "potato_stew"],
    });
    mocks.selectResults.push([{
      recipeId: "potato_stew",
      userId: "other-cook",
      actorName: "첫발견자",
      authoritativeActorName: null,
      discoveredAt: new Date(NOW - 10_000),
    }, {
      recipeId: "tomato_salad",
      userId: "another-cook",
      actorName: "다른발견자",
      authoritativeActorName: null,
      discoveredAt: new Date(NOW - 20_000),
    }], [{
      method: "stir_fry",
      ingredientIds: ["farm:wheat", "farm:milk"],
      createdAt: new Date(NOW),
    }, {
      method: "fry",
      ingredientIds: ["pantry:salt", "farm:egg"],
      createdAt: new Date(NOW - 500),
    }, {
      method: "sous_vide",
      ingredientIds: ["farm:wheat", "farm:milk"],
      createdAt: new Date(NOW - 1_000),
    }, {
      method: "grill",
      ingredientIds: ["farm:unreleased_ingredient", "farm:milk"],
      createdAt: new Date(NOW - 2_000),
    }]);
    const response = await GET(new Request("http://localhost/api/v2/cooking"));
    const json = await response.json();
    const hiddenRecipe = COOKING_SECRET_RECIPE_BY_ID.get("egg_salad_sandwich")!;
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json).not.toHaveProperty("recipes");
    expect(json).not.toHaveProperty("firstDiscoveries");
    expect(json.recipeTotal).toBe(COOKING_PUBLIC_RECIPES.length);
    expect(json.knownRecipes.map((entry: { id: string }) => entry.id)).not.toContain("tomato_salad");
    expect(json.knownRecipes).toHaveLength(7);
    expect(json.knownRecipes[0]).toHaveProperty("ingredients");
    expect(json.publicDiscoveries).toEqual([
      {
        recipeName: "감자 양파 스튜",
        imageSrc: "/images/items/cooking/potato_stew.webp",
        actorName: "첫발견자",
        discoveredAt: NOW - 10_000,
        codexRegistered: true,
      },
      {
        recipeName: "불향 토마토 샐러드",
        imageSrc: "/images/items/cooking/tomato_salad.webp",
        actorName: "다른발견자",
        discoveredAt: NOW - 20_000,
        codexRegistered: false,
      },
    ]);
    expect(json.publicDiscoveries[0]).not.toHaveProperty("recipeId");
    expect(json.publicDiscoveries[1]).not.toHaveProperty("recipeId");
    expect(json.publicDiscoveries[0]).not.toHaveProperty("ingredients");
    expect(serialized).not.toContain(hiddenRecipe.id);
    expect(serialized).not.toContain(hiddenRecipe.name);
    expect(serialized).not.toContain(hiddenRecipe.description);
    expect(json.failedResearches).toEqual([{
      method: "stir_fry",
      ingredientIds: ["farm:wheat", "farm:milk"],
      createdAt: NOW,
    }]);
    expect(json.cookingPrepSets).toBe(0);
  });

  it("요리 준비 세트를 선택한 수량만큼 차감하고 걸작 확률을 8%p 높인다", async () => {
    const recipe = COOKING_SECRET_RECIPE_BY_ID.get("rustic_bread")!;
    const farm = emptyFarmState(NOW);
    const cooking = emptyCookingState(NOW);
    mocks.store.set("farm.v2", { ...farm, inventory: { wheat: 10 } });
    mocks.store.set("cooking.v2", {
      ...cooking,
      kitchenItems: { "pantry:yeast": 10 },
    });
    const workshop = emptyLifeWorkshopState();
    mocks.store.set("life-workshop.v1", {
      ...workshop,
      crafting: {
        ...workshop.crafting,
        balances: { cooking_prep_set: 2 },
      },
    });
    vi.spyOn(Math, "random").mockReturnValue(0.05);

    const response = await post({
      action: "craft",
      recipeId: recipe.id,
      quantity: 1,
      usePrepSet: true,
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.result).toMatchObject({
      quality: "masterpiece",
      usedPrepSets: 1,
    });
    expect(json.cookingFoodDefinitions[json.result.foodId]).toMatchObject({
      recipe: { id: recipe.id, name: recipe.name },
      quality: "masterpiece",
    });
    expect(json.cookingPrepSets).toBe(1);
    expect(mocks.store.get("life-workshop.v1")).toMatchObject({
      crafting: {
        balances: { cooking_prep_set: 1 },
        aidsUsed: 1,
      },
    });
  });

  it("요리 준비 세트가 조리 수량보다 부족하면 재료를 소비하지 않는다", async () => {
    const recipe = COOKING_SECRET_RECIPE_BY_ID.get("rustic_bread")!;
    const farm = emptyFarmState(NOW);
    const cooking = emptyCookingState(NOW);
    mocks.store.set("farm.v2", { ...farm, inventory: { wheat: 10 } });
    mocks.store.set("cooking.v2", {
      ...cooking,
      kitchenItems: { "pantry:yeast": 10 },
    });

    const response = await post({
      action: "craft",
      recipeId: recipe.id,
      quantity: 2,
      usePrepSet: true,
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "not_enough_cooking_prep_sets",
    });
    expect(mocks.store.get("farm.v2")).toMatchObject({
      inventory: { wheat: 10 },
    });
    expect(mocks.store.get("cooking.v2")).toMatchObject({
      kitchenItems: { "pantry:yeast": 10 },
    });
  });

  it("효율적인 조리는 일반 재료만 줄이고 희귀 재료는 줄이지 않는다", async () => {
    const recipe = COOKING_SECRET_RECIPE_BY_ID.get("silverleaf_milk_tea")!;
    const quantity = 10;
    const silverleaf = recipe.ingredients.find((entry) => entry.id === "farm:silverleaf")!;
    const milk = recipe.ingredients.find((entry) => entry.id === "farm:milk")!;
    const cooking = emptyCookingState(NOW);
    const farm = emptyFarmState(NOW);
    mocks.store.set("character.v2", {
      class: "v2_warrior",
      level: 35,
      specChoice: "v2c_headchef",
      gold: 10_000,
      name: "테스터",
    });
    mocks.store.set("skills.v2", {
      learned: ["v2c_headchef_batchcooking"],
      equipped: ["v2c_headchef_batchcooking"],
    });
    mocks.store.set("farm.v2", {
      ...farm,
      inventory: { silverleaf: 100, milk: 100 },
    });
    mocks.store.set("cooking.v2", {
      ...cooking,
      xp: cookingLevelXpThreshold(recipe.requiredLevel),
      discoveredRecipeIds: [...cooking.discoveredRecipeIds, recipe.id],
    });

    const response = await post({
      action: "craft",
      recipeId: recipe.id,
      quantity,
    });

    expect(response.status).toBe(200);
    expect((mocks.store.get("farm.v2") as {
      inventory: Record<string, number>;
    }).inventory).toMatchObject({
      silverleaf: 100 - silverleaf.count * quantity,
      milk: 100 - Math.floor(milk.count * quantity * 0.9),
    });
  });

  it("GET은 기본 이름으로 저장된 최초 발견자를 권위 닉네임으로 표시한다", async () => {
    mocks.selectResults.push([{
      recipeId: "egg_salad_sandwich",
      userId: "cook-user",
      actorName: "이름 없는 모험가",
      authoritativeActorName: "나리",
      discoveredAt: new Date(NOW),
    }, {
      recipeId: "tomato_salad",
      userId: "other-user",
      actorName: "옛 발견자",
      authoritativeActorName: "바뀐 닉네임",
      discoveredAt: new Date(NOW),
    }]);

    const response = await GET(new Request("http://localhost/api/v2/cooking"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.publicDiscoveries).toEqual([
      expect.objectContaining({
        recipeName: "달걀 샐러드 샌드위치",
        actorName: "나리",
      }),
      expect.objectContaining({
        recipeName: "불향 토마토 샐러드",
        actorName: "옛 발견자",
      }),
    ]);
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
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      userId: "cook-user",
      actorName: "나리",
    }));
    expect(mocks.insertFeedEntry).toHaveBeenCalledWith("cook-user", "cooking_discovery", {
      recipeId: recipe.id,
      recipeName: recipe.name,
    });
  });

  it("요구 레벨 전 정답 연구는 발견만 허용하고 제작은 잠근다", async () => {
    const recipe = COOKING_SECRET_RECIPE_BY_ID.get("ranch_grand_feast")!;
    expect(recipe.requiredLevel).toBe(50);

    const cooking = emptyCookingState(NOW);
    const farm = emptyFarmState(NOW);
    const fishing = emptyFishingStock();
    const farmItems: Record<string, number> = {};
    const fishingItems: Record<string, number> = {};
    const kitchenItems: Record<string, number> = {};
    for (const ingredient of recipe.ingredients) {
      const [kind, id] = ingredient.id.split(":");
      if (kind === "farm") farmItems[id] = 1;
      else if (kind === "fishing") fishingItems[id] = 1;
      else kitchenItems[ingredient.id] = 1;
    }
    mocks.store.set("farm.v2", { ...farm, inventory: farmItems });
    mocks.store.set("fishing-stock.v1", { ...fishing, items: fishingItems });
    mocks.store.set("cooking.v2", {
      ...cooking,
      xp: cookingLevelXpThreshold(35),
      kitchenItems,
    });
    mocks.selectResults.push([]);

    const researchResponse = await post({
      action: "research",
      method: recipe.method,
      ingredientIds: recipe.ingredients.map((entry) => entry.id),
    });
    const researchJson = await researchResponse.json();

    expect(researchResponse.status).toBe(200);
    expect(researchJson.result).toMatchObject({
      outcome: "success",
      recipeId: recipe.id,
    });
    expect(
      (mocks.store.get("cooking.v2") as { discoveredRecipeIds: string[] })
        .discoveredRecipeIds,
    ).toContain(recipe.id);

    const craftResponse = await post({
      action: "craft",
      recipeId: recipe.id,
      quantity: 1,
    });

    expect(craftResponse.status).toBe(409);
    await expect(craftResponse.json()).resolves.toMatchObject({ error: "recipe_locked" });
  });

  it("오답은 한 개씩 소비하고 실패 조합과 실패 음식을 남긴다", async () => {
    const cooking = emptyCookingState(NOW);
    mocks.store.set("cooking.v2", { ...cooking, xp: cookingLevelXpThreshold(10) });
    const farm = emptyFarmState(NOW);
    mocks.store.set("farm.v2", { ...farm, inventory: { wheat: 1, milk: 1, rice: 1 } });
    mocks.selectResults.push([], [], [{
      method: "stir_fry",
      ingredientIds: ["farm:wheat", "farm:milk", "farm:rice"],
      createdAt: new Date(NOW),
    }]);

    const response = await post({ action: "research", method: "stir_fry", ingredientIds: ["farm:wheat", "farm:milk", "farm:rice"] });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.result).toMatchObject({ outcome: "failure", earnedXp: 6, failedDishCount: 1 });
    expect(mocks.store.get("inventory.v2")).toMatchObject({ failedCookingDishes: 1 });
    expect((mocks.store.get("farm.v2") as { inventory: object }).inventory).toEqual({});
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ userId: "cook-user", method: "stir_fry" }));
    expect(json.failedResearches).toEqual([{
      method: "stir_fry",
      ingredientIds: ["farm:wheat", "farm:milk", "farm:rice"],
      createdAt: NOW,
    }]);
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

  it("조미료는 지갑이 비어 있어도 은행 골드로 구매한다", async () => {
    mocks.store.set("character.v2", {
      class: "none",
      level: 1,
      gold: 0,
      bankedGold: 500,
    });
    mocks.selectResults.push([]);

    const response = await post({
      action: "buy_pantry",
      itemId: "pantry:salt",
      quantity: 1,
    });

    expect(response.status).toBe(200);
    expect(mocks.store.get("character.v2")).toMatchObject({
      gold: 0,
      bankedGold: 450,
    });
    expect(mocks.store.get("cooking.v2")).toMatchObject({
      kitchenItems: { "pantry:salt": 1 },
    });
  });

  it("조미료 단건 구매를 반복해도 일반 요리 작업 제한과 별도로 처리한다", async () => {
    for (let purchase = 0; purchase < 41; purchase += 1) {
      const response = await post({
        action: "buy_pantry",
        itemId: "pantry:salt",
        quantity: 1,
      });
      expect(response.status).toBe(200);
    }

    expect(mocks.store.get("cooking.v2")).toMatchObject({
      kitchenItems: { "pantry:salt": 41 },
    });
  });
});
