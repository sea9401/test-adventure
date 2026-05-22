import { describe, it, expect } from "vitest";
import { seasonRewardForRank, SEASON_REWARD_TIERS } from "./seasonRewards";

describe("seasonRewardForRank", () => {
  it("순위 구간별 코인", () => {
    expect(seasonRewardForRank(1)).toBe(1000);
    expect(seasonRewardForRank(2)).toBe(600);
    expect(seasonRewardForRank(3)).toBe(600);
    expect(seasonRewardForRank(4)).toBe(300);
    expect(seasonRewardForRank(10)).toBe(300);
    expect(seasonRewardForRank(11)).toBe(100); // 참가 보상
    expect(seasonRewardForRank(100)).toBe(100);
  });
  it("순위는 1-based, 0/음수는 최상위 구간으로 안 샘 (방어적으로 1위 취급)", () => {
    // 실사용은 항상 i+1(>=1). 경계만 확인 — 첫 구간(maxRank 1)에 0 도 <=1 이라 들어감.
    expect(seasonRewardForRank(0)).toBe(1000);
  });
  it("티어는 maxRank 오름차순 + 코인 내림차순", () => {
    for (let i = 1; i < SEASON_REWARD_TIERS.length; i += 1) {
      expect(SEASON_REWARD_TIERS[i].maxRank).toBeGreaterThan(
        SEASON_REWARD_TIERS[i - 1].maxRank,
      );
      expect(SEASON_REWARD_TIERS[i].coins).toBeLessThan(
        SEASON_REWARD_TIERS[i - 1].coins,
      );
    }
    expect(SEASON_REWARD_TIERS[SEASON_REWARD_TIERS.length - 1].maxRank).toBe(
      Infinity,
    );
  });
});
