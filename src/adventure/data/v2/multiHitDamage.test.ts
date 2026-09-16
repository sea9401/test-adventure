import { describe, expect, it } from "vitest";
import { multiHitDamage } from "./multiHitDamage";

describe("연타 총계수 분배", () => {
  it.each([1, 2, 5])("총계수 2를 %i타로 나눠도 총위력이 늘지 않는다", (hitCount) => {
    const effects = multiHitDamage({ hitCount, totalStatCoef: 2, totalBaseFlat: 100 });
    expect(effects).toHaveLength(hitCount);
    expect(effects.reduce((sum, hit) => sum + hit.statCoef, 0)).toBeCloseTo(2);
    expect(effects.reduce((sum, hit) => sum + (hit.baseFlat ?? 0), 0)).toBe(100);
  });

  it("천룡난무의 힘 총계수 6을 분배해 기존 타격당 1.2를 보존한다", () => {
    const effects = multiHitDamage({
      hitCount: 5, totalStatCoef: 1.8, totalBaseFlat: 750, totalPrimaryStatCoef: 6,
    });
    expect(effects).toEqual(Array.from({ length: 5 }, () => ({
      kind: "damage", statCoef: 0.36, baseFlat: 150, primaryStatCoef: 1.2,
    })));
  });

  it("소수 합계를 분배해도 기존 0.42 계수의 반올림 오차가 생기지 않는다", () => {
    const effects = multiHitDamage({ hitCount: 3, totalStatCoef: 1.26, totalBaseFlat: 315, scaling: "magic" });
    expect(effects[0]).toEqual({ kind: "damage", statCoef: 0.42, baseFlat: 105, scaling: "magic" });
  });
});
