import { describe, expect, it } from "vitest";
import {
  parseTreasureAchievementStats,
  reachedTreasureAchievementTitleIds,
  recordTreasureAchievementHit,
  type TreasureAchievementStats,
} from "./treasureAchievements";

const EMPTY: TreasureAchievementStats = {
  successes: 0,
  probeSuccesses: 0,
  bestCondition: 0,
  bestAppraisedValue: 0,
  siteSuccesses: {},
};

describe("treasureAchievements", () => {
  it("발굴 성공 기록을 누적하고 첫 발굴 칭호 조건을 만족한다", () => {
    const next = recordTreasureAchievementHit(EMPTY, {
      siteOptionId: "old_market",
      condition: 72,
      appraisedValue: 1200,
      usedProbe: false,
    });
    expect(next.successes).toBe(1);
    expect(next.siteSuccesses.old_market).toBe(1);
    expect(reachedTreasureAchievementTitleIds(next)).toContain(
      "treasure_first_find",
    );
  });

  it("보존상태, 탐침 성공, 3개 탐사지 조건을 판정한다", () => {
    const stats: TreasureAchievementStats = {
      successes: 10,
      probeSuccesses: 5,
      bestCondition: 91,
      bestAppraisedValue: 5000,
      siteSuccesses: {
        old_market: 4,
        royal_tomb: 3,
        collapsed_shrine: 3,
      },
    };
    expect(reachedTreasureAchievementTitleIds(stats)).toEqual([
      "treasure_first_find",
      "treasure_veteran_excavator",
      "treasure_pristine_keeper",
      "treasure_probe_pathfinder",
      "treasure_three_site_surveyor",
    ]);
  });

  it("손상된 저장값은 안전한 기본값으로 보정한다", () => {
    expect(
      parseTreasureAchievementStats({
        successes: -1,
        probeSuccesses: 2.5,
        bestCondition: 120,
        bestAppraisedValue: 3000,
        siteSuccesses: { old_market: 2, fake: 99 },
      }),
    ).toEqual({
      successes: 0,
      probeSuccesses: 0,
      bestCondition: 100,
      bestAppraisedValue: 3000,
      siteSuccesses: { old_market: 2 },
    });
  });
});
