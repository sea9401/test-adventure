import { describe, expect, it } from "vitest";
import { V2_EQUIPMENT, type V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import {
  equippedInstanceForMarketplaceItem,
  equippedItemIdsForMarketplace,
} from "./equipmentComparison";

const owned: V2EquipInstance[] = [
  { iid: "worn-weapon", id: "v2_iron_sword" },
  { iid: "worn-armor", id: "v2_leather_armor" },
];
const equipped = {
  weapon: "worn-weapon",
  armor: "worn-armor",
};

describe("거래소 장비 비교 대상", () => {
  it("거래소 후보와 같은 슬롯에 현재 장착한 개체를 찾는다", () => {
    expect(
      equippedInstanceForMarketplaceItem(
        V2_EQUIPMENT.v2_greatsword,
        owned,
        equipped,
      ),
    ).toEqual(owned[0]);
  });

  it("현재 장착 장비 id 집합을 세트 판정용으로 만든다", () => {
    expect([...equippedItemIdsForMarketplace(owned, equipped)]).toEqual([
      "v2_iron_sword",
      "v2_leather_armor",
    ]);
  });
});
