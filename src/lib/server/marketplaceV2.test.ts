import { describe, expect, it } from "vitest";
import { V2_EQUIPMENT, sellPriceOf } from "@/adventure/data/v2/v2Equipment";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import { MUSEUN_CASH_ITEMS } from "@/adventure/data/v2/museunCashItems";
import { cookingFoodId } from "@/adventure/v2/cooking/food";
import {
  DANGEROUS_BOSSES,
  DANGEROUS_FISH,
  dangerousBossMaterialId,
  dangerousCatchMaterialId,
} from "@/adventure/data/v2/dangerousFishing";
import {
  MARKETPLACE_V2_BID_GRACE_MAX_HOURS,
  MARKETPLACE_V2_BID_GRACE_MIN_HOURS,
  MARKETPLACE_V2_BUY_ORDER_ESCROW_MAX,
  MARKETPLACE_V2_BUY_ORDER_LIMIT,
  MARKETPLACE_V2_BUY_ORDER_MAX_DAYS,
  MARKETPLACE_V2_DIRECT_LISTING_HOURS,
  MARKETPLACE_V2_FIXED_LISTING_HOURS,
  MARKETPLACE_V2_MATERIAL_QTY_MAX,
  MARKETPLACE_V2_PRICE_MAX,
  MARKETPLACE_V2_TAX_RATE,
  isMarketKind,
  isStackableMarketplaceItem,
  isTradableEquip,
  isTradableMaterial,
  isValidBidGraceHours,
  isValidMaterialQty,
  isValidPrice,
  currentMarketplaceItemName,
  equipmentBuyOrderMinimumPrice,
  itemDisplayName,
  marketplaceEquipListError,
  marketplaceListingPhase,
  marketplaceListingTimes,
  marketplaceNextBidMinimum,
  marketplacePartialPrice,
  marketplacePublicListing,
  marketplaceSlotLimitForAdventureSupport,
  marketplaceTaxRateForAdventureSupport,
  marketplaceUnitPrice,
  saleProceeds,
  saleTax,
} from "./marketplaceV2";

describe("즉시구매와 공개 입찰 등록", () => {
  it("유예 0은 즉시구매로 등록하고 24시간 유지한다", () => {
    expect(MARKETPLACE_V2_DIRECT_LISTING_HOURS).toBe(24);
    const createdAt = new Date("2026-07-28T00:00:00Z");
    expect(marketplaceListingTimes(createdAt, 0)).toEqual({
      bidEndsAt: createdAt,
      expiresAt: new Date("2026-07-29T00:00:00Z"),
    });
  });

  it("판매자가 2~24시간 유예를 고르고 이후 고정가 등록은 2시간 유지한다", () => {
    expect(MARKETPLACE_V2_BID_GRACE_MIN_HOURS).toBe(2);
    expect(MARKETPLACE_V2_BID_GRACE_MAX_HOURS).toBe(24);
    expect(MARKETPLACE_V2_FIXED_LISTING_HOURS).toBe(2);
    const createdAt = new Date("2026-07-28T00:00:00Z");
    expect(marketplaceListingTimes(createdAt, 6)).toEqual({
      bidEndsAt: new Date("2026-07-28T06:00:00Z"),
      expiresAt: new Date("2026-07-28T08:00:00Z"),
    });
  });

  it("즉시구매 0 또는 경매 유예 정수 2~24시간만 허용한다", () => {
    expect(isValidBidGraceHours(0)).toBe(true);
    expect(isValidBidGraceHours(2)).toBe(true);
    expect(isValidBidGraceHours(24)).toBe(true);
    expect(isValidBidGraceHours(1)).toBe(false);
    expect(isValidBidGraceHours(25)).toBe(false);
    expect(isValidBidGraceHours(2.5)).toBe(false);
    expect(isValidBidGraceHours("2")).toBe(false);
  });

  it("현재 최고 입찰가보다 최소 5% 높은 정수만 다음 입찰가가 된다", () => {
    expect(marketplaceNextBidMinimum(null)).toBe(1);
    expect(marketplaceNextBidMinimum(1)).toBe(2);
    expect(marketplaceNextBidMinimum(100)).toBe(105);
    expect(marketplaceNextBidMinimum(101)).toBe(107);
  });

  it("유예 종료 시 즉시구매가 초과 입찰만 입찰 판매로 전환한다", () => {
    const base = {
      status: "active",
      price: 100,
      bidEndsAt: new Date("2026-07-28T02:00:00Z"),
      expiresAt: new Date("2026-07-28T04:00:00Z"),
    };
    expect(
      marketplaceListingPhase(
        { ...base, highestBid: 100 },
        new Date("2026-07-28T02:00:00Z"),
      ),
    ).toBe("fixed");
    expect(
      marketplaceListingPhase(
        { ...base, highestBid: 101 },
        new Date("2026-07-28T02:00:00Z"),
      ),
    ).toBe("auction_settlement");
  });

  it("공개 매물에서는 판매자 이름·ID와 입찰자 ID를 제거한다", () => {
    const listing = marketplacePublicListing(
      {
        id: 1,
        sellerId: "seller-secret",
        sellerName: "판매자이름",
        highestBidderId: "viewer",
        highestBid: 100,
      },
      "viewer",
    );
    expect(listing).not.toHaveProperty("sellerId");
    expect(listing).not.toHaveProperty("sellerName");
    expect(listing).not.toHaveProperty("highestBidderId");
    expect(listing).toMatchObject({
      id: 1,
      isMine: false,
      isHighestBidder: true,
      nextBid: 105,
    });
  });
});

