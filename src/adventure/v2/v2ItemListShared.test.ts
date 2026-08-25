import { describe, expect, it } from "vitest";
import { COOP_ALL_EQUIPMENT_BOXES } from "@/adventure/data/v2/coopRewards";
import { SP_FRUIT_TIERS, SP_FRUIT } from "@/adventure/data/v2/spFruit";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import {
  groupEquipInstancesBySlot,
  itemTabForMarketplaceListing,
  itemTabForMaterial,
  nextSortMode,
  sortEquipInstances,
} from "./v2ItemListShared";

describe("itemTabForMaterial", () => {
  it("SP 열매를 인벤토리와 거래소의 소모품 탭으로 분류한다", () => {
    for (const tier of SP_FRUIT_TIERS) {
      expect(itemTabForMaterial(SP_FRUIT[tier].materialId)).toBe("consumable");
      expect(
        itemTabForMarketplaceListing(
          "material",
          SP_FRUIT[tier].materialId,
        ),
      ).toBe("consumable");
    }
  });

  it("협동 장비 상자 전부를 인벤토리와 거래소의 소모품 탭으로 분류한다", () => {
    for (const box of COOP_ALL_EQUIPMENT_BOXES) {
      expect(itemTabForMaterial(box.id)).toBe("consumable");
      expect(itemTabForMarketplaceListing("material", box.id)).toBe(
        "consumable",
      );
    }
  });

  it("일반 재료는 재료 탭으로 분류한다", () => {
    expect(itemTabForMaterial("mana_dust")).toBe("material");
    expect(itemTabForMarketplaceListing("material", "mana_dust")).toBe(
      "material",
    );
    expect(itemTabForMarketplaceListing("consumable", "rare_map")).toBe(
      "consumable",
    );
  });

  it("위험 해역 귀환 어획물을 거래 가능한 재료 탭으로 분류한다", () => {
    expect(itemTabForMaterial("danger_catch_ironjaw_tuna")).toBe("material");
    expect(
      itemTabForMarketplaceListing(
        "material",
        "danger_catch_ironjaw_tuna",
      ),
    ).toBe("material");
  });
});

describe("equipment list sorting", () => {
  it("기본 다음 정렬 기준으로 획득순을 제공한다", () => {
    expect(nextSortMode("default")).toBe("acquired");
  });

  it("마지막에 획득한 장비부터 정렬하고 원본 순서를 유지한다", () => {
    const instances: V2EquipInstance[] = [
      { iid: "first", id: "v2_iron_sword" },
      { iid: "second", id: "v2_greatsword" },
      { iid: "latest", id: "v2_crafted_oathblade" },
    ];

    expect(
      sortEquipInstances(instances, "acquired").map((item) => item.iid),
    ).toEqual(["latest", "second", "first"]);
    expect(instances.map((item) => item.iid)).toEqual([
      "first",
      "second",
      "latest",
    ]);
  });

  it("슬롯별로 나눠도 같은 슬롯 장비의 획득 순서를 보존한다", () => {
    const instances: V2EquipInstance[] = [
      { iid: "older-gloves", id: "v2_crafted_guard_gauntlets" },
      { iid: "other-slot", id: "v2_iron_sword" },
      { iid: "latest-gloves", id: "v2_crafted_focus_gloves" },
    ];

    const grouped = groupEquipInstancesBySlot(instances);

    expect(grouped.gloves.map((item) => item.iid)).toEqual([
      "older-gloves",
      "latest-gloves",
    ]);
    expect(
      sortEquipInstances(grouped.gloves, "acquired").map((item) => item.iid),
    ).toEqual(["latest-gloves", "older-gloves"]);
  });

  it("표시 티어가 높은 장비부터 정렬하고 같은 표시 티어에서는 기본 순서를 유지한다", () => {
    const instances: V2EquipInstance[] = [
      { iid: "tier-1-catalog-2", id: "v2_greatsword" },
      { iid: "tier-3", id: "v2_crafted_sunforge_blade" },
      { iid: "tier-1-catalog-1", id: "v2_iron_sword" },
      { iid: "tier-2", id: "v2_crafted_oathblade" },
    ];

    expect(sortEquipInstances(instances, "tier").map((item) => item.id)).toEqual([
      "v2_crafted_sunforge_blade",
      "v2_crafted_oathblade",
      "v2_iron_sword",
      "v2_greatsword",
    ]);
    expect(instances.map((item) => item.id)).toEqual([
      "v2_greatsword",
      "v2_crafted_sunforge_blade",
      "v2_iron_sword",
      "v2_crafted_oathblade",
    ]);
  });
});
