import { describe, it, expect } from "vitest";
import {
  COLLECTION_SHOP_TITLES,
  collectionTitleCost,
  collectionTitleSpend,
  totalCollectionSpend,
  isCollectionShopTitle,
} from "./v2CollectionTitles";
import { presetSlotSpend } from "./v2LoadoutPresets";
import { TITLES } from "@/adventure/data/titles";

describe("v2CollectionTitles — 수집 칭호 상점(소비형 sink)", () => {
  it("모든 상점 칭호는 titles.ts 에 collection 카테고리로 정의돼 있다", () => {
    for (const t of COLLECTION_SHOP_TITLES) {
      const def = TITLES[t.id];
      expect(def, `${t.id} 정의 누락`).toBeDefined();
      expect(def.category).toBe("collection");
      expect(t.cost).toBeGreaterThan(0);
    }
  });

  it("collectionTitleCost — 상점 품목만 비용, 그 외 0", () => {
    expect(collectionTitleCost("coll_wanderer")).toBe(2);
    expect(collectionTitleCost("coll_pathmaster")).toBe(10);
    expect(collectionTitleCost("first_blood")).toBe(0); // 비상점 칭호
    expect(collectionTitleCost("nope")).toBe(0);
  });

  it("isCollectionShopTitle", () => {
    expect(isCollectionShopTitle("coll_jack")).toBe(true);
    expect(isCollectionShopTitle("first_blood")).toBe(false);
  });

  it("collectionTitleSpend — 보유 칭호 중 상점 품목 비용 합(비상점 무시)", () => {
    expect(collectionTitleSpend([])).toBe(0);
    expect(collectionTitleSpend(["coll_wanderer"])).toBe(2);
    expect(collectionTitleSpend(["coll_wanderer", "coll_jack"])).toBe(6);
    // 비상점 칭호는 무시.
    expect(
      collectionTitleSpend(["coll_collector", "first_blood", "treasure_legend"]),
    ).toBe(6);
  });

  it("totalCollectionSpend = 프리셋 슬롯 + 수집 칭호(같은 풀)", () => {
    // 슬롯 2개 구매(2+4=6) + coll_polymath(8) = 14.
    expect(totalCollectionSpend(2, ["coll_polymath"])).toBe(
      presetSlotSpend(2) + 8,
    );
    expect(totalCollectionSpend(0, [])).toBe(0);
  });
});
