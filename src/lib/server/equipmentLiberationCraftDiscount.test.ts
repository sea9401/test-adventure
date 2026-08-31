import { describe, expect, it } from "vitest";
import {
  discountedPersonalCraftGoldCost,
  equippedPersonalCraftGoldDiscountPct,
} from "./equipmentLiberationCraftDiscount";

const ringEquipment = {
  owned: [
    {
      iid: "discount-ring",
      id: "v2_storm_sanctuary_ring",
      liberation: {
        rank: 1,
        lineCount: 1,
        revision: 1,
        options: [
          { id: "personal_craft_gold_discount_pct", level: 20 },
        ],
      },
    },
  ],
  equipped: { ring: "discount-ring" },
};

describe("equipment liberation personal craft discount", () => {
  it("기본 비용에 할인율을 적용하고 정수 골드로 내림한다", () => {
    expect(discountedPersonalCraftGoldCost(15_000_009, 10)).toBe(13_500_008);
    expect(discountedPersonalCraftGoldCost(1_000, 200)).toBe(0);
    expect(discountedPersonalCraftGoldCost(-1, 10)).toBe(0);
  });

  it("기능이 켜졌을 때 현재 착용 반지의 옵션만 읽는다", () => {
    expect(equippedPersonalCraftGoldDiscountPct(ringEquipment, true)).toBe(10);
    expect(equippedPersonalCraftGoldDiscountPct(ringEquipment, false)).toBe(0);
    expect(
      equippedPersonalCraftGoldDiscountPct(
        { ...ringEquipment, equipped: {} },
        true,
      ),
    ).toBe(0);
  });
});
