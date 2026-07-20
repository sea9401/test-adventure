import { describe, expect, it } from "vitest";
import {
  COSMETIC_RARITY_DISPLAY_ORDER,
  SHOP_ITEM_GROUPS,
  sortCosmeticPreviewEntries,
} from "./MuseunCoinShopView";

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
});
