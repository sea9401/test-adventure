import { describe, expect, it } from "vitest";
import { autoHuntRequestPlan } from "./autoHuntRequestPolicy";

describe("autoHuntRequestPlan", () => {
  it.each([
    1,
    5,
    10,
    50,
    100,
  ] as const)("%i회가 선택돼도 자동사냥은 1회씩 1.5초 간격으로 진행한다", (selectedCount) => {
    expect(
      autoHuntRequestPlan({
        selectedCount,
        coreLoopOn: false,
        rareMap: false,
      }),
    ).toEqual({ count: 1, intervalMs: 1_500 });
  });

  it.each([
    { coreLoopOn: true, rareMap: false },
    { coreLoopOn: false, rareMap: true },
  ])("코어 쿨다운·희귀 지도는 단판 cadence를 유지한다", (mode) => {
    expect(autoHuntRequestPlan({ selectedCount: 50, ...mode })).toEqual({
      count: 1,
      intervalMs: 1_500,
    });
  });
});
