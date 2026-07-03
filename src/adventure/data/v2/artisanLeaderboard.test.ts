import { describe, expect, it } from "vitest";
import {
  addArtisanWeeklyWorkshopCraft,
  artisanLeaderboardNextReward,
  artisanLeaderboardRewardViews,
  artisanLeaderboardRewardFame,
  artisanLeaderboardRewardTitleIds,
  parseArtisanWeeklyWorkshopStats,
  rankArtisanLeaderboardEntries,
} from "./artisanLeaderboard";

describe("artisanLeaderboardRewardTitleIds", () => {
  it("returns all rank rewards for first place", () => {
    expect(artisanLeaderboardRewardTitleIds(1)).toEqual([
      "artisan_rank_top1",
      "artisan_rank_top3",
      "artisan_rank_top10",
      "artisan_rank_participant",
    ]);
  });

  it("returns tiered rewards by rank", () => {
    expect(artisanLeaderboardRewardTitleIds(3)).toEqual([
      "artisan_rank_top3",
      "artisan_rank_top10",
      "artisan_rank_participant",
    ]);
    expect(artisanLeaderboardRewardTitleIds(10)).toEqual([
      "artisan_rank_top10",
      "artisan_rank_participant",
    ]);
    expect(artisanLeaderboardRewardTitleIds(11)).toEqual([
      "artisan_rank_participant",
    ]);
  });

  it("ignores missing or invalid ranks", () => {
    expect(artisanLeaderboardRewardTitleIds(null)).toEqual([]);
    expect(artisanLeaderboardRewardTitleIds(0)).toEqual([]);
  });

  it("sums guild fame for newly granted reward titles", () => {
    expect(
      artisanLeaderboardRewardFame([
        "artisan_rank_top3",
        "artisan_rank_top10",
        "artisan_rank_participant",
      ]),
    ).toBe(120);
    expect(artisanLeaderboardRewardFame([])).toBe(0);
  });

  it("shows the next competitive reward target", () => {
    expect(artisanLeaderboardNextReward(11)).toMatchObject({
      titleId: "artisan_rank_top10",
      ranksToGo: 1,
    });
    expect(artisanLeaderboardNextReward(4)).toMatchObject({
      titleId: "artisan_rank_top3",
      ranksToGo: 1,
    });
    expect(artisanLeaderboardNextReward(1)).toBeNull();
    expect(artisanLeaderboardNextReward(null)).toBeNull();
  });

  it("parses and rolls weekly workshop stats by week key", () => {
    expect(
      parseArtisanWeeklyWorkshopStats(
        { weekKey: "2026-W01", totalCrafts: 3.9, qualityCrafts: 1, xp: 20 },
        "2026-W01",
      ),
    ).toMatchObject({ totalCrafts: 3, qualityCrafts: 1, xp: 20 });
    expect(
      parseArtisanWeeklyWorkshopStats(
        { weekKey: "2026-W01", totalCrafts: 3, qualityCrafts: 1, xp: 20 },
        "2026-W02",
      ),
    ).toEqual({ weekKey: "2026-W02", totalCrafts: 0, qualityCrafts: 0, xp: 0 });
  });

  it("increments weekly workshop stats", () => {
    expect(
      addArtisanWeeklyWorkshopCraft(
        { weekKey: "2026-W01", totalCrafts: 1, qualityCrafts: 0, xp: 10 },
        { qualityCrafted: true, xp: 12 },
      ),
    ).toEqual({
      weekKey: "2026-W01",
      totalCrafts: 2,
      qualityCrafts: 1,
      xp: 22,
    });
  });

  it("ranks weekly leaderboard by crafts, quality crafts, then weekly xp", () => {
    expect(
      rankArtisanLeaderboardEntries([
        { userId: "no-week", totalCrafts: 0, qualityCrafts: 0, weeklyXp: 0 },
        { userId: "b", totalCrafts: 3, qualityCrafts: 0, weeklyXp: 200 },
        { userId: "a", totalCrafts: 3, qualityCrafts: 1, weeklyXp: 10 },
        { userId: "c", totalCrafts: 2, qualityCrafts: 2, weeklyXp: 999 },
      ]).map((entry) => entry.userId),
    ).toEqual(["a", "b", "c"]);
  });

  it("marks leaderboard rewards claimable by owned title and season claim state", () => {
    const owned = new Set(["artisan_rank_top10"]);
    expect(
      artisanLeaderboardRewardViews(3, owned, false).map((reward) => ({
        titleId: reward.titleId,
        claimable: reward.claimable,
        owned: reward.owned,
      })),
    ).toEqual([
      { titleId: "artisan_rank_top1", claimable: false, owned: false },
      { titleId: "artisan_rank_top3", claimable: true, owned: false },
      { titleId: "artisan_rank_top10", claimable: true, owned: true },
      { titleId: "artisan_rank_participant", claimable: true, owned: false },
    ]);
    expect(
      artisanLeaderboardRewardViews(3, owned, true).find(
        (reward) => reward.titleId === "artisan_rank_top10",
      )?.claimable,
    ).toBe(false);
  });

  it("keeps live season leaderboard rewards locked until the season is settled", () => {
    expect(
      artisanLeaderboardRewardViews(1, new Set(), false, false).some(
        (reward) => reward.claimable,
      ),
    ).toBe(false);
  });
});
