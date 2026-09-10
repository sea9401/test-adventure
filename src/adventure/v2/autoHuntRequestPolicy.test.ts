import { describe, expect, it } from "vitest";
import { autoHuntRequestPlan } from "./autoHuntRequestPolicy";

describe("autoHuntRequestPlan", () => {
  it("선택 횟수가 100회여도 자동사냥은 5회씩 7.5초 간격으로 반복한다", () => {
    expect(
      autoHuntRequestPlan({
        selectedCount: 100,
        coreLoopOn: false,
        rareMap: false,
      }),
    ).toEqual({ count: 5, intervalMs: 7_500 });
  });

  it("스태미나 자동사냥은 5회 batch와 7.5초 간격을 사용한다", () => {
    expect(
      autoHuntRequestPlan({
        selectedCount: 1,
        coreLoopOn: false,
        rareMap: false,
      }),
    ).toEqual({ count: 5, intervalMs: 7_500 });
  });

  it.each([
    [5, 7_500],
    [10, 7_500],
    [50, 7_500],
    [100, 7_500],
  ] as const)("%i회가 선택돼도 자동사냥은 5회 batch를 %ims마다 보낸다", (selectedCount, intervalMs) => {
    expect(
      autoHuntRequestPlan({
        selectedCount,
        coreLoopOn: false,
        rareMap: false,
      }),
    ).toEqual({ count: 5, intervalMs });
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
