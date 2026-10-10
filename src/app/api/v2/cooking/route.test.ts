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
import { lifeMajorStageXp } from "@/adventure/v2/lifeMajor";
import { emptyCookingState, cookingLevelXpThreshold } from "@/adventure/v2/cooking/state";
import { emptyFarmState } from "@/adventure/v2/farm";
import { emptyFishingStock } from "@/adventure/v2/fishingStock";
import { emptyV2SkillsState } from "@/adventure/data/v2/v2Skills";
import { COOKING_SECRET_RECIPE_BY_ID, findSecretRecipe } from "@/lib/server/cooking/recipes";
import { cookingResearchAttemptKey } from "@/adventure/v2/cooking/researchKey";
import { COOKING_METHOD_NAMES, type CookingIngredientId, type CookingMethod } from "@/adventure/v2/cooking/types";
import { COOKING_PUBLIC_RECIPES } from "@/adventure/v2/cooking/catalog";
import { emptyLifeWorkshopState } from "@/adventure/v2/lifeWorkshop";
import { emptyCodexMasteryProgress } from "@/adventure/data/v2/codexMastery";
import { CODEX_MASTERY_CATALOG } from "@/adventure/data/v2/codexMasteryProductionCatalog";
import { emptyCodexMasterySummary } from "@/lib/server/codexMasteryRepository";
import { createCodexMasteryBatchRecorder } from "@/lib/server/codexMasteryService";
import { recordCodexMasteryGameplayBatch } from "@/lib/server/codexMasteryGameplay";
import { GUILD_DINING_USER_SAVE_KEY } from "@/adventure/data/v2/guildDining";
import { kstWeekMondayKey } from "@/lib/kst";

const { festivalBonus } = vi.hoisted(() => ({
  festivalBonus: vi.fn(),
}));
vi.mock("@/adventure/v2/lifeFestival", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/adventure/v2/lifeFestival")>()),
  lifeFestivalBonus: festivalBonus,
}));
beforeEach(() => {
  festivalBonus.mockReset();
  festivalBonus.mockReturnValue({ themeId: null, chancePct: 0, xpPct: 0 });
});

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

