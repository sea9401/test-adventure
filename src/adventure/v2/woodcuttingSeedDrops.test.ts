import { describe, expect, it } from "vitest";
import {
  WOODCUTTING_ANY_SEED_DROP_CHANCE_PER_MILLION,
  WOODCUTTING_SEED_DROP_RATES,
  rollWoodcuttingSeedDrop,
} from "./woodcuttingSeedDrops";

import { woodcuttingPost50Bonuses } from "./lifeLevelBonuses";

describe("woodcuttingSeedDrops", () => {
  it("성공 1회당 전체 씨앗 발견률을 약 1.5%로 제한한다", () => {
    expect(WOODCUTTING_ANY_SEED_DROP_CHANCE_PER_MILLION).toBe(14_950);
  });

  it("고등급 작물일수록 등급별 최대 발견률이 더 낮다", () => {
    const ratesByGrade = new Map<number, number[]>();
    for (const entry of WOODCUTTING_SEED_DROP_RATES) {
      ratesByGrade.set(entry.grade, [
        ...(ratesByGrade.get(entry.grade) ?? []),
        entry.chancePerMillion,
      ]);
    }
    for (let grade = 2; grade <= 6; grade += 1) {
      const previous = ratesByGrade.get(grade - 1) ?? [];
      const current = ratesByGrade.get(grade) ?? [];
      expect(Math.max(...current)).toBeLessThan(Math.min(...previous));
    }
  });

  it("단일 롤로 씨앗 1개를 고르고 총합 경계 이후는 꽝륽이다", () => {
    expect(rollWoodcuttingSeedDrop(() => 0)).toEqual({
      cropId: "wheat",
      seedName: "밀 씨앗",
      quantity: 1,
    });
    expect(rollWoodcuttingSeedDrop(() => 0.01493)).toEqual({
      cropId: "cacao",
      seedName: "카카오 묘목",
      quantity: 1,
    });
    expect(rollWoodcuttingSeedDrop(() => 0.01495)).toBeNull();
    expect(rollWoodcuttingSeedDrop(() => 0.99)).toBeNull();
  });

  it("추가 확률은 기존 씨앗 분포를 유지한다", () => {
    expect(rollWoodcuttingSeedDrop(() => 0.01495)).toBeNull();
    expect(rollWoodcuttingSeedDrop(() => 0.01495, 0.5)).toEqual({
      cropId: "wheat",
      seedName: "밀 씨앗",
      quantity: 1,
    });
  });
});

it("100레벨은 성공당 5% 경계까지 씨앗 1개를 발견한다", () => {
  const bonus = woodcuttingPost50Bonuses(100).seedChancePct;
  expect(rollWoodcuttingSeedDrop(() => 0.049999, bonus)?.quantity).toBe(1);
  expect(rollWoodcuttingSeedDrop(() => 0.05, bonus)).toBeNull();
});
