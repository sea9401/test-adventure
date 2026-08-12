import { describe, expect, it } from "vitest";
import { referralProgressStatus } from "./V2ReferralView";

describe("홍보 이벤트 참여자 상태 문구", () => {
  it("탈퇴한 참여자에게 현재 사냥터를 표시하지 않는다", () => {
    expect(
      referralProgressStatus({
        deleted: true,
        currentFrontierDepth: 12,
        completedRewardStages: 3,
      }),
    ).toBe("탈퇴 · 보상 완료 3단계");
  });

  it("활성 참여자에게는 현재 사냥터를 표시한다", () => {
    const status = referralProgressStatus({
      deleted: false,
      currentFrontierDepth: 12,
      completedRewardStages: 3,
    });
    expect(status).toMatch(/^현재 /);
    expect(status).toContain("보상 완료 3단계");
  });
});
