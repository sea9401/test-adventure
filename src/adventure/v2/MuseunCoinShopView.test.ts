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
  bundlePurchaseUsesFixedQuantity,
  limitedBundlePurchaseState,
  supportBenefitsForItem,
  sortCosmeticPreviewEntries,
} from "./MuseunCoinShopView";
import { MUSEUN_COIN_PACKAGES } from "@/adventure/data/v2/adventureSupport";

describe("무슨 코인 상점 상품 그룹", () => {
  it("충전 패키지는 서버 카탈로그의 원화 가격을 표시한다", () => {
    expect(MUSEUN_COIN_PACKAGES.map((item) => item.priceKrw)).toEqual([
      10_000,
      20_000,
      30_000,
      50_000,
    ]);
  });
  it("상점에 두 한정 패키지를 포함한 열한 상품을 노출한다", () => {
    const shopItemIds = SHOP_ITEM_GROUPS.flatMap((group) => group.itemIds);

    expect(shopItemIds).toHaveLength(11);
    expect(shopItemIds).toContain("monthly_stamina_potion_bundle");
    expect(shopItemIds).toContain("growth_leap_package");
    expect(shopItemIds).toContain("profile_badge_display_stand");
    for (const itemId of shopItemIds) {
      expect(CASH_ITEM_ART_PATHS[itemId]).toBe(
        `/images/items/cash/${itemId}.svg`,
      );
    }
  });

  it("이용권·소모품은 프리미엄권을 일반권보다 먼저 표시한다", () => {
    const group = SHOP_ITEM_GROUPS.find(
      (candidate) => candidate.id === "consumable",
    );
    expect(group?.itemIds).toEqual([
      "adventure_support_premium_30d",
      "adventure_support_30d",
      "monthly_stamina_potion_bundle",
      "growth_leap_package",
      "rename_permit",
      "profile_image_permit",
    ]);
  });

  it("월간 한도와 평생 구매 여부를 구매 차단 상태로 바꾼다", () => {
    expect(
      limitedBundlePurchaseState("monthly_stamina_potion_bundle", {
        monthlyStaminaBundle: { purchases: 2, remaining: 1, limit: 3 },
        growthLeapPackage: { owned: false },
      }),
    ).toEqual({ label: "이번 달 2/3회 구매", blocked: false });
    expect(
      limitedBundlePurchaseState("monthly_stamina_potion_bundle", {
        monthlyStaminaBundle: { purchases: 3, remaining: 0, limit: 3 },
        growthLeapPackage: { owned: false },
      }),
    ).toEqual({ label: "이번 달 구매 완료 (3/3)", blocked: true });
    expect(
      limitedBundlePurchaseState("growth_leap_package", {
        monthlyStaminaBundle: { purchases: 0, remaining: 3, limit: 3 },
        growthLeapPackage: { owned: true },
      }),
    ).toEqual({ label: "계정 구매 완료", blocked: true });
  });

  it("두 패키지는 구매 확인에서 수량을 1개로 고정한다", () => {
    expect(bundlePurchaseUsesFixedQuantity("monthly_stamina_potion_bundle")).toBe(true);
    expect(bundlePurchaseUsesFixedQuantity("growth_leap_package")).toBe(true);
    expect(bundlePurchaseUsesFixedQuantity("rename_permit")).toBe(false);
  });

  it("프리미엄 상세에는 합산하지 않은 전용 혜택과 연장권 지급을 표시한다", () => {
    const labels = supportBenefitsForItem(
      "adventure_support_premium_30d",
    ).map((benefit) => benefit.label);

    expect(labels).toEqual([
      "최대 에너지 3,000 증가 (기본 2,000 → 5,000)",
      "에너지 회복량 20% 증가",
      "거래소 등록 20개 추가",
      "거래소 수수료 5%로 감소",
      "일괄 전투 최대 100회",
      "꾸미기 30일 연장권 2개 지급",
    ]);
  });

  it("대표 배지 전시대와 꾸미기 상품을 꾸미기 목록 하나에 표시한다", () => {
    const group = SHOP_ITEM_GROUPS.find(
      (candidate) => candidate.id === "cosmetic",
    );
    expect(group?.title).toBe("꾸미기");
    expect(group?.itemIds).toEqual([
      "profile_badge_display_stand",
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
