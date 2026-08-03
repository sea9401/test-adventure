import { describe, expect, it } from "vitest";

import { combineDefReductionPcts } from "./v2CombatConstants";
import {
  V2_SKILLS,
  aggregateEquippedPassives,
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
    expect(combineDefReductionPcts(20)).toBeCloseTo(20);
    expect(
      aggregateEquippedPassives(["v2c_venomlord_sovereign"])
        .poisonedEnemyDefReductionPct,
    ).toBeCloseTo(20);
  });

  it("여러 단계는 남은 방어력에 곱연산되어 100%를 넘지 않는다", () => {
    const values = CORROSION_LINE.map(
      (id) => V2_SKILLS[id].passive?.poisonedEnemyDefReductionPct ?? 0,
    );
    const expected = (1 - 0.9 * 0.85 * 0.8 * 0.75 * 0.7) * 100;

    expect(combineDefReductionPcts(...values)).toBeCloseTo(expected);
    expect(
      aggregateEquippedPassives(CORROSION_LINE)
        .poisonedEnemyDefReductionPct,
    ).toBeCloseTo(expected);
    expect(expected).toBeCloseTo(67.87);
    expect(expected).toBeLessThan(100);
  });

  it("손상된 초과 입력도 100%에서 안전하게 멈춘다", () => {
    expect(combineDefReductionPcts(140, 20)).toBe(100);
    expect(combineDefReductionPcts(Number.NaN, -10, 20)).toBeCloseTo(20);
  });
});
