import { describe, expect, it } from "vitest";
import { classifyRewardFailure } from "./rewardFailureClassification";

describe("reward failure classification", () => {
  it("주간 시설 출처 충돌은 보정 대상이 아닌 정책 차단으로 분류한다", () => {
    expect(
      classifyRewardFailure(
        {
          id: 41,
          userId: "user-1",
          eventType: "reward.failure.guild_training",
          itemId: "weekly_source_conflict",
          detail: { status: 409, drillId: "basic_stance" },
        },
        [],
      ),
    ).toEqual({
      key: "policy_rejection",
      label: "정상 정책 차단",
      tone: "info",
      priority: 10,
      action: "보정하지 않고 제외 처리",
    });
  });

  it("알 수 없는 실패는 기존처럼 미지급 가능성으로 분류한다", () => {
    expect(
      classifyRewardFailure(
        {
          id: 42,
          userId: "user-1",
          eventType: "reward.failure.quest",
          itemId: "database_unavailable",
          detail: null,
        },
        [],
      ),
    ).toMatchObject({
      key: "possible_missing",
      tone: "danger",
    });
  });
});
