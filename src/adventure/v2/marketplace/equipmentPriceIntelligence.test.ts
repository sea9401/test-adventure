import { describe, expect, it } from "vitest";
import type { V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import {
  comparableEquipmentPriceStat,
  equipmentComparablePriceKeys,
  equipmentPriceWarning,
} from "./equipmentPriceIntelligence";

const instance: V2EquipInstance = {
  iid: "price-test",
  id: "v2_wooden_bow",
  roll: { power: 20, weight: 0 },
};

describe("equipment price intelligence", () => {
  it("위력·품질이 비슷한 장비를 안정적인 내부 키로 묶는다", () => {
    const keys = equipmentComparablePriceKeys(instance.id, 20, 50);
    expect(keys?.[0]).toContain(`${instance.id}#similar:p`);
    expect(keys?.[0]).toContain(":q2");
  });

  it("표본 두 건 이상인 가장 가까운 시세를 선택한다", () => {
    const keys = equipmentComparablePriceKeys(instance.id, 20, 50)!;
    const fallback = { n: 4, avg: 1_000, min: 900, max: 1_100 };
    expect(
      comparableEquipmentPriceStat(
        {
          [keys[0]]: { n: 1, avg: 2_000, min: 2_000, max: 2_000 },
          [keys[1]]: fallback,
        },
        instance,
      ),
    ).toBe(fallback);
  });

  it("표본 세 건부터 평균의 절반 이하·두 배 이상만 경고한다", () => {
    const stat = { n: 3, avg: 10_000, min: 5_000, max: 20_000 };
    expect(equipmentPriceWarning(5_000, stat)).toBe("low");
    expect(equipmentPriceWarning(20_000, stat)).toBe("high");
    expect(equipmentPriceWarning(12_000, stat)).toBeNull();
    expect(equipmentPriceWarning(1, { ...stat, n: 2 })).toBeNull();
  });
});