describe("판매세 (sink) — saleProceeds / saleTax", () => {
  it("proceeds = floor(price × (1−세율)), 세금 = price − proceeds (보존: 골드 신규생성 0)", () => {
    for (const price of [1, 19, 100, 999, 12345, MARKETPLACE_V2_PRICE_MAX]) {
      const proceeds = saleProceeds(price);
      const tax = saleTax(price);
      expect(proceeds + tax).toBe(price); // 보존 — 구매자 지불 = 판매자 수령 + 소각
      expect(proceeds).toBeLessThanOrEqual(price);
      expect(tax).toBeGreaterThanOrEqual(0);
    }
  });

  it("일반 10% 세율 — price 100 → 판매자 90 / 소각 10", () => {
    expect(MARKETPLACE_V2_TAX_RATE).toBe(0.1);
    expect(saleProceeds(100)).toBe(90);
    expect(saleTax(100)).toBe(10);
  });

  it("지원권은 등록 10개를 추가하고 판매세를 5%로 낮춘다", () => {
    expect(marketplaceSlotLimitForAdventureSupport(false)).toBe(10);
    expect(marketplaceSlotLimitForAdventureSupport(true)).toBe(20);
    expect(marketplaceTaxRateForAdventureSupport(false)).toBe(0.1);
    expect(marketplaceTaxRateForAdventureSupport(true)).toBe(0.05);
    const supportRate = marketplaceTaxRateForAdventureSupport(true);
    expect(saleProceeds(100, supportRate)).toBe(95);
    expect(saleTax(100, supportRate)).toBe(5);
  });

  it("내림 처리 — price 19 → proceeds 17(floor 17.1) / 세금 2", () => {
    expect(saleProceeds(19)).toBe(17);
    expect(saleTax(19)).toBe(2);
  });

  it("최소가(1) — proceeds 0 / 세금 1 (소액 매물은 순이익 0, spam 억제)", () => {
    expect(saleProceeds(1)).toBe(0);
    expect(saleTax(1)).toBe(1);
  });
});

describe("isValidPrice", () => {
  it("정수 [1, 999,999,999] 만 통과", () => {
    expect(isValidPrice(1)).toBe(true);
    expect(isValidPrice(MARKETPLACE_V2_PRICE_MAX)).toBe(true);
    expect(isValidPrice(0)).toBe(false);
    expect(isValidPrice(-5)).toBe(false);
    expect(isValidPrice(1.5)).toBe(false);
    expect(isValidPrice(MARKETPLACE_V2_PRICE_MAX + 1)).toBe(false);
    expect(isValidPrice("100")).toBe(false);
    expect(isValidPrice(NaN)).toBe(false);
  });
});

