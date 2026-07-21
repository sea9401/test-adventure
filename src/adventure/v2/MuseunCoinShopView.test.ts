import { describe, expect, it } from "vitest";
import {
  CASH_ITEM_ART_PATHS,
  CASH_ITEM_DETAIL_BODY_CLASS,
  CASH_ITEM_DETAIL_HEADER_CLASS,
  CASH_ITEM_DETAIL_OVERLAY_CLASS,
  CASH_ITEM_DETAIL_PANEL_CLASS,
  CASH_ITEM_PURCHASE_CONFIRM_OVERLAY_CLASS,
  COSMETIC_RARITY_DISPLAY_ORDER,
  SHOP_ITEM_GROUPS,
  sortCosmeticPreviewEntries,
} from "./MuseunCoinShopView";

describe("무슨 코인 상점 상품 그룹", () => {
  it("상점에 노출되는 일곱 상품 모두 전용 SVG 이미지를 연결한다", () => {
    const shopItemIds = SHOP_ITEM_GROUPS.flatMap((group) => group.itemIds);

    expect(shopItemIds).toHaveLength(7);
    expect(Object.keys(CASH_ITEM_ART_PATHS)).toEqual(
      expect.arrayContaining(shopItemIds),
    );
    for (const itemId of shopItemIds) {
      expect(CASH_ITEM_ART_PATHS[itemId]).toBe(
        `/images/items/cash/${itemId}.svg`,
      );
    }
  });

  it("이용권·소모품은 월간 모험 지원권을 먼저 표시한다", () => {
    const group = SHOP_ITEM_GROUPS.find(
      (candidate) => candidate.id === "consumable",
    );
    expect(group?.itemIds).toEqual([
      "adventure_support_30d",
      "rename_permit",
      "profile_image_permit",
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

  it("꾸미기 획득 목록을 전설부터 일반까지 등급순으로 정렬한다", () => {
    const entries = [
      { name: "일반", rarity: "common" as const },
      { name: "희귀", rarity: "rare" as const },
      { name: "전설", rarity: "legendary" as const },
      { name: "영웅", rarity: "epic" as const },
    ];

    expect(COSMETIC_RARITY_DISPLAY_ORDER).toEqual([
      "legendary",
      "epic",
      "rare",
      "common",
    ]);
    expect(
      sortCosmeticPreviewEntries(entries).map((entry) => entry.rarity),
    ).toEqual(["legendary", "epic", "rare", "common"]);
    expect(entries.map((entry) => entry.rarity)).toEqual([
      "common",
      "rare",
      "legendary",
      "epic",
    ]);
  });

  it("모바일 상품 상세는 화면 안에 머물고 헤더를 고정한 채 본문만 스크롤한다", () => {
    expect(CASH_ITEM_DETAIL_OVERLAY_CLASS).toContain("items-start");
    expect(CASH_ITEM_DETAIL_OVERLAY_CLASS).toContain("overflow-y-auto");
    expect(CASH_ITEM_DETAIL_PANEL_CLASS).toContain("100dvh");
    expect(CASH_ITEM_DETAIL_PANEL_CLASS).toContain("overflow-hidden");
    expect(CASH_ITEM_DETAIL_HEADER_CLASS).toContain("shrink-0");
    expect(CASH_ITEM_DETAIL_BODY_CLASS).toContain("overflow-y-auto");
  });

  it("구매 확인 창은 모바일 바텀시트로 표시하고 상품 상세보다 위에 둔다", () => {
    expect(CASH_ITEM_PURCHASE_CONFIRM_OVERLAY_CLASS).toContain("items-end");
    expect(CASH_ITEM_PURCHASE_CONFIRM_OVERLAY_CLASS).toContain("sm:items-center");
    expect(CASH_ITEM_PURCHASE_CONFIRM_OVERLAY_CLASS).toContain("z-[110]");
  });
});
