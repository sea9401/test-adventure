import { describe, expect, it } from "vitest";
import {
  REFERRAL_TUTORIAL_TASKS,
  normalizeReferralProgressTaskIds,
  referralHuntTaskIds,
  referralLegacyTaskIds,
  referralLifeTaskIds,
} from "./referralTutorial";

describe("referral tutorial roadmap", () => {
  it("가입·사냥·길드·생활 과제를 튜토리얼 순서로 제공한다", () => {
    expect(REFERRAL_TUTORIAL_TASKS.map((task) => task.id)).toEqual([
      "signup",
      "hunt_depth_24",
      "join_guild",
      "life_level_5",
      "hunt_depth_36",
      "life_level_10",
    ]);
    expect(REFERRAL_TUTORIAL_TASKS.map((task) => task.staminaPotionsPerUser)).toEqual([
      2,
      2,
      2,
      2,
      2,
      2,
    ]);
  });

  it.each([
    [23, []],
    [24, ["hunt_depth_24"]],
    [35, ["hunt_depth_24"]],
    [36, ["hunt_depth_24", "hunt_depth_36"]],
  ] as const)("사냥 깊이 %s에서 달성한 과제를 계산한다", (depth, expected) => {
    expect(referralHuntTaskIds(depth)).toEqual(expected);
  });

  it.each([
    [4, []],
    [5, ["life_level_5"]],
    [9, ["life_level_5"]],
    [10, ["life_level_5", "life_level_10"]],
  ] as const)("최고 생활 레벨 %s에서 달성한 과제를 계산한다", (level, expected) => {
    expect(referralLifeTaskIds(level)).toEqual(expected);
  });

  it("오염된 완료 목록을 허용된 과제만 로드맵 순서로 정규화한다", () => {
    expect(normalizeReferralProgressTaskIds([
      "life_level_10",
      "unknown",
      "hunt_depth_24",
      "life_level_10",
      "signup",
      36,
    ])).toEqual(["hunt_depth_24", "life_level_10"]);
    expect(normalizeReferralProgressTaskIds("hunt_depth_24")).toEqual([]);
  });

  it.each([
    [0, []],
    [6, ["hunt_depth_24"]],
    [12, ["hunt_depth_24", "join_guild"]],
    [18, ["hunt_depth_24", "join_guild", "life_level_5"]],
    [24, ["hunt_depth_24", "join_guild", "life_level_5", "hunt_depth_36"]],
    [36, ["hunt_depth_24", "join_guild", "life_level_5", "hunt_depth_36", "life_level_10"]],
  ] as const)("기존 지급 깊이 %s를 같은 수의 새 완료 위치로 승계한다", (depth, expected) => {
    expect(referralLegacyTaskIds(depth)).toEqual(expected);
  });
});
