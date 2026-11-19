import { describe, expect, it } from "vitest";
import { emptyProficiency } from "./proficiency";
import {
  lifeResourceRangesForProficiency,
  masteryGrowthBonus,
  masteryStartingStats,
  statGrowthRanges,
} from "./statGrowth";
import { V2_MASTERY_GROWTH_TAIL_SCALE, masteryGrowthTail } from "./statGrowthMastery";

// 전사 프로필은 힘 가중치가 1이라 숙련도가 그대로 힘 관련 숙련도 합이 된다.
const profAt = (mastery: number) => ({
  ...emptyProficiency(),
  groups: { warrior: { tier: 1, cultivations: 0, cumLevel: mastery } },
  jobCumLevel: { warrior: mastery },
});

describe("숙련도 성장 범위의 선형 항", () => {
  it("관련 숙련도 20만마다 1씩 오른다", () => {
    expect(V2_MASTERY_GROWTH_TAIL_SCALE).toBe(200_000);
    expect(masteryGrowthTail(0)).toBe(0);
    expect(masteryGrowthTail(50_000)).toBeCloseTo(0.25, 12);
    expect(masteryGrowthTail(200_000)).toBe(1);
    expect(masteryGrowthTail(1_000_000)).toBe(5);
    expect(masteryGrowthTail(-10)).toBe(0);
    expect(masteryGrowthTail(Number.NaN)).toBe(0);
  });

  it("레벨업 성장 범위는 로그 항과 선형 항을 더한 값이다", () => {
    for (const mastery of [0, 5_000, 100_000, 600_000, 2_000_000]) {
      const range = statGrowthRanges(profAt(mastery)).str;
      const upper = 1 + Math.log2(1 + mastery / 5_000) + mastery / 200_000;
      expect(range.expected).toBeCloseTo(upper / 2, 10);
      expect(range.lowerMax).toBe(Math.floor(upper));
      expect(range.max).toBe(Math.ceil(upper));
      expect(range.upperProbability).toBeCloseTo(upper - Math.floor(upper), 10);
    }
  });

  it("숙련도가 많이 쌓인 뒤에도 같은 양이 같은 폭으로 범위를 넓힌다", () => {
    const expected = (mastery: number) => statGrowthRanges(profAt(mastery)).str.expected;
    const early = expected(800_000) - expected(600_000);
    const late = expected(4_200_000) - expected(4_000_000);
    // 20만은 선형 항으로 평균 0.5를 더한다. 로그 항의 몫은 뒤로 갈수록 0에 가까워진다.
    expect(early).toBeGreaterThan(0.5);
    expect(late).toBeGreaterThan(0.5);
    expect(late).toBeLessThan(0.55);
  });

  it("재전직 시작 스탯과 HP·MP 성장은 로그 항만 쓴다", () => {
    const prof = profAt(1_000_000);
    expect(masteryStartingStats(prof).str).toBe(15 + Math.floor(22 * Math.log2(201)));
    expect(masteryGrowthBonus(1_000_000)).toBeCloseTo(Math.log2(201), 12);
    const base = lifeResourceRangesForProficiency(emptyProficiency());
    const ranges = lifeResourceRangesForProficiency(prof);
    const shift = 3 * Math.log2(201);
    expect(ranges.hpPerLevel.min).toBe(base.hpPerLevel.min + Math.floor(shift));
  });
});
