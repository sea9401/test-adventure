import { describe, expect, it } from "vitest";
import { autoHuntRequestPlan } from "./autoHuntRequestPolicy";

describe("autoHuntRequestPlan", () => {
  it("스태미나 모드 기본 1회 선택을 5회 batch와 판수 비례 간격으로 바꾼다", () => {
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
    [10, 15_000],
    [50, 75_000],
    [100, 150_000],
  ] as const)("선택한 %i회 batch는 %ims 뒤 다음 요청을 보낸다", (count, intervalMs) => {
    expect(
      autoHuntRequestPlan({
        selectedCount: count,
        coreLoopOn: false,
        rareMap: false,
      }),
    ).toEqual({ count, intervalMs });
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
