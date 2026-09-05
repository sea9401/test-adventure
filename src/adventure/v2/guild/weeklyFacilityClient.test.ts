import { describe, expect, it } from "vitest";
import {
  weeklyFacilityActionLimit,
  weeklyFacilityConflictNotice,
} from "./weeklyFacilityClient";

describe("weekly facility client eligibility", () => {
  it.each([
    [false, 3, 0],
    [true, 3, 3],
    [undefined, 3, 3],
    [true, -2, 0],
  ] as const)(
    "eligibility %s limits %s actions to %s",
    (eligible, limit, expected) => {
      expect(weeklyFacilityActionLimit(eligible, limit)).toBe(expected);
    },
  );
});

describe("weekly facility conflict notice", () => {
  it("시설 이름과 다음 초기화 시각을 안내한다", () => {
    expect(weeklyFacilityConflictNotice("훈련장")).toBe(
      "이번 주에는 이전에 선택한 길드의 훈련장만 이용할 수 있습니다. 다음 주 월요일 00:00 KST부터 현재 길드 훈련장을 이용할 수 있습니다.",
    );
  });
});
