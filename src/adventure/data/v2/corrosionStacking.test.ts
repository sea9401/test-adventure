import { describe, expect, it } from "vitest";

import { combineDefReductionPcts } from "./v2CombatConstants";
import {
  V2_SKILLS,
  aggregateEquippedPassives,
  spCostOf,
  type V2SkillId,
} from "./v2Skills";

const CORROSION_LINE = [
  "v2c_venomist_corrosion",
  "v2c_venomancer_corrosion3",
  "v2c_venomlord_sovereign",
  "v2c_plaguebringer_decay",
  "v2c_myriadvenom_body",
] as const satisfies readonly V2SkillId[];

describe("부식 방어 감소 곱연산", () => {
  it("단일 부식 수치는 그대로 유지한다", () => {
    expect(combineDefReductionPcts(5)).toBeCloseTo(5);
    expect(
      aggregateEquippedPassives(["v2c_venomlord_sovereign"])
        .poisonedEnemyDefReductionPct,
    ).toBeCloseTo(9);
  });

  it("여러 단계는 남은 방어력에 곱연산되어 100%를 넘지 않는다", () => {
    const values = CORROSION_LINE.map(
      (id) => V2_SKILLS[id].passive?.poisonedEnemyDefReductionPct ?? 0,
    );
    const expected = (1 - 0.94 * 0.93 * 0.91 * 0.88 * 0.86) * 100;

    expect(values).toEqual([6, 7, 9, 12, 14]);
    expect(combineDefReductionPcts(...values)).toBeCloseTo(expected);
    expect(
      aggregateEquippedPassives(CORROSION_LINE)
        .poisonedEnemyDefReductionPct,
    ).toBeCloseTo(expected);
    expect(expected).toBeCloseTo(39.79489504);
    expect(expected).toBeLessThan(100);
  });

  it("방어 감소를 자유롭게 모으는 대신 높은 SP 비용을 요구한다", () => {
    expect(CORROSION_LINE.map((id) => spCostOf(V2_SKILLS[id]))).toEqual([
      4, 4, 4, 6, 11,
    ]);
  });

  it("손상된 초과 입력도 100%에서 안전하게 멈춘다", () => {
    expect(combineDefReductionPcts(140, 20)).toBe(100);
    expect(combineDefReductionPcts(Number.NaN, -10, 20)).toBeCloseTo(20);
  });
});
