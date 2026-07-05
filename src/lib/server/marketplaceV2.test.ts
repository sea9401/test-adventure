import { describe, expect, it } from "vitest";
import { V2_EQUIPMENT } from "@/adventure/data/v2/v2Equipment";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import {
  MARKETPLACE_V2_MATERIAL_QTY_MAX,
  MARKETPLACE_V2_PRICE_MAX,
  MARKETPLACE_V2_TAX_RATE,
  isMarketKind,
  isTradableEquip,
  isTradableMaterial,
  isValidMaterialQty,
  isValidPrice,
  itemDisplayName,
  saleProceeds,
  saleTax,
} from "./marketplaceV2";

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

  it("5% 세율 — price 100 → 판매자 95 / 소각 5", () => {
    expect(MARKETPLACE_V2_TAX_RATE).toBe(0.05);
    expect(saleProceeds(100)).toBe(95);
    expect(saleTax(100)).toBe(5);
  });

  it("내림 처리 — price 19 → proceeds 18(floor 18.05) / 세금 1", () => {
    expect(saleProceeds(19)).toBe(18);
    expect(saleTax(19)).toBe(1);
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

describe("isMarketKind", () => {
  it("equip/material 만", () => {
    expect(isMarketKind("equip")).toBe(true);
    expect(isMarketKind("material")).toBe(true);
    expect(isMarketKind("gold")).toBe(false);
    expect(isMarketKind(null)).toBe(false);
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

  it("재료 = 기존 17종 + 협동 보스 보상 13종 — 등재 재료만 tradable", () => {
    expect(Object.keys(V2_MATERIALS)).toHaveLength(30);
    for (const id of Object.keys(V2_MATERIALS)) {
      expect(isTradableMaterial(id)).toBe(true);
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
  });
});