describe("isValidMaterialQty", () => {
  it("정수 [1, MAX] 만", () => {
    expect(isValidMaterialQty(1)).toBe(true);
    expect(isValidMaterialQty(MARKETPLACE_V2_MATERIAL_QTY_MAX)).toBe(true);
    expect(isValidMaterialQty(0)).toBe(false);
    expect(isValidMaterialQty(MARKETPLACE_V2_MATERIAL_QTY_MAX + 1)).toBe(false);
    expect(isValidMaterialQty(2.5)).toBe(false);
  });
});

describe("물고기 표본 거래 분류", () => {
  it("카탈로그에 있는 표본만 수량형 소비 아이템으로 허용하고 이름을 파생한다", () => {
    expect(isStackableMarketplaceItem("consumable", "fish_specimen_carp")).toBe(true);
    expect(itemDisplayName("consumable", "fish_specimen_carp")).toBe("잉어 표본");
    expect(isStackableMarketplaceItem("consumable", "fish_specimen_fake")).toBe(false);
    expect(itemDisplayName("consumable", "fish_specimen_fake")).toBeNull();
    expect(
      currentMarketplaceItemName(
        "consumable",
        "fish_specimen_carp",
        "오래된 이름",
      ),
    ).toBe("잉어 표본");
  });
});

describe("위험 해역 귀환 어획물 거래 분류", () => {
  it("확정된 철턱 참치는 표시명 있는 수량형 재료로 거래한다", () => {
    expect(isTradableMaterial("danger_catch_ironjaw_tuna")).toBe(true);
    expect(isStackableMarketplaceItem("material", "danger_catch_ironjaw_tuna")).toBe(
      true,
    );
    expect(itemDisplayName("material", "danger_catch_ironjaw_tuna")).toBe(
      "철턱 참치",
    );
  });
});

describe("isMarketKind", () => {
  it("v2 거래소 종류만 통과", () => {
    expect(isMarketKind("equip")).toBe(true);
    expect(isMarketKind("material")).toBe(true);
    expect(isMarketKind("consumable")).toBe(true);
    expect(isMarketKind("gold")).toBe(false);
    expect(isMarketKind(null)).toBe(false);
  });
});

describe("스택 매물 부분 체결 가격", () => {
  it("총액을 올림한 개당 가격으로 표시한다", () => {
    expect(marketplaceUnitPrice(1_000, 10)).toBe(100);
    expect(marketplaceUnitPrice(1_001, 10)).toBe(101);
  });

  it("일부 수량 가격을 배분하고 잔여 매물 가격 1골드를 보존한다", () => {
    expect(marketplacePartialPrice(1_000, 10, 3)).toBe(300);
    expect(marketplacePartialPrice(10, 3, 1)).toBe(4);
    expect(marketplacePartialPrice(10, 3, 3)).toBe(10);
    expect(marketplacePartialPrice(1, 3, 1)).toBeNull();
  });
});

describe("구매 주문 안전 한도", () => {
  it("활성 주문 수·유효 기간·주문 보관금에 상한을 둔다", () => {
    expect(MARKETPLACE_V2_BUY_ORDER_LIMIT).toBe(10);
    expect(MARKETPLACE_V2_BUY_ORDER_MAX_DAYS).toBe(7);
    expect(MARKETPLACE_V2_BUY_ORDER_ESCROW_MAX).toBe(999_999_999);
  });

  it("장비 주문의 최저가는 NPC 매입가와 같고 임의 ID는 거부한다", () => {
    const item = V2_EQUIPMENT.v2_wooden_bow;
    expect(equipmentBuyOrderMinimumPrice(item.id)).toBe(sellPriceOf(item));
    expect(equipmentBuyOrderMinimumPrice("v2_missing_equipment")).toBeNull();
  });
});

