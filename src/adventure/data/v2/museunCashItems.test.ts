import { describe, expect, it } from "vitest";
import {
  MUSEUN_CASH_ITEMS,
  addMuseunCashItem,
  isMuseunCashItemId,
  parseMuseunCashItems,
  parseMuseunCoinBalance,
  removeMuseunCashItem,
  isTradeableMuseunCashItemId,
} from "./museunCashItems";

describe("무슨 코인 캐시 소모품", () => {
  it("개명 허가증과 30일 지원권의 가격·효과를 고정한다", () => {
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
      tradeable: false,
      effect: { kind: "chroma_name_box" },
    });
  });

  it("카탈로그 id만 캐시 아이템으로 인정한다", () => {
    expect(isMuseunCashItemId("rename_permit")).toBe(true);
    expect(isMuseunCashItemId("adventure_support_30d")).toBe(true);
    expect(isMuseunCashItemId("chroma_name_box")).toBe(true);
    expect(isMuseunCashItemId("toString")).toBe(false);
    expect(isMuseunCashItemId("unknown")).toBe(false);
  });

  it("꾸미기 권리는 계정 귀속이고 인벤토리 아이템만 거래 가능하다", () => {
    expect(isTradeableMuseunCashItemId("rename_permit")).toBe(true);
    expect(isTradeableMuseunCashItemId("adventure_support_30d")).toBe(true);
    expect(isTradeableMuseunCashItemId("prismatic_profile_border")).toBe(
      false,
    );
    expect(
      parseMuseunCashItems({
        rename_permit: 1,
        chroma_name_box: 2,
      }),
    ).toEqual({ rename_permit: 1, chroma_name_box: 2 });
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
