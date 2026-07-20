import { describe, expect, it } from "vitest";
import { SHOP_ITEM_GROUPS } from "./MuseunCoinShopView";

describe("무슨 코인 상점 상품 그룹", () => {
  it("이용권·소모품은 월간 모험 지원권을 먼저 표시한다", () => {
    const group = SHOP_ITEM_GROUPS.find(
      (candidate) => candidate.id === "consumable",
    );
    expect(group?.itemIds).toEqual([
      "adventure_support_30d",
      "rename_permit",
    ]);
  });

  it("꾸미기 상자와 30일 연장권을 꾸미기 목록 하나에 표시한다", () => {
    const group = SHOP_ITEM_GROUPS.find(
      (candidate) => candidate.id === "cosmetic",
    );
    expect(group?.title).toBe("꾸미기");
    expect(group?.itemIds).toEqual([
      "chroma_name_box",
      "profile_border_box",
      "chat_badge_box",
      "cosmetic_extension_30d",
    ]);
    expect(SHOP_ITEM_GROUPS).toHaveLength(2);
  });
});
