import { describe, expect, it } from "vitest";
import {
  MUSEUN_CASH_ITEMS,
  MUSEUN_COSMETIC_BOX_ITEM_IDS,
  MUSEUN_COSMETIC_INVENTORY_ITEM_IDS,
  MUSEUN_SHOP_ITEM_IDS,
  MUSEUN_UTILITY_ITEM_IDS,
  addMuseunCashItem,
  isMuseunCashItemId,
  isMuseunCosmeticBoxItemId,
  parseMuseunCashItems,
  parseMuseunCoinBalance,
  removeMuseunCashItem,
  isTradeableMuseunCashItemId,
  isMuseunShopItemId,
} from "./museunCashItems";

describe("무슨 코인 캐시 소모품", () => {
  it("프로필·개명 변경권과 30일 지원권의 가격·효과를 고정한다", () => {
    expect(MUSEUN_CASH_ITEMS.profile_image_permit).toMatchObject({
      coinPrice: 300,
      delivery: "inventory",
      tradeable: true,
      effect: { kind: "profile_image" },
    });
    expect(MUSEUN_CASH_ITEMS.rename_permit).toMatchObject({
      coinPrice: 300,
      effect: { kind: "rename" },
    });
    expect(MUSEUN_CASH_ITEMS.adventure_support_30d).toMatchObject({
      coinPrice: 800,
      effect: { kind: "adventure_support", days: 30 },
    });
    expect(MUSEUN_CASH_ITEMS.prismatic_profile_border).toMatchObject({
      coinPrice: 400,
      delivery: "entitlement",
      effect: { kind: "cosmetic", slot: "profile_border" },
    });
    expect(MUSEUN_CASH_ITEMS.starlight_chat_badge.coinPrice).toBe(300);
    expect(MUSEUN_CASH_ITEMS.chroma_name_box).toMatchObject({
      coinPrice: 300,
      delivery: "inventory",
      tradeable: true,
      effect: { kind: "chroma_name_box" },
    });
    expect(MUSEUN_CASH_ITEMS.profile_border_box).toMatchObject({
      coinPrice: 400,
      delivery: "inventory",
      tradeable: true,
      effect: { kind: "profile_border_box" },
    });
    expect(MUSEUN_CASH_ITEMS.chat_badge_box).toMatchObject({
      coinPrice: 300,
      delivery: "inventory",
      tradeable: true,
      effect: { kind: "chat_badge_box" },
    });
    expect(MUSEUN_CASH_ITEMS.cosmetic_extension_30d).toMatchObject({
      coinPrice: 200,
      delivery: "inventory",
      tradeable: true,
      effect: { kind: "cosmetic_extension", days: 30 },
    });
  });

  it("카탈로그 id만 캐시 아이템으로 인정한다", () => {
    expect(isMuseunCashItemId("rename_permit")).toBe(true);
    expect(isMuseunCashItemId("profile_image_permit")).toBe(true);
    expect(isMuseunCashItemId("adventure_support_30d")).toBe(true);
    expect(isMuseunCashItemId("chroma_name_box")).toBe(true);
    expect(isMuseunShopItemId("profile_border_box")).toBe(true);
    expect(isMuseunShopItemId("chat_badge_box")).toBe(true);
    expect(isMuseunShopItemId("prismatic_profile_border")).toBe(false);
    expect(MUSEUN_SHOP_ITEM_IDS).not.toContain("starlight_chat_badge");
    expect(isMuseunCashItemId("toString")).toBe(false);
    expect(isMuseunCashItemId("unknown")).toBe(false);
  });

  it("꾸미기 상자와 일반 소모품의 화면 분류를 구분한다", () => {
    expect(MUSEUN_COSMETIC_BOX_ITEM_IDS).toEqual([
      "chroma_name_box",
      "profile_border_box",
      "chat_badge_box",
    ]);
    expect(MUSEUN_COSMETIC_INVENTORY_ITEM_IDS).toEqual([
      "cosmetic_extension_30d",
      "chroma_name_box",
      "profile_border_box",
      "chat_badge_box",
    ]);
    expect(isMuseunCosmeticBoxItemId("chroma_name_box")).toBe(true);
    expect(isMuseunCosmeticBoxItemId("rename_permit")).toBe(false);
    expect(MUSEUN_UTILITY_ITEM_IDS).toContain("rename_permit");
    expect(MUSEUN_UTILITY_ITEM_IDS).toContain("profile_image_permit");
    expect(MUSEUN_UTILITY_ITEM_IDS).toContain("adventure_support_30d");
    expect(MUSEUN_UTILITY_ITEM_IDS).not.toContain("profile_border_box");
    expect(MUSEUN_UTILITY_ITEM_IDS).not.toContain("cosmetic_extension_30d");
  });

  it("꾸미기 권리는 계정 귀속이고 인벤토리 아이템만 거래 가능하다", () => {
    expect(isTradeableMuseunCashItemId("rename_permit")).toBe(true);
    expect(isTradeableMuseunCashItemId("profile_image_permit")).toBe(true);
    expect(isTradeableMuseunCashItemId("adventure_support_30d")).toBe(true);
    expect(isTradeableMuseunCashItemId("chroma_name_box")).toBe(true);
    expect(isTradeableMuseunCashItemId("profile_border_box")).toBe(true);
    expect(isTradeableMuseunCashItemId("chat_badge_box")).toBe(true);
    expect(isTradeableMuseunCashItemId("cosmetic_extension_30d")).toBe(true);
    expect(isTradeableMuseunCashItemId("prismatic_profile_border")).toBe(
      false,
    );
    expect(
      parseMuseunCashItems({
        rename_permit: 1,
        chroma_name_box: 2,
        profile_border_box: 1,
        chat_badge_box: 3,
      }),
    ).toEqual({
      rename_permit: 1,
      profile_border_box: 1,
      chat_badge_box: 3,
      chroma_name_box: 2,
    });
    expect(addMuseunCashItem({}, "chroma_name_box", 1)).toEqual({
      chroma_name_box: 1,
    });
    expect(removeMuseunCashItem({}, "prismatic_profile_border", 1)).toBeNull();
  });

  it("보유 수량을 양의 정수로 정규화하고 안전하게 가감한다", () => {
    expect(
      parseMuseunCashItems({
        rename_permit: 2.9,
        adventure_support_30d: -1,
        unknown: 99,
      }),
    ).toEqual({ rename_permit: 2 });

    const added = addMuseunCashItem({}, "adventure_support_30d", 3);
    expect(added).toEqual({ adventure_support_30d: 3 });
    expect(removeMuseunCashItem(added, "adventure_support_30d", 2)).toEqual({
      adventure_support_30d: 1,
    });
    expect(removeMuseunCashItem(added, "adventure_support_30d", 4)).toBeNull();
  });

  it("코인 잔액은 음수·손상 값을 0으로 정규화한다", () => {
    expect(parseMuseunCoinBalance({ coins: 1_234.9 })).toBe(1_234);
    expect(parseMuseunCoinBalance({ coins: -1 })).toBe(0);
    expect(parseMuseunCoinBalance({ coins: "broken" })).toBe(0);
  });
});