function seedGrandFeast() {
  mocks.store.set(GUILD_DINING_USER_SAVE_KEY, {
    version: 1,
    weekKey: kstWeekMondayKey(new Date(NOW)),
    guildId: 7,
    contributionPoints: 0,
    mealsUsed: 1,
    activeEffect: {
      menuId: "guild_grand_feast",
      kind: "all_xp",
      bonusPct: 60,
      lifeBonusPct: 20,
      expiresAt: NOW + 60 * 60 * 1000,
      roundingRemainder: 0,
    },
  });
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

  it("실패 기록은 최근 100개만 보여주되 중복 판정용 키는 오래된 실패까지 모두 내려준다", async () => {
    const farmIds = ["wheat", "milk", "rice", "corn", "potato", "tomato", "onion", "herb"];
    const rows: { method: CookingMethod; ingredientIds: CookingIngredientId[]; createdAt: Date }[] = [];
    for (const method of Object.keys(COOKING_METHOD_NAMES) as CookingMethod[]) {
      for (let a = 0; a < farmIds.length; a += 1) {
        for (let b = a + 1; b < farmIds.length; b += 1) {
          const ingredientIds = [`farm:${farmIds[a]}`, `farm:${farmIds[b]}`] as CookingIngredientId[];
          const recipe = findSecretRecipe(method, ingredientIds);
          if (recipe && recipe.discovery !== "basic") continue;
          rows.push({ method, ingredientIds, createdAt: new Date(NOW - rows.length * 1_000) });
        }
      }
    }
    expect(rows.length).toBeGreaterThan(150);
    mocks.selectResults.push([], rows);

    const response = await GET(new Request("http://localhost/api/v2/cooking"));
    const json = await response.json();

    expect(json.failedResearches).toHaveLength(100);
    expect(json.failedResearchKeys).toHaveLength(rows.length);
    const oldest = rows.at(-1)!;
    expect(json.failedResearchKeys).toContain(
      cookingResearchAttemptKey(oldest.method, oldest.ingredientIds),
    );
  });

  it("과거 발견 등급 기록이 있는 구운 옥수수도 준비 세트를 사용해 완성한다", async () => {
    const farm = emptyFarmState(NOW);
    mocks.store.set("farm.v2", { ...farm, inventory: { corn: 4 } });
    mocks.store.set("cooking.v2", {
      ...emptyCookingState(NOW),
      kitchenItems: { "pantry:oil": 152 },
    });
    const workshop = emptyLifeWorkshopState();
    mocks.store.set("life-workshop.v1", {
      ...workshop,
      crafting: { ...workshop.crafting, balances: { cooking_prep_set: 40 } },
    });
    let progress: ReturnType<typeof emptyCodexMasteryProgress> = {
      ...emptyCodexMasteryProgress("cooking", "grilled_corn"),
      count: 1,
      currentTier: "discovered",
      scoreMilli: 4_545,
    };
    let summary = emptyCodexMasterySummary();
    summary.totalScoreMilli = 4_545;
    summary.categoryScoreMilli.cooking = 4_545;
    summary.scoredCategoryCount = 1;
    const recorder = createCodexMasteryBatchRecorder({
      async lockBatch() { return { summary, progress: [progress] }; },
      async saveBatch(next) {
        summary = next.summary;
        progress = next.progress[0];
      },
    }, CODEX_MASTERY_CATALOG);
    vi.mocked(recordCodexMasteryGameplayBatch).mockImplementationOnce(
      async (_tx, userId, events, now) => recorder.recordBatch(events.map((event) => ({
        userId,
        category: "cooking" as const,
        entryId: event.entryId,
        mutation: { amount: event.amount, discovered: true },
        source: "cooking.complete" as const,
      })), { recordingEnabled: true, sealsEnabled: false, trophiesEnabled: false }, now),
    );
    vi.spyOn(Math, "random").mockReturnValue(0.05);

    const response = await post({ action: "craft", recipeId: "grilled_corn", quantity: 1, usePrepSet: true });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.cookingFoods["food2:grilled_corn:masterpiece:o0:s0"]).toBe(1);
    expect(mocks.store.get("farm.v2")).toMatchObject({ inventory: { corn: 2 } });
    expect(mocks.store.get("cooking.v2")).toMatchObject({ kitchenItems: { "pantry:oil": 151 } });
    expect(json.cookingPrepSets).toBe(39);
    expect(progress).toMatchObject({ count: 2, currentTier: "bronze", scoreMilli: 20_202 });
    expect(summary).toMatchObject({ totalScoreMilli: 20_202, stageCounts: { bronze: 1 } });
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
      qualityCounts: { normal: 0, careful: 0, masterpiece: 1 },
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

  it("일괄 조리한 음식마다 품질을 독립적으로 판정한다", async () => {
    const recipe = COOKING_SECRET_RECIPE_BY_ID.get("rustic_bread")!;
    const farm = emptyFarmState(NOW);
    const cooking = emptyCookingState(NOW);
    mocks.store.set("character.v2", {
      class: "survivor",
      level: 35,
      specChoice: "masterchef",
      gold: 10_000,
      name: "테스터",
    });
    mocks.store.set("skills.v2", {
      learned: ["v2c_masterchef_heatcontrol"],
      equipped: ["v2c_masterchef_heatcontrol"],
    });
    mocks.store.set("farm.v2", { ...farm, inventory: { wheat: 30 } });
    mocks.store.set("cooking.v2", {
      ...cooking,
      kitchenItems: { "pantry:yeast": 30 },
    });
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.01)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.99);

    const response = await post({
      action: "craft",
      recipeId: recipe.id,
      quantity: 3,
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.result).toMatchObject({
      recipeId: recipe.id,
      quantity: 3,
      qualityCounts: { normal: 1, careful: 1, masterpiece: 1 },
    });
    expect(json.result).not.toHaveProperty("quality");
    expect(json.result).not.toHaveProperty("foodId");
    expect(json.cookingFoods).toMatchObject({
      [`food2:${recipe.id}:normal:o0:s0`]: 1,
      [`food2:${recipe.id}:careful:o0:s0`]: 1,
      [`food2:${recipe.id}:masterpiece:o0:s0`]: 1,
    });
    expect(json.cooking.stats).toMatchObject({
      dishesCooked: 3,
      masterpiecesCooked: 1,
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

  it("GET은 최초 발견자의 현재 권위 닉네임을 표시한다", async () => {
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
        actorName: "바뀐 닉네임",
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

  it("길드 대연회 생활 경험치 보너스를 연구 실패 경험치에 더한다", async () => {
    const cooking = emptyCookingState(NOW);
    mocks.store.set("cooking.v2", { ...cooking, xp: cookingLevelXpThreshold(10) });
    const farm = emptyFarmState(NOW);
    mocks.store.set("farm.v2", { ...farm, inventory: { wheat: 1, milk: 1, rice: 1 } });
    seedGrandFeast();
    mocks.selectResults.push([], [], []);

    const response = await post({
      action: "research",
      method: "stir_fry",
      ingredientIds: ["farm:wheat", "farm:milk", "farm:rice"],
    });
    const json = await response.json();

    // 기본 6 + 대연회 20%(1.2 → 1, 나머지는 다음 획득으로 이월) = 7
    expect(response.status).toBe(200);
    expect(json.result).toMatchObject({ outcome: "failure", earnedXp: 7 });
    expect((mocks.store.get("cooking.v2") as { xp: number }).xp).toBe(cookingLevelXpThreshold(10) + 7);
  });

  it("길드 대연회 생활 경험치 보너스를 레시피 발견 경험치에 더한다", async () => {
    const recipe = COOKING_SECRET_RECIPE_BY_ID.get("tomato_salad")!;
    const cooking = emptyCookingState(NOW);
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
    seedGrandFeast();
    mocks.selectResults.push([], [], []);
    mocks.insertResults.push([]);

    const response = await post({
      action: "research",
      method: recipe.method,
      ingredientIds: recipe.ingredients.map((entry) => entry.id),
    });
    const json = await response.json();
    const expectedXp = recipe.researchXp + Math.floor((recipe.researchXp * 20) / 100);

    expect(response.status).toBe(200);
    expect(json.result).toMatchObject({ outcome: "success", earnedXp: expectedXp });
    expect((mocks.store.get("cooking.v2") as { xp: number }).xp).toBe(cookingLevelXpThreshold(10) + expectedXp);
  });

  it("길드 대연회 생활 경험치 보너스를 요리 제작 경험치에 더한다", async () => {
    const recipe = COOKING_SECRET_RECIPE_BY_ID.get("rustic_bread")!;
    const farm = emptyFarmState(NOW);
    const cooking = emptyCookingState(NOW);
    mocks.store.set("farm.v2", { ...farm, inventory: { wheat: 30 } });
    mocks.store.set("cooking.v2", { ...cooking, kitchenItems: { "pantry:yeast": 30 } });
    seedGrandFeast();
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const response = await post({ action: "craft", recipeId: recipe.id, quantity: 3 });
    const json = await response.json();
    const baseXp = recipe.craftXp * 3;
    const expectedXp = baseXp + Math.floor((baseXp * 20) / 100);

    expect(response.status).toBe(200);
    expect(json.result).toMatchObject({ earnedXp: expectedXp });
    expect((mocks.store.get("cooking.v2") as { xp: number }).xp).toBe(expectedXp);
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
  it("미식제 주간에는 걸작 확률 5%p와 요리 경험치 25%를 더한다", async () => {
    const recipe = COOKING_SECRET_RECIPE_BY_ID.get("rustic_bread")!;
    const craft = async () => {
      seed();
      mocks.store.set("farm.v2", { ...emptyFarmState(NOW), inventory: { wheat: 10 } });
      mocks.store.set("cooking.v2", {
        ...emptyCookingState(NOW),
        kitchenItems: { "pantry:yeast": 10 },
      });
      mocks.rateLimitCounts.clear();
      vi.spyOn(Math, "random").mockReturnValue(0.04);
      const response = await post({ action: "craft", recipeId: recipe.id, quantity: 1 });
      expect(response.status).toBe(200);
      return (await response.json()).result;
    };
    const base = await craft();
    festivalBonus.mockReturnValue({ themeId: "feast", chancePct: 5, xpPct: 25 });
    const boosted = await craft();

    expect(festivalBonus).toHaveBeenCalledWith("cooking", new Date(NOW));
    expect(base.quality).not.toBe("masterpiece");
    expect(boosted.quality).toBe("masterpiece");
    expect(boosted.earnedXp).toBeGreaterThan(base.earnedXp);
  });

  describe("생활 전공", () => {
    const T100 = () => cookingLevelXpThreshold(100);

    it("조리 — 요리 주전공 단계만큼 걸작 확률을 더하고 넘친 경험치를 명장 경험치로 쌓는다", async () => {
      const recipe = COOKING_SECRET_RECIPE_BY_ID.get("rustic_bread")!;
      const craft = async (lifeMajor: unknown) => {
        seed();
        mocks.store.set("farm.v2", { ...emptyFarmState(NOW), inventory: { wheat: 10 } });
        mocks.store.set("cooking.v2", {
          ...emptyCookingState(NOW),
          xp: T100(),
          discoveredRecipeIds: [recipe.id],
          kitchenItems: { "pantry:yeast": 10 },
        });
        if (lifeMajor) mocks.store.set("life-major.v1", lifeMajor);
        mocks.rateLimitCounts.clear();
        // Lv.100 레벨 보너스로 걸작 5% → 주전공 5단계면 10%. 0.07 은 그 사이.
        vi.spyOn(Math, "random").mockReturnValue(0.07);
        const response = await post({ action: "craft", recipeId: recipe.id, quantity: 1 });
        expect(response.status).toBe(200);
        return response.json();
      };
      const base = await craft(null);
      const stage5 = lifeMajorStageXp("cooking", 5);
      const boosted = await craft({ major: "cooking", masteryXp: { cooking: stage5 } });

      expect(base.result.quality).not.toBe("masterpiece");
      expect(boosted.result.quality).toBe("masterpiece");
      expect(boosted.lifeMajor).toEqual({ masteryXpGained: boosted.result.earnedXp, masterProduct: null });
      expect(mocks.store.get("life-major.v1")).toMatchObject({
        masteryXp: { cooking: stage5 + boosted.result.earnedXp },
      });
    });

    it("연구 — Lv.100에서 얻은 연구 경험치도 명장 경험치로 쌓는다", async () => {
      const recipe = COOKING_SECRET_RECIPE_BY_ID.get("tomato_salad")!;
      const farmItems: Record<string, number> = {};
      const kitchenItems: Record<string, number> = {};
      for (const ingredient of recipe.ingredients) {
        const [kind, id] = ingredient.id.split(":");
        if (kind === "farm") farmItems[id] = 1;
        else kitchenItems[ingredient.id] = 1;
      }
      mocks.store.set("farm.v2", { ...emptyFarmState(NOW), inventory: farmItems });
      mocks.store.set("cooking.v2", { ...emptyCookingState(NOW), xp: T100(), kitchenItems });
      mocks.store.set("life-major.v1", { major: "cooking" });
      mocks.selectResults.push([], []);
      mocks.insertResults.push([{ recipeId: recipe.id }]);

      const json = await (await post({
        action: "research",
        method: recipe.method,
        ingredientIds: recipe.ingredients.map((entry) => entry.id),
      })).json();

      expect(json.result).toMatchObject({ outcome: "success" });
      expect(json.lifeMajor.masteryXpGained).toBe(json.result.earnedXp);
      expect(mocks.store.get("life-major.v1")).toMatchObject({ masteryXp: { cooking: json.result.earnedXp } });
    });
  });


  describe("명장 요리 만들기", () => {
    const recipe = COOKING_PUBLIC_RECIPES.find((entry) => entry.field !== "seafood")!;
    const masterpiece = `food2:${recipe.id}:masterpiece:o1:s2`;
    const signature = `food2:${recipe.id}:signature:o1:s2`;
    const setup = (lifeMajor: unknown, crop = 1, foods: Record<string, number> = { [masterpiece]: 2 }) => {
      mocks.store.set("life-major.v1", lifeMajor);
      mocks.store.set("character.v2", { class: "none", level: 1, gold: 0, name: "테스터", materials: { v2_master_crop: crop } });
      mocks.store.set("inventory.v2", { cookingFoods: foods });
    };
    const major3 = () => ({ major: "cooking", masteryXp: { cooking: lifeMajorStageXp("cooking", 3) } });

    it("걸작 1개와 명장 작물 1개로 같은 레시피의 명장 요리를 만든다", async () => {
      setup(major3());
      const response = await post({ action: "signature", foodId: masterpiece });
      const json = await response.json();
      expect(response.status).toBe(200);
      expect(json.result).toMatchObject({ action: "signature", foodId: signature });
      expect(mocks.store.get("inventory.v2")).toMatchObject({ cookingFoods: { [masterpiece]: 1, [signature]: 1 } });
      expect((mocks.store.get("character.v2") as { materials: Record<string, number> }).materials.v2_master_crop).toBeUndefined();
      expect(json.signature).toMatchObject({ unlocked: true, stage: 3, requiredStage: 3, products: { crop: 0, catch: 0 } });
    });

    it.each([
      ["주전공 2단계", { major: "cooking", masteryXp: { cooking: lifeMajorStageXp("cooking", 2) } }, "signature_locked"],
      ["부전공", { major: "farming", minor: "cooking", masteryXp: { cooking: lifeMajorStageXp("cooking", 9) } }, "signature_locked"],
    ])("%s 이면 409 %s", async (_label, lifeMajor, error) => {
      setup(lifeMajor);
      const response = await post({ action: "signature", foodId: masterpiece });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error });
      expect(mocks.store.get("inventory.v2")).toEqual({ cookingFoods: { [masterpiece]: 2 } });
    });

    it("걸작이 아니거나 보유하지 않았거나 산물이 없으면 거절한다", async () => {
      setup(major3(), 1, { [`food2:${recipe.id}:careful:o0:s0`]: 1 });
      expect(await (await post({ action: "signature", foodId: `food2:${recipe.id}:careful:o0:s0` })).json()).toMatchObject({ error: "not_masterpiece" });
      setup(major3(), 1, {});
      expect(await (await post({ action: "signature", foodId: masterpiece })).json()).toMatchObject({ error: "cooked_food_unavailable" });
      setup(major3(), 0);
      const response = await post({ action: "signature", foodId: masterpiece });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: "not_enough_master_product" });
    });

    it("조회 응답은 전공이 아니면 잠긴 상태로 알려 준다", async () => {
      mocks.store.set("life-major.v1", { major: "farming" });
      const json = await (await GET(new Request("http://localhost/api/v2/cooking"))).json();
      expect(json.signature).toMatchObject({ unlocked: false, requiredStage: 3 });
    });
  });

});
