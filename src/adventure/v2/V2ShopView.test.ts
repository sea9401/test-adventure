import { describe, expect, it } from "vitest";
import {
  V2_EQUIPMENT,
  shopPriceForSell,
  type V2EquipInstance,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { shopSellEquipmentInstances } from "./V2ShopView";

describe("shopSellEquipmentInstances", () => {
  it("keeps same-name equipment as separate selectable instances", () => {
    const item = Object.values(V2_EQUIPMENT).find(
      (candidate) =>
        candidate.slot === "weapon" && shopPriceForSell(candidate) != null,
    );
    expect(item).toBeDefined();
    const id = item?.id as V2EquipmentId;
    const owned: V2EquipInstance[] = [
      {
        iid: "same-item-low",
        id,
        roll: { power: 10, weight: 5 },
      },
      {
        iid: "same-item-high",
        id,
        roll: { power: 20, weight: 3 },
      },
    ];

    const result = shopSellEquipmentInstances(owned, "weapon");

    expect(result).toHaveLength(2);
    expect(result.map((instance) => instance.iid).sort()).toEqual([
      "same-item-high",
      "same-item-low",
    ]);
    expect(result[0]).not.toBe(result[1]);
  });
});
