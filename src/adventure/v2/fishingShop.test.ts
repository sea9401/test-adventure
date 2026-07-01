import { describe, it, expect } from "vitest";
import {
  FISHING_SHOP_TITLES,
  fishingShopEntries,
  fishingShopPriceFor,
} from "./fishingShop";
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
