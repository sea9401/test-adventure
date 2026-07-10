import { describe, it, expect } from "vitest";
import {
  FISHING_SEED_POUCH_BASE_PRICE,
  FISHING_SEED_POUCH_DAILY_LIMIT,
  FISHING_SEED_POUCH_ITEM_ID,
  FISHING_SHOP_CONSUMABLES,
  FISHING_SHOP_TITLES,
  fishingSeedPouchPriceForPurchase,
  fishingSeedPouchView,
  fishingShopConsumablePriceFor,
  fishingShopEntries,
  fishingShopPriceFor,
  parseFishingShopState,
  recordFishingShopPurchase,
} from "./fishingShop";
import { FARM_FISHING_SHOP_SEED_REWARD } from "./farm";
import {
  FISHING_LURE_IDS,
  FISHING_LURES,
  FISHING_ROD_IDS,
  FISHING_RODS,
  fishingGearPrice,
} from "./fishingProgression";
import { TITLES } from "@/adventure/data/titles";

describe("낚시 코인 상점 카탈로그", () => {
  it("모든 품목이 titles.ts 에 정의되고 category 가 fishing", () => {
    for (const t of FISHING_SHOP_TITLES) {
      const def = TITLES[t.titleId];
      expect(def, t.titleId).toBeDefined();
      expect(def.category).toBe("fishing");
    }
  });

  it("가격은 양수이고 오름차순", () => {
    let prev = 0;
    for (const t of FISHING_SHOP_TITLES) {
      expect(t.price).toBeGreaterThan(0);
      expect(t.price).toBeGreaterThan(prev);
      prev = t.price;
    }
  });

  it("fishingShopPriceFor — 등재/미등재", () => {
    expect(fishingShopPriceFor("fishing_taegong")).toBe(3000);
    expect(fishingShopPriceFor("not_a_title")).toBeUndefined();
    // 은퇴 칭호는 상점 미등재(구매 불가)
    expect(fishingShopPriceFor("fishing_deepsea")).toBeUndefined();
    expect(fishingShopPriceFor("fishing_dawnangler")).toBeUndefined();
    expect(fishingShopPriceFor("fishing_tidereader")).toBeUndefined();
    expect(fishingShopPriceFor("fishing_specialguest")).toBeUndefined();
  });

  it("fishingShopEntries — 이름·설명·가격 합본, 카탈로그와 동수", () => {
    const entries = fishingShopEntries();
    expect(entries).toHaveLength(FISHING_SHOP_TITLES.length);
    expect(entries).toHaveLength(3);
    const taegong = entries.find((e) => e.titleId === "fishing_taegong");
    expect(taegong?.name).toBe("강태공");
    expect(taegong?.price).toBe(3000);
    expect(taegong?.description.length).toBeGreaterThan(0);
  });

  it("소비품에 스태미나 회복약과 농장 씨앗 주머니를 둔다", () => {
    expect(FISHING_SHOP_CONSUMABLES.map((item) => item.itemId)).toEqual([
      "stamina_potion",
      FISHING_SEED_POUCH_ITEM_ID,
    ]);
    expect(fishingShopConsumablePriceFor("stamina_potion")).toBe(200);
    expect(fishingShopConsumablePriceFor(FISHING_SEED_POUCH_ITEM_ID)).toBe(
      FISHING_SEED_POUCH_BASE_PRICE,
    );
    expect(fishingShopConsumablePriceFor("not_an_item")).toBeUndefined();
  });

  it("씨앗 주머니는 하루 3개까지 80→160→320 가격으로 오른다", () => {
    expect(FISHING_SEED_POUCH_DAILY_LIMIT).toBe(3);
    expect(fishingSeedPouchPriceForPurchase(0)).toBe(80);
    expect(fishingSeedPouchPriceForPurchase(1)).toBe(160);
    expect(fishingSeedPouchPriceForPurchase(2)).toBe(320);
    expect(fishingSeedPouchPriceForPurchase(3)).toBeUndefined();
  });

  it("씨앗 주머니 구매 횟수는 KST 일자 키가 바뀌면 리셋된다", () => {
    const today = parseFishingShopState({}, "2026-07-10");
    const boughtOnce = recordFishingShopPurchase(
      today,
      FISHING_SEED_POUCH_ITEM_ID,
    );
    expect(fishingSeedPouchView(boughtOnce)).toMatchObject({
      boughtToday: 1,
      remainingToday: 2,
      nextPrice: 160,
      contents: FARM_FISHING_SHOP_SEED_REWARD,
    });

    const loadedToday = parseFishingShopState(boughtOnce, "2026-07-10");
    expect(fishingSeedPouchView(loadedToday).boughtToday).toBe(1);

    const tomorrow = parseFishingShopState(boughtOnce, "2026-07-11");
    expect(fishingSeedPouchView(tomorrow)).toMatchObject({
      boughtToday: 0,
      remainingToday: 3,
      nextPrice: 80,
    });
  });

  it("제거된 칭호는 정의도 삭제(표시 경로가 미정의 id 를 가드)", () => {
    const removed: Record<string, unknown> = TITLES;
    for (const id of [
      "fishing_deepsea",
      "fishing_dawnangler",
      "fishing_tidereader",
      "fishing_specialguest",
    ]) {
      expect(removed[id], id).toBeUndefined();
    }
  });

  it("낚시 도구 가격은 기본 무료, 구매 도구 양수", () => {
    for (const id of FISHING_ROD_IDS) {
      expect(fishingGearPrice("rod", id)).toBe(FISHING_RODS[id].price);
      if (id === "reed_rod") expect(FISHING_RODS[id].price).toBe(0);
      else expect(FISHING_RODS[id].price).toBeGreaterThan(0);
    }
    for (const id of FISHING_LURE_IDS) {
      expect(fishingGearPrice("lure", id)).toBe(FISHING_LURES[id].price);
      if (id === "dough_lure") expect(FISHING_LURES[id].price).toBe(0);
      else expect(FISHING_LURES[id].price).toBeGreaterThan(0);
    }
  });
});
