import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: object) => unknown) =>
      callback({}),
    ),
  },
}));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "cook-user"),
}));
vi.mock("@/lib/server/userRateLimit", () => ({
  enforceUserAndIpRateLimit: vi.fn(() => null),
}));
vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(
    async (_tx, _userId, key: string, fallback: unknown) =>
      store.has(key) ? store.get(key) : fallback,
  ),
  readSave: vi.fn(async (_tx, _userId, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(
    async (_tx, _userId, key: string, value: unknown) => {
      store.set(key, value);
    },
  ),
}));

import { GET, POST } from "./route";
import {
  cookingFoodId,
  cookingOrderReward,
  cookingOrders,
  cookingLevelXpThreshold,
  emptyCookingState,
} from "@/adventure/v2/cooking";
import { emptyFarmState } from "@/adventure/v2/farm";
import { emptyFishingStock } from "@/adventure/v2/fishingStock";
import { emptyV2SkillsState } from "@/adventure/data/v2/v2Skills";

const NOW = Date.parse("2026-08-03T09:00:00+09:00");

function request(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/v2/cooking", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seed() {
  store.clear();
  const cooking = emptyCookingState(NOW);
  const farm = emptyFarmState(NOW);
  store.set("character.v2", { class: "none", level: 1, gold: 100 });
  store.set("skills.v2", emptyV2SkillsState());
  store.set("farm.v2", farm);
  store.set("fishing-stock.v1", emptyFishingStock());
  store.set("cooking.v1", cooking);
  store.set("inventory.v2", {});
  return { cooking, farm };
}

describe("/api/v2/cooking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    seed();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("요리 화면에는 누적 획득량이 아닌 현재 보유 농장 증표를 표시한다", async () => {
    const farm = store.get("farm.v2") as ReturnType<typeof emptyFarmState>;
    store.set("farm.v2", {
      ...farm,
      stats: {
        ...farm.stats,
        reputation: 120,
        reputationSpent: 45,
      },
    });

    const response = await GET(
      new Request("http://localhost/api/v2/cooking"),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.farmReputation).toBe(75);
  });

  it("일반 조리는 계속 완성품을 인벤토리에 저장한다", async () => {
    const farm = store.get("farm.v2") as ReturnType<typeof emptyFarmState>;
    store.set("farm.v2", { ...farm, inventory: { wheat: 30 } });
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const response = await POST(
      request({ action: "cook", recipeId: "rustic_bread", quantity: 1 }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.result).toMatchObject({
      action: "cook",
      quality: "normal",
      deliveredFoodId: null,
    });
    expect(json.result.foodId).toBeTruthy();
    expect(store.get("inventory.v2")).toMatchObject({
      cookingFoods: { [json.result.foodId]: 1 },
    });
    expect(store.get("farm.v2")).toMatchObject({
      inventory: { wheat: 15 },
    });
    expect(store.get("cooking.v1")).toMatchObject({
      discoveredRecipeIds: ["rustic_bread"],
      stats: expect.objectContaining({ dishesCooked: 1, ordersCompleted: 0 }),
    });
  });

  it("달걀과 우유 목장 요리는 농장 재료를 정확히 차감한다", async () => {
    const farm = store.get("farm.v2") as ReturnType<typeof emptyFarmState>;
    const cooking = store.get("cooking.v1") as ReturnType<typeof emptyCookingState>;
    store.set("farm.v2", {
      ...farm,
      inventory: { wheat: 10, egg: 10, milk: 10, potato: 10, onion: 5 },
    });
    store.set("cooking.v1", {
      ...cooking,
      xp: cookingLevelXpThreshold(50),
    });
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const eggResponse = await POST(
      request({ action: "cook", recipeId: "country_egg_bread", quantity: 1 }),
    );
    const milkResponse = await POST(
      request({ action: "cook", recipeId: "milk_potato_soup", quantity: 1 }),
    );

    expect(eggResponse.status).toBe(200);
    expect(milkResponse.status).toBe(200);
    expect(store.get("farm.v2")).toMatchObject({
      inventory: { wheat: 2, egg: 6, milk: 4, potato: 2, onion: 1 },
    });
  });

  it("걸작 완성품을 소비하고 원재료 대신 품질 보상을 지급한다", async () => {
    const cooking = store.get("cooking.v1") as ReturnType<
      typeof emptyCookingState
    >;
    const order = cookingOrders("cook-user", cooking)[0];
    const foodId = cookingFoodId({
      recipeId: order.recipeId,
      quality: "masterpiece",
      usedRare: false,
      extended: false,
    });
    store.set("inventory.v2", { cookingFoods: { [foodId]: 1 } });
    const farmBefore = structuredClone(store.get("farm.v2"));

    const response = await POST(
      request({ action: "order", recipeId: order.recipeId, foodId }),
    );
    const json = await response.json();
    const reward = cookingOrderReward(order, "masterpiece");

    expect(response.status).toBe(200);
    expect(json.result).toMatchObject({
      action: "order",
      quality: "masterpiece",
      deliveredFoodId: foodId,
      foodId: null,
      orderRewardGold: reward.gold,
      orderRewardReputation: reward.reputation,
      orderQualityBonusPct: 50,
      earnedXp: reward.bonusXp,
    });
    expect(json.cookingFoods).toEqual({});
    expect(store.get("inventory.v2")).toMatchObject({ cookingFoods: {} });
    expect(store.get("character.v2")).toMatchObject({
      gold: 100 + reward.gold,
    });
    expect(store.get("farm.v2")).toMatchObject({
      ...(farmBefore as object),
      stats: expect.objectContaining({ reputation: reward.reputation }),
    });
    expect(store.get("cooking.v1")).toMatchObject({
      xp: reward.bonusXp,
      discoveredRecipeIds: [],
      stats: {
        dishesCooked: 0,
        ordersCompleted: 1,
        masterpiecesCooked: 0,
        rareIngredientDishes: 0,
      },
    });
  });

  it("주문과 일치하는 완성품이 없으면 원재료가 있어도 거부한다", async () => {
    const { cooking, farm } = seed();
    const order = cookingOrders("cook-user", cooking)[0];
    store.set("farm.v2", {
      ...farm,
      inventory: { wheat: 999, herb: 999, corn: 999 },
    });

    const response = await POST(
      request({ action: "order", recipeId: order.recipeId }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "cooked_food_unavailable",
    });
  });
});

describe("GET /api/v2/cooking — 농장 증표 잔액", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    seed();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("누적 획득량에서 사용량을 뺀 현재 보유 증표를 반환한다", async () => {
    const farm = store.get("farm.v2") as ReturnType<typeof emptyFarmState>;
    store.set("farm.v2", {
      ...farm,
      stats: {
        ...farm.stats,
        reputation: 120,
        reputationSpent: 45,
      },
    });

    const response = await GET(
      new Request("http://localhost/api/v2/cooking"),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.farmReputation).toBe(75);
  });
});
