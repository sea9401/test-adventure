import { describe, expect, it } from "vitest";
import { marketplaceBuyOrderDeliveryKind } from "./marketplaceBuyOrdersV2";

describe("거래소 구매 주문 배송 분류", () => {
  it("유효한 물고기 표본만 표본 우편으로 분류한다", () => {
    expect(
      marketplaceBuyOrderDeliveryKind("consumable", "fish_specimen_carp"),
    ).toBe("specimen");
    expect(
      marketplaceBuyOrderDeliveryKind("consumable", "fish_specimen_fake"),
    ).toBeNull();
  });
});
