import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { store, upsertSave } = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  return {
    store,
    upsertSave: vi.fn(async (_tx, _uid, key: string, value: unknown) => {
      store.set(key, value);
    }),
  };
});

vi.mock("@/lib/server/savesKv", () => ({
  lockSaveForUpdate: vi.fn(async (_tx, _uid, key: string, fallback: unknown) =>
    store.has(key) ? store.get(key) : fallback,
  ),
  upsertSave,
}));

import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import { COOKING_PUBLIC_RECIPES } from "@/adventure/v2/cooking/catalog";
import { cookingFoodId } from "@/adventure/v2/cooking/foodShared";
import { LIFE_MAJOR_PRODUCT_ID } from "@/adventure/v2/lifeMajorProducts";
import { peddlerShopItem } from "@/adventure/v2/peddlerRules";
import {
  consumePeddlerCargo,
  lockPeddlerShopGrant,
  parsePeddlerCargo,
  peddlerCargoHoldings,
} from "./cargo";

const IRON = MINING_MATERIAL_ID.iron;
const tierOne = COOKING_PUBLIC_RECIPES.find((recipe) => recipe.tier === 1)!;
const tierFive = COOKING_PUBLIC_RECIPES.find((recipe) => recipe.tier === 5)!;
const stew = cookingFoodId({ recipeId: tierOne.id, quality: "normal", originator: false, specialtyBonusPct: 0 });
const feast = cookingFoodId({ recipeId: tierFive.id, quality: "careful", originator: false, specialtyBonusPct: 0 });

afterEach(() => {
  store.clear();
  upsertSave.mockClear();
});

describe("행상 짐 해석", () => {
  it("품목 id와 수량을 적재 점수가 붙은 줄로 바꾼다", () => {
    const lines = parsePeddlerCargo({
      [`material:${IRON}`]: 100,
      "farm:milk": 3,
      "fish:catch_special": 2,
      [`dish:${stew}`]: 1,
      [`dish:${feast}`]: 1,
    });
    expect(lines?.map((line) => [line.source, line.sourceItemId, line.points, line.quantity])).toEqual([
      ["material", IRON, 2, 100],
      ["farm", "milk", 40, 3],
      ["fish", "catch_special", 120, 2],
      ["dish", stew, 200, 1],
      ["dish", feast, 1700, 1],
    ]);
  });

  it("실을 수 없는 품목, 잘못된 수량, 빈 짐은 거절한다", () => {
    expect(parsePeddlerCargo({ [`material:${LIFE_MAJOR_PRODUCT_ID.mining}`]: 1 })).toBeNull();
    expect(parsePeddlerCargo({ "farm:compound_feed": 1 })).toBeNull();
    expect(parsePeddlerCargo({ "dish:unknown": 1 })).toBeNull();
    expect(parsePeddlerCargo({ "farm:milk": 0 })).toBeNull();
    expect(parsePeddlerCargo({ "farm:milk": 1.5 })).toBeNull();
    expect(parsePeddlerCargo({})).toBeNull();
    expect(parsePeddlerCargo(["farm:milk"])).toBeNull();
    expect(parsePeddlerCargo(null)).toBeNull();
  });

  it("품목은 30종까지만 받는다", () => {
    const many = Object.fromEntries(
      COOKING_PUBLIC_RECIPES.slice(0, 31).map((recipe) => [
        `dish:${cookingFoodId({ recipeId: recipe.id, quality: "normal", originator: false, specialtyBonusPct: 0 })}`,
        1,
      ]),
    );
    expect(parsePeddlerCargo(many)).toBeNull();
  });
});

describe("행상 보유 품목", () => {
  it("가진 품목만 보유량과 함께 돌려준다", () => {
    const holdings = peddlerCargoHoldings({
      material: { materials: { [IRON]: 640, [LIFE_MAJOR_PRODUCT_ID.mining]: 9 } },
      farm: { inventory: { milk: 12, compound_feed: 30, golden_egg: 2 } },
      fish: { items: { catch_legendary: 1 } },
      dish: { cookingFoods: { [stew]: 4, broken: 3 } },
    });
    expect(holdings.map((item) => [item.id, item.group, item.points, item.held])).toEqual([
      [`material:${IRON}`, "ore", 2, 640],
      ["farm:milk", "ranch", 40, 12],
      ["fish:catch_legendary", "fish", 400, 1],
      [`dish:${stew}`, "dish", 200, 4],
    ]);
    expect(holdings[0].name).toBe("철광석");
  });
});

describe("행상 짐 차감", () => {
  it("네 보관 세이브에서 수량만큼 뺀다", async () => {
    store.set("character.v2", { gold: 7, materials: { [IRON]: 100 } });
    store.set("farm.v2", { plots: [], inventory: { milk: 5, egg: 9 } });
    store.set("fishing-stock.v1", { version: 1, items: { catch_special: 2 }, daily: { date: "x", awarded: {} } });
    store.set("inventory.v2", { cookingFoods: { [stew]: 2 }, other: 1 });
    const lines = parsePeddlerCargo({
      [`material:${IRON}`]: 100,
      "farm:milk": 3,
      "fish:catch_special": 1,
      [`dish:${stew}`]: 2,
    })!;
    await expect(consumePeddlerCargo({} as never, "u", lines)).resolves.toBe(true);
    expect(store.get("character.v2")).toEqual({ gold: 7, materials: {} });
    expect(store.get("farm.v2")).toEqual({ plots: [], inventory: { milk: 2, egg: 9 } });
    expect(store.get("fishing-stock.v1")).toEqual({
      version: 1,
      items: { catch_special: 1 },
      daily: { date: "x", awarded: {} },
    });
    expect(store.get("inventory.v2")).toEqual({ cookingFoods: {}, other: 1 });
  });

  it("하나라도 모자라면 아무것도 빼지 않는다", async () => {
    store.set("character.v2", { materials: { [IRON]: 100 } });
    store.set("farm.v2", { inventory: { milk: 2 } });
    const lines = parsePeddlerCargo({ [`material:${IRON}`]: 100, "farm:milk": 3 })!;
    await expect(consumePeddlerCargo({} as never, "u", lines)).resolves.toBe(false);
    expect(upsertSave).not.toHaveBeenCalled();
  });
});

describe("행상 교환 품목 지급", () => {
  it("재료는 캐릭터 재료에, 사료는 농장 창고에 넣는다", async () => {
    store.set("character.v2", { materials: { [LIFE_MAJOR_PRODUCT_ID.mining]: 1 } });
    store.set("farm.v2", { inventory: { compound_feed: 5 } });
    await (await lockPeddlerShopGrant({} as never, "u", peddlerShopItem("master_alloy")!, 3))();
    await (await lockPeddlerShopGrant({} as never, "u", peddlerShopItem("compound_feed")!, 2))();
    expect(store.get("character.v2")).toEqual({ materials: { [LIFE_MAJOR_PRODUCT_ID.mining]: 4 } });
    expect(store.get("farm.v2")).toEqual({ inventory: { compound_feed: 25 } });
  });
});