describe("tradable 판정 + 이름 스냅샷", () => {
  it("실재 장비 id 만 isTradableEquip", () => {
    const someId = Object.keys(V2_EQUIPMENT)[0];
    expect(isTradableEquip(someId)).toBe(true);
    expect(isTradableEquip("v2_does_not_exist")).toBe(false);
    // prototype 오염 방지 — hasOwnProperty 사용.
    expect(isTradableEquip("toString")).toBe(false);
    expect(isTradableEquip("constructor")).toBe(false);
  });

  it("장비 등록은 미강화·미잠금·미장착 개체만 허용한다", () => {
    const id = Object.keys(V2_EQUIPMENT)[0] as keyof typeof V2_EQUIPMENT;
    expect(marketplaceEquipListError({ id }, false)).toBeNull();
    expect(
      marketplaceEquipListError(
        { id, enhance: { level: 1, bonusPct: 1 } },
        false,
      ),
    ).toBe("enhanced");
    expect(marketplaceEquipListError({ id, locked: true }, false)).toBe(
      "locked",
    );
    expect(marketplaceEquipListError({ id }, true)).toBe("equipped");
  });

  it("채광·생활 가공 재료를 포함한 등재 재료 중 비활성 재련석을 제외해 tradable", () => {
    expect(Object.keys(V2_MATERIALS)).toHaveLength(93);
    for (const id of Object.keys(V2_MATERIALS)) {
      expect(isTradableMaterial(id)).toBe(
        id !== "v2_reforge_stone" && id !== "v2_reforge_stone_high",
      );
    }
    expect(isTradableMaterial("nope")).toBe(false);
    expect(isTradableMaterial("toString")).toBe(false);
  });

  it("itemDisplayName — 장비/등재 재료는 카탈로그 표시명, 미존재면 null", () => {
    const eqId = Object.keys(V2_EQUIPMENT)[0];
    expect(itemDisplayName("equip", eqId)).toBe(V2_EQUIPMENT[eqId as keyof typeof V2_EQUIPMENT].name);
    expect(itemDisplayName("equip", "nope")).toBeNull();
    const matId = Object.keys(V2_MATERIALS)[0];
    expect(itemDisplayName("material", matId)).toBe(V2_MATERIALS[matId].name);
    expect(itemDisplayName("material", "nope")).toBeNull();
    for (const fish of Object.values(DANGEROUS_FISH)) {
      expect(itemDisplayName("material", dangerousCatchMaterialId(fish.id))).toBe(
        fish.name,
      );
    }
    for (const boss of Object.values(DANGEROUS_BOSSES)) {
      expect(itemDisplayName("material", dangerousBossMaterialId(boss.id))).toBe(
        `${boss.name}의 증표`,
      );
    }
    expect(itemDisplayName("consumable", "rename_permit")).toBe(
      MUSEUN_CASH_ITEMS.rename_permit.name,
    );
    const foodId = cookingFoodId({
      recipeId: "rustic_bread",
      quality: "careful",
      originator: true,
      specialtyBonusPct: 5,
    });
    expect(itemDisplayName("consumable", foodId)).toBe(
      "투박한 밀빵 (정성작 · 원조 · 전문 +5%)",
    );
    expect(itemDisplayName("consumable", "nope")).toBeNull();
  });

  it("currentMarketplaceItemName — 장비/재료는 현재 카탈로그명, 소모품은 스냅샷명 유지", () => {
    const eqId = Object.keys(V2_EQUIPMENT)[0];
    const matId = Object.keys(V2_MATERIALS)[0];
    expect(currentMarketplaceItemName("equip", eqId, "옛 장비명")).toBe(
      V2_EQUIPMENT[eqId as keyof typeof V2_EQUIPMENT].name,
    );
    expect(currentMarketplaceItemName("material", matId, "옛 재료명")).toBe(
      V2_MATERIALS[matId].name,
    );
    expect(
      currentMarketplaceItemName("consumable", "rare_map", "희귀 지도 (깊이 12)"),
    ).toBe("희귀 지도 (깊이 12)");
    expect(
      currentMarketplaceItemName(
        "consumable",
        "rename_permit",
        "옛 개명권 이름",
      ),
    ).toBe(MUSEUN_CASH_ITEMS.rename_permit.name);
    const foodId = cookingFoodId({
      recipeId: "rustic_bread",
      quality: "normal",
      originator: false,
      specialtyBonusPct: 0,
    });
    expect(
      currentMarketplaceItemName("consumable", foodId, "옛 음식 이름"),
    ).toBe("투박한 밀빵 (일반)");
    expect(currentMarketplaceItemName("gold", "coin", "골드")).toBe("골드");
  });
});
