import { describe, expect, it } from "vitest";
import { trainingClaimableCountOf } from "./trainingGroundClient";

describe("training claimable count", () => {
  it("주간 시설 출처가 충돌하면 서버의 가능 수량이 남아 있어도 0으로 제한한다", () => {
    expect(
      trainingClaimableCountOf({
        ok: true,
        weeklySourceEligible: false,
        claimableCount: 2,
      }),
    ).toBe(0);
  });

  it("이전 서버 응답에는 기존 가능 수량을 유지한다", () => {
    expect(
      trainingClaimableCountOf({
        ok: true,
        claimableCount: 2,
      }),
    ).toBe(2);
  });
});
