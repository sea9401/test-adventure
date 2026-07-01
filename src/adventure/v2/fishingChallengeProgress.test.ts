import { describe, expect, it } from "vitest";
import {
  countClaimableFishingTasks,
  fishingProgressNotices,
  type FishingProgressTaskView,
} from "./fishingChallengeProgress";

const task = (
  id: string,
  progress: number,
  extra: Partial<FishingProgressTaskView> = {},
): FishingProgressTaskView => {
  const goal = extra.goal ?? 3;
  const complete = extra.complete ?? progress >= goal;
  const claimed = extra.claimed ?? false;
  return {
    id,
    title: extra.title ?? id,
    goal,
    progress,
    complete,
    claimed,
    claimable: extra.claimable ?? (complete && !claimed),
  };
};

describe("fishingProgressNotices", () => {
  it("진행도가 오른 항목과 방금 완료된 항목만 반환한다", () => {
    const notices = fishingProgressNotices(
      "contract",
      [task("a", 1), task("b", 3), task("c", 2)],
      [task("a", 2), task("b", 3), task("c", 3)],
    );

    expect(notices).toEqual([
      expect.objectContaining({
        id: "a",
        delta: 1,
        progress: 2,
        justCompleted: false,
      }),
      expect.objectContaining({
        id: "c",
        delta: 1,
        progress: 3,
        justCompleted: true,
      }),
    ]);
  });
});

describe("countClaimableFishingTasks", () => {
  it("오늘의 의뢰, 일일 과제, 누적 목표의 수령 가능 항목을 합산한다", () => {
    expect(
      countClaimableFishingTasks([
        [task("contract", 3)],
        [task("daily", 1)],
        [task("goal", 3), task("claimed", 3, { claimed: true })],
      ]),
    ).toBe(2);
  });
});
