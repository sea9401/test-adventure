import { describe, expect, it } from "vitest";
import {
  miningDurationForLevel,
  miningFailureRate,
  miningLevelForXp,
  miningProgressionView,
  miningTimeReduction,
  miningXpForLevel,
} from "./miningProgression";

describe("채광 성장", () => {
  it("50레벨까지 완만한 제곱 곡선을 사용한다", () => {
    expect(miningXpForLevel(1)).toBe(0);
    expect(miningXpForLevel(10)).toBe(3_240);
    expect(miningXpForLevel(50)).toBe(96_040);
    expect(miningLevelForXp(96_040)).toBe(50);
  });

  it("레벨별 시간 단축은 최대 10%다", () => {
    expect(miningTimeReduction(1)).toBe(0);
    expect(miningTimeReduction(50)).toBeCloseTo(0.098);
    expect(miningDurationForLevel(10_000, 50)).toBe(9_000);
  });

  it("레벨이 실패율을 곱연산으로 낮춘다", () => {
    expect(miningFailureRate(0.7, 1)).toBeCloseTo(0.7);
    expect(miningFailureRate(0.7, 21)).toBeCloseTo(0.49);
    expect(miningFailureRate(0.7, 50)).toBeCloseTo(0.1855);
  });

  it("저장 XP가 있으면 성공 횟수와 분리해 진행도를 계산한다", () => {
    expect(miningProgressionView(100, 4_000)).toMatchObject({
      level: 11,
      xp: 4_000,
      successes: 100,
    });
  });
});
