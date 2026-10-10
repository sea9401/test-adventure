import { describe, expect, it } from "vitest";
import { trainingClaimableCountOf } from "./trainingGroundClient";

describe("training claimable count", () => {
  it("서버가 계산한 가능 수량을 그대로 쓴다", () => {
    expect(
      trainingClaimableCountOf({
        ok: true,
        claimableCount: 2,
      }),
    ).toBe(2);
  });
});

describe("주간 훈련 보너스 안내", () => {
  const weekly = {
    weekKey: "2026-10-12",
    completed: 3,
    target: 5,
    bonusMastery: 30,
    bonusClaimed: false,
  };
  it("1단계 보너스 전에는 1단계 안내", async () => {
    const { guildTrainingWeeklyHint } = await import("./trainingGroundClient");
    expect(guildTrainingWeeklyHint(weekly)).toBe("이번 주 5회 훈련 완료 시 숙련도 +30");
  });
  it("1단계 수령 후 Lv.9 이상이면 2단계 안내", async () => {
    const { guildTrainingWeeklyHint } = await import("./trainingGroundClient");
    const second = { ...weekly, bonusClaimed: true, second: { target: 10, bonusMastery: 60, claimed: false } };
    expect(guildTrainingWeeklyHint(second)).toBe("이번 주 10회 훈련 완료 시 숙련도 +60 추가");
    expect(guildTrainingWeeklyHint({ ...second, second: { ...second.second, claimed: true } })).toBeNull();
    expect(guildTrainingWeeklyHint({ ...weekly, bonusClaimed: true })).toBeNull();
  });
});
