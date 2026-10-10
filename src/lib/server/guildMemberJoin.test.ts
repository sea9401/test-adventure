import { describe, expect, it, vi } from "vitest";

const { rewardTasks } = vi.hoisted(() => ({
  rewardTasks: vi.fn(async () => ({
    staminaPotions: 0,
    newlyCompletedTaskIds: [],
    completedTaskIds: [],
  })),
}));

vi.mock("@/lib/server/referrals", () => ({
  rewardReferralTutorialTasks: rewardTasks,
}));

import { addGuildMember } from "./guildMemberJoin";

describe("길드원 추가", () => {
  it("길드원 행을 추가하고 추천 튜토리얼 가입 과제를 함께 처리한다", async () => {
    const values = vi.fn(async () => undefined);
    const joinTx = {
      insert: vi.fn(() => ({ values })),
    } as never;

    await addGuildMember(joinTx, "u-join", 7);

    expect(values).toHaveBeenCalledWith({
      guildId: 7,
      userId: "u-join",
      role: "member",
    });
    expect(rewardTasks).toHaveBeenCalledWith(
      joinTx,
      "u-join",
      "새 모험가",
      ["join_guild"],
    );
  });
});
