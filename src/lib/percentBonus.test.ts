import { describe, expect, it } from "vitest";
import {
  applyAccumulatedPercentBonus,
  applyStochasticPercentBonus,
} from "./percentBonus";

describe("percent bonus rounding", () => {
  it("확정 정수 보너스는 RNG를 쓰지 않고 그대로 지급한다", () => {
    expect(applyStochasticPercentBonus(100, 10, () => 0.99)).toBe(110);
  });

  it("작은 보상의 소수 부분을 확률적으로 지급한다", () => {
    expect(applyStochasticPercentBonus(3, 10, () => 0.29)).toBe(4);
    expect(applyStochasticPercentBonus(3, 10, () => 0.3)).toBe(3);
  });

  it("누적 나머지는 다음 지급으로 이월한다", () => {
    const first = applyAccumulatedPercentBonus(12, 3, 0);
    const second = applyAccumulatedPercentBonus(12, 3, first.remainderPct);
    const third = applyAccumulatedPercentBonus(12, 3, second.remainderPct);

    expect([first.value, second.value, third.value]).toEqual([12, 12, 13]);
    expect(third.remainderPct).toBe(8);
  });
});
