import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ key: string; value: unknown }>,
  ensureUser: vi.fn(),
}));

vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: mocks.ensureUser,
}));
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => mocks.rows),
      })),
    })),
  },
}));

import { GET } from "./route";
import { emptyFarmState } from "@/adventure/v2/farm";
import { emptyFishingStock } from "@/adventure/v2/fishingStock";
import { emptyCookingState } from "@/adventure/v2/cooking/state";
import { cookingFoodId } from "@/adventure/v2/cooking/foodShared";

describe("GET /api/v2/me/inventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureUser.mockResolvedValue("u-test");
    mocks.rows = [];
  });

  it("inventory.v2의 숙련 증서 수량을 노출한다", async () => {
    mocks.rows = [
      { key: "character.v2", value: {} },
      { key: "inventory.v2", value: { masteryCertificates: 10 } },
    ];

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      masteryCertificates: 10,
    });
  });

  it("손상된 음수 증서 수량은 0으로 정규화한다", async () => {
    mocks.rows = [
      { key: "inventory.v2", value: { masteryCertificates: -7.5 } },
    ];

    const response = await GET();

    expect(await response.json()).toMatchObject({ masteryCertificates: 0 });
  });

  it("일반 재료와 네 종류 생활 저장소의 거래 가능 보유량을 함께 노출한다", async () => {
    mocks.rows = [
      {
        key: "character.v2",
        value: { materials: { v2_iron_ore: 4 } },
      },
      { key: "inventory.v2", value: {} },
      {
        key: "farm.v2",
        value: {
          ...emptyFarmState(),
          seeds: { wheat: 1 },
          inventory: { golden_wheat: 2, compound_feed: 99 },
        },
      },
      {
        key: "fishing-stock.v1",
        value: {
          ...emptyFishingStock(),
          items: { catch_common: 3 },
        },
      },
      {
        key: "cooking.v2",
        value: {
          ...emptyCookingState(),
          kitchenItems: { "processed:flour": 5 },
        },
      },
    ];

    const response = await GET();

    expect(await response.json()).toMatchObject({
      marketplaceMaterials: {
        v2_iron_ore: 4,
        "farm_seed:wheat": 1,
        "farm_item:golden_wheat": 2,
        "fishing_catch:catch_common": 3,
        "cooking_kitchen:processed:flour": 5,
      },
    });
  });

  it("보유한 완성 음식의 표시 정보만 반환한다", async () => {
    const foodId = cookingFoodId({
      recipeId: "rustic_bread",
      quality: "normal",
      originator: false,
      specialtyBonusPct: 0,
    });
    mocks.rows = [{
      key: "inventory.v2",
      value: { cookingFoods: { [foodId]: 2, "food2:unknown:normal:o0:s0": 9 } },
    }];

    const response = await GET();
    const json = await response.json();

    expect(json.cookingFoods).toEqual({ [foodId]: 2 });
    expect(json.cookingFoodDefinitions[foodId]).toMatchObject({
      name: "투박한 밀빵 (일반)",
      recipe: { id: "rustic_bread", name: "투박한 밀빵" },
    });
    expect(JSON.stringify(json)).not.toContain("potato_stew");
    expect(JSON.stringify(json)).not.toContain("감자 양파 스튜");
  });
});
