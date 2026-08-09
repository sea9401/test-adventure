import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, grantedTitles } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  grantedTitles: [] as string[],
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-life-workshop"),
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
  readSave: vi.fn(async (_dbOrTx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));
vi.mock("@/lib/server/grantTitle", () => ({
  grantTitleIfMissingInTx: vi.fn(
    async (_tx: unknown, _uid: string, titleId: string) => {
      grantedTitles.push(titleId);
      return true;
    },
  ),
}));

import { GET, POST } from "@/app/api/v2/life-workshop/route";
import {
  LIFE_PROCESSED_MATERIAL_ID,
  LIFE_RESPECIALIZATION_BASE_COST,
  LIFE_WORKSHOP_SAVE_KEY,
} from "@/adventure/v2/lifeWorkshop";
import { WOODCUTTING_MATERIAL_ID } from "@/adventure/data/v2/woodcuttingSpots";
import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import { WOODCUTTING_LOG_KEY } from "@/adventure/v2/woodcuttingSession";
import { resetUserRateLimitForTests } from "@/lib/server/userRateLimit";
import {
  FARM_CROP_REQUIRED_SKILL_ID,
  FARM_SAVE_KEY,
  emptyFarmState,
} from "@/adventure/v2/farm";

function request(body: unknown) {
  return new Request("http://test.local/api/v2/life-workshop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.spyOn(Math, "random").mockReturnValue(0.99);
});

afterEach(() => {
  store.clear();
  grantedTitles.length = 0;
  resetUserRateLimitForTests();
  vi.restoreAllMocks();
});

describe("life workshop route", () => {
  it("가공 시 원재료를 차감하고 완성품·도감·첫 칭호를 기록한다", async () => {
    store.set("character.v2", {
      materials: { [WOODCUTTING_MATERIAL_ID.pine]: 20 },
    });

    const response = await POST(request({
      action: "process",
      recipeId: "pine_softwood",
      batches: 2,
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.result).toMatchObject({
      action: "process",
      outputId: LIFE_PROCESSED_MATERIAL_ID.softwood,
      produced: 2,
      bonusCount: 0,
    });
    expect(json.materials).toEqual({
      [LIFE_PROCESSED_MATERIAL_ID.softwood]: 2,
    });
    expect(store.get(LIFE_WORKSHOP_SAVE_KEY)).toMatchObject({
      processing: {
        batches: 2,
        greatSuccesses: 0,
        discoveredMaterialIds: [LIFE_PROCESSED_MATERIAL_ID.softwood],
      },
    });
    expect(grantedTitles).toContain("life_processing_first");
  });

  it("도구 승급 시 가공품과 채광 부산물을 함께 소모한다", async () => {
    store.set("character.v2", {
      materials: {
        [LIFE_PROCESSED_MATERIAL_ID.softwood]: 2,
        [LIFE_PROCESSED_MATERIAL_ID.basicIngot]: 2,
        [MINING_MATERIAL_ID.stone]: 3,
      },
    });
    store.set(WOODCUTTING_LOG_KEY, { cuts: 1_000, xp: 1_000_000 });

    const response = await POST(request({
      action: "upgrade_tool",
      activity: "woodcutting",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.state.tools.woodcutting).toBe(1);
    expect(json.materials).toEqual({});
  });

  it("첫 전문화는 무료이고 변경부터 골드를 사용한다", async () => {
    store.set("character.v2", {
      gold: 10_005_000,
      bankedGold: 0,
      materials: {},
    });
    store.set(WOODCUTTING_LOG_KEY, { cuts: 1_000, xp: 1_000_000 });

    const first = await POST(request({
      action: "specialize",
      activity: "woodcutting",
      specializationId: "logger",
    }));
    expect(first.status).toBe(200);
    expect((await first.json()).gold).toBe(10_005_000);

    const changed = await POST(request({
      action: "specialize",
      activity: "woodcutting",
      specializationId: "woodworker",
    }));
    const changedJson = await changed.json();
    expect(changed.status).toBe(200);
    expect(changedJson.gold).toBe(5_000);
    expect(changedJson.state).toMatchObject({
      specializations: { woodcutting: "woodworker" },
      respecializations: { woodcutting: 1 },
    });
  });

  it("전문화 변경 비용이 1천만 골드보다 부족하면 상태와 골드를 보존한다", async () => {
    store.set("character.v2", {
      gold: LIFE_RESPECIALIZATION_BASE_COST - 1,
      bankedGold: 0,
      materials: {},
    });
    store.set(LIFE_WORKSHOP_SAVE_KEY, {
      specializations: { woodcutting: "logger" },
    });
    store.set(WOODCUTTING_LOG_KEY, { cuts: 1_000, xp: 1_000_000 });

    const response = await POST(
      request({
        action: "specialize",
        activity: "woodcutting",
        specializationId: "woodworker",
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "not_enough_gold",
      cost: LIFE_RESPECIALIZATION_BASE_COST,
    });
    expect(store.get("character.v2")).toMatchObject({
      gold: LIFE_RESPECIALIZATION_BASE_COST - 1,
    });
    expect(store.get(LIFE_WORKSHOP_SAVE_KEY)).toEqual({
      specializations: { woodcutting: "logger" },
    });
  });

  it("GET은 저장된 작업장 상태와 현재 재료를 함께 반환한다", async () => {
    store.set("character.v2", {
      gold: 123,
      materials: { [LIFE_PROCESSED_MATERIAL_ID.arcaneAlloy]: 4 },
    });
    store.set(LIFE_WORKSHOP_SAVE_KEY, {
      tools: { mining: 2 },
      processing: {
        batches: 7,
        discoveredMaterialIds: [LIFE_PROCESSED_MATERIAL_ID.arcaneAlloy],
      },
    });

    const response = await GET();
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      gold: 123,
      materials: { [LIFE_PROCESSED_MATERIAL_ID.arcaneAlloy]: 4 },
      state: { tools: { woodcutting: 0, mining: 2 }, processing: { batches: 7 } },
    });
    expect(json.craftingRecipes.every((recipe: { kind: string }) => recipe.kind === "aid")).toBe(true);
    expect(json.craftingRecipes.some((recipe: { id: string }) => recipe.id === "fishing_trophy_wall")).toBe(false);
  });

  it("GET은 농장 재료와 제작 숙련도로 배합 사료 제작 가능량을 계산한다", async () => {
    store.set(FARM_SAVE_KEY, {
      ...emptyFarmState(1_000),
      inventory: { wheat: 8, corn: 6, herb: 2, compound_feed: 7 },
    });
    store.set("skills.v2", { learned: [FARM_CROP_REQUIRED_SKILL_ID] });
    store.set(LIFE_WORKSHOP_SAVE_KEY, {
      crafting: { craftCounts: { compound_feed: 1 } },
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ranchCraftingRecipe).toMatchObject({
      id: "compound_feed",
      outputAmount: 5,
      unlocked: true,
      craftCount: 1,
      masteryStage: 1,
      batchLimit: 5,
      maxCraftable: 2,
      ownedFeed: 7,
      ingredientBalances: { wheat: 8, corn: 6, herb: 2 },
    });
  });

  it("비공개 숙소 가구는 직접 제작 요청도 거절한다", async () => {
    const response = await POST(request({
      action: "craft",
      recipeId: "pine_work_shelf",
      quantity: 1,
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "bad_craft_recipe",
    });
  });
});
