import { describe, expect, it } from "vitest";
import * as museunCashCatalog from "./museunCashItems";
import {
  MUSEUN_CASH_ITEMS,
  MUSEUN_COSMETIC_BOX_ITEM_IDS,
  MUSEUN_COSMETIC_INVENTORY_ITEM_IDS,
  MUSEUN_ADMIN_GIFT_ITEM_IDS,
  MUSEUN_SHOP_ITEM_IDS,
  MUSEUN_UTILITY_ITEM_IDS,
  MUSEUN_COIN_SHOP_MAX_PURCHASE_QUANTITY,
  addMuseunCashItem,
  isMuseunCashItemId,
  isMuseunCosmeticBoxItemId,
  parseMuseunCashItems,
  parseMuseunCoinBalance,
  parseMuseunCoinShopPurchaseQuantity,
  maxMuseunCoinShopPurchaseQuantity,
  removeMuseunCashItem,
  isTradeableMuseunCashItemId,
  isMuseunShopItemId,
  isMuseunAdminGiftItemId,
} from "./museunCashItems";

describe("무슨 코인 캐시 소모품", () => {
  it("프로필·개명 변경권과 30일 지원권의 가격·효과를 고정한다", () => {
    expect(
      (
        MUSEUN_CASH_ITEMS as Record<
          string,
          {
            id: string;
            name: string;
            delivery: string;
            tradeable: boolean;
            tags?: readonly string[];
            effect: { kind: string; level?: number };
          }
        >
      ).level_100_elixir,
    ).toMatchObject({
      id: "level_100_elixir",
      name: "100레벨 달성의 비약",
      delivery: "inventory",
      tradeable: false,
      tags: ["이벤트"],
      effect: { kind: "level_target", level: 100 },
    });
    expect(MUSEUN_CASH_ITEMS.cultivation_reset_potion).toMatchObject({
      name: "수행 초기화 물약",
      coinPrice: 0,
      delivery: "inventory",
      tradeable: false,
      effect: { kind: "cultivation_reset" },
    });
    expect(
      MUSEUN_CASH_ITEMS.cultivation_reset_potion.description,
    ).toContain("레벨 1");
    expect(
      MUSEUN_CASH_ITEMS.cultivation_reset_potion.description,
    ).not.toContain("재분배 대기");
    expect(MUSEUN_CASH_ITEMS.profile_badge_display_stand).toMatchObject({
      coinPrice: 600,
      delivery: "permanent",
      tradeable: false,
      effect: { kind: "profile_badge_stand" },
    });
    expect(MUSEUN_CASH_ITEMS.profile_image_permit).toMatchObject({
      coinPrice: 500,
      delivery: "inventory",
      tradeable: true,
      effect: { kind: "profile_image" },
    });
    expect(MUSEUN_CASH_ITEMS.profile_image_permit.description).toContain(
      "이미지를 직접 등록",
    );
    expect(MUSEUN_CASH_ITEMS.profile_image_permit.description).not.toContain(
      "게임 내 이미지",
    );
    expect(MUSEUN_CASH_ITEMS.rename_permit).toMatchObject({
      coinPrice: 400,
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
      name: "닉네임 꾸미기 상자",
      coinPrice: 200,
      delivery: "inventory",
      tradeable: true,
      effect: { kind: "chroma_name_box" },
    });
    expect(MUSEUN_CASH_ITEMS.profile_border_box).toMatchObject({
      name: "프로필 꾸미기 상자",
      coinPrice: 300,
      delivery: "inventory",
      tradeable: true,
      effect: { kind: "profile_border_box" },
    });
    expect(MUSEUN_CASH_ITEMS.chat_badge_box).toMatchObject({
      coinPrice: 200,
      delivery: "inventory",
      tradeable: true,
      effect: { kind: "chat_badge_box" },
    });
    expect(MUSEUN_CASH_ITEMS.cosmetic_extension_30d).toMatchObject({
      coinPrice: 400,
      delivery: "inventory",
      tradeable: true,
      effect: { kind: "cosmetic_extension", days: 30 },
    });
  });

  it("카탈로그 id만 캐시 아이템으로 인정한다", () => {
    expect(isMuseunCashItemId("level_100_elixir")).toBe(true);
    expect(MUSEUN_SHOP_ITEM_IDS).not.toContain("level_100_elixir");
    expect(MUSEUN_ADMIN_GIFT_ITEM_IDS).toContain("level_100_elixir");
    expect(isMuseunAdminGiftItemId("level_100_elixir")).toBe(true);
    expect(isMuseunCashItemId("rename_permit")).toBe(true);
    expect(isMuseunCashItemId("profile_image_permit")).toBe(true);
    expect(isMuseunCashItemId("adventure_support_30d")).toBe(true);
    expect(isMuseunCashItemId("cultivation_reset_potion")).toBe(true);
    expect(isMuseunCashItemId("chroma_name_box")).toBe(true);
    expect(isMuseunShopItemId("profile_border_box")).toBe(true);
    expect(isMuseunShopItemId("chat_badge_box")).toBe(true);
    expect(isMuseunShopItemId("profile_badge_display_stand")).toBe(true);
    expect(isMuseunShopItemId("prismatic_profile_border")).toBe(false);
    expect(MUSEUN_SHOP_ITEM_IDS).not.toContain("starlight_chat_badge");
    expect(MUSEUN_SHOP_ITEM_IDS).not.toContain("cultivation_reset_potion");
    expect(MUSEUN_ADMIN_GIFT_ITEM_IDS).toContain("cultivation_reset_potion");
    expect(isMuseunAdminGiftItemId("cultivation_reset_potion")).toBe(true);
    expect(isMuseunCashItemId("toString")).toBe(false);
    expect(isMuseunCashItemId("unknown")).toBe(false);
  });

  it("꾸미기 상자와 일반 소모품의 화면 분류를 구분한다", () => {
    expect(MUSEUN_UTILITY_ITEM_IDS).toContain("level_100_elixir");
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
    expect(MUSEUN_UTILITY_ITEM_IDS).toContain("cultivation_reset_potion");
    expect(MUSEUN_UTILITY_ITEM_IDS).not.toContain("profile_border_box");
    expect(MUSEUN_UTILITY_ITEM_IDS).not.toContain("cosmetic_extension_30d");
  });

  it("꾸미기 권리는 계정 귀속이고 인벤토리 아이템만 거래 가능하다", () => {
    expect(isTradeableMuseunCashItemId("profile_badge_display_stand")).toBe(
      false,
    );
    expect(isTradeableMuseunCashItemId("rename_permit")).toBe(true);
    expect(isTradeableMuseunCashItemId("profile_image_permit")).toBe(true);
    expect(isTradeableMuseunCashItemId("adventure_support_30d")).toBe(true);
    expect(isTradeableMuseunCashItemId("cultivation_reset_potion")).toBe(
      false,
    );
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

  it("이벤트 아이템 태그를 인벤토리 표시용으로 제공한다", () => {
    const tags = (
      museunCashCatalog as typeof museunCashCatalog & {
        museunCashItemTags?: (itemId: string) => readonly string[];
      }
    ).museunCashItemTags;

    expect(tags).toBeTypeOf("function");
    expect(tags?.("level_100_elixir")).toEqual(["이벤트"]);
    expect(tags?.("rename_permit")).toEqual([]);
  });

  it("코인 잔액은 음수·손상 값을 0으로 정규화한다", () => {
    expect(parseMuseunCoinBalance({ coins: 1_234.9 })).toBe(1_234);
    expect(parseMuseunCoinBalance({ coins: -1 })).toBe(0);
    expect(parseMuseunCoinBalance({ coins: "broken" })).toBe(0);
  });

  it("상점 일괄 구매 수량을 1~99개 정수로 제한하고 구매 가능 최대치를 계산한다", () => {
    expect(MUSEUN_COIN_SHOP_MAX_PURCHASE_QUANTITY).toBe(99);
    expect(parseMuseunCoinShopPurchaseQuantity(1)).toBe(1);
    expect(parseMuseunCoinShopPurchaseQuantity("12")).toBe(12);
    expect(parseMuseunCoinShopPurchaseQuantity(99)).toBe(99);
    expect(parseMuseunCoinShopPurchaseQuantity(0)).toBeNull();
    expect(parseMuseunCoinShopPurchaseQuantity(1.5)).toBeNull();
    expect(parseMuseunCoinShopPurchaseQuantity(100)).toBeNull();
    expect(maxMuseunCoinShopPurchaseQuantity(2_050, 400)).toBe(5);
    expect(maxMuseunCoinShopPurchaseQuantity(100_000, 300)).toBe(99);
    expect(maxMuseunCoinShopPurchaseQuantity(1_000, 0)).toBe(0);
  });
});
