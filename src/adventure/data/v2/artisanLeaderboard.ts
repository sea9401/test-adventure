import type { TitleId } from "@/adventure/data/titles";

export type ArtisanWeeklyWorkshopStats = {
  weekKey: string;
  totalCrafts: number;
  qualityCrafts: number;
  xp: number;
  claimedRewardWeekKey?: string | null;
};

export type ArtisanLeaderboardRankInput = {
  userId: string;
  totalCrafts: number;
  qualityCrafts: number;
  weeklyXp: number;
};

export type ArtisanLeaderboardReward = {
  rank: number;
  titleId: TitleId;
  label: string;
  rewardFame: number;
};

export type ArtisanLeaderboardNextReward = {
  rank: number;
  label: string;
  titleId: TitleId;
  rewardFame: number;
  ranksToGo: number;
};

export const ARTISAN_LEADERBOARD_PARTICIPATION_RANK = Number.MAX_SAFE_INTEGER;

export const ARTISAN_LEADERBOARD_REWARDS: readonly ArtisanLeaderboardReward[] =
  [
    {
      rank: 1,
      titleId: "artisan_rank_top1",
      label: "대장장이 랭킹 1위",
      rewardFame: 120,
    },
    {
      rank: 3,
      titleId: "artisan_rank_top3",
      label: "대장장이 랭킹 3위 이내",
      rewardFame: 70,
    },
    {
      rank: 10,
      titleId: "artisan_rank_top10",
      label: "대장장이 랭킹 10위 이내",
      rewardFame: 35,
    },
    {
      rank: ARTISAN_LEADERBOARD_PARTICIPATION_RANK,
      titleId: "artisan_rank_participant",
      label: "대장장이 시즌 참여",
      rewardFame: 15,
    },
  ];

const ARTISAN_LEADERBOARD_COMPETITIVE_REWARDS =
  ARTISAN_LEADERBOARD_REWARDS.filter(
    (reward) => reward.rank !== ARTISAN_LEADERBOARD_PARTICIPATION_RANK,
  );

export function artisanLeaderboardRewardTitleIds(
  rank: number | null | undefined,
): TitleId[] {
  if (!Number.isFinite(rank) || !rank || rank < 1) return [];
  return ARTISAN_LEADERBOARD_REWARDS.filter((reward) => rank <= reward.rank).map(
    (reward) => reward.titleId,
  );
}

export function artisanLeaderboardRewardFame(titleIds: readonly TitleId[]): number {
  const titleSet = new Set(titleIds);
  return ARTISAN_LEADERBOARD_REWARDS.filter((reward) =>
    titleSet.has(reward.titleId),
  ).reduce((sum, reward) => sum + reward.rewardFame, 0);
}

export function artisanLeaderboardNextReward(
  rank: number | null | undefined,
): ArtisanLeaderboardNextReward | null {
  if (!Number.isFinite(rank) || !rank || rank < 1) return null;
  const next = ARTISAN_LEADERBOARD_COMPETITIVE_REWARDS.slice()
    .reverse()
    .find((reward) => rank > reward.rank);
  if (!next) return null;
  return {
    ...next,
    ranksToGo: rank - next.rank,
  };
}

export function rankArtisanLeaderboardEntries<T extends ArtisanLeaderboardRankInput>(
  entries: readonly T[],
): T[] {
  return entries
    .filter(
      (entry) =>
        entry.totalCrafts > 0 ||
        entry.qualityCrafts > 0 ||
        entry.weeklyXp > 0,
    )
    .slice()
    .sort((a, b) => {
      if (b.totalCrafts !== a.totalCrafts) return b.totalCrafts - a.totalCrafts;
      if (b.qualityCrafts !== a.qualityCrafts) {
        return b.qualityCrafts - a.qualityCrafts;
      }
      if (b.weeklyXp !== a.weeklyXp) return b.weeklyXp - a.weeklyXp;
      return a.userId.localeCompare(b.userId);
    });
}

export function artisanLeaderboardRewardViews(
  myRank: number | null,
  ownedTitleIds: ReadonlySet<string>,
  seasonRewardClaimed: boolean,
  rewardsOpen = true,
) {
  return ARTISAN_LEADERBOARD_REWARDS.map((reward) => ({
    ...reward,
    owned: ownedTitleIds.has(reward.titleId),
    eligible: myRank != null && myRank <= reward.rank,
    seasonRewardClaimed,
    claimable:
      rewardsOpen &&
      myRank != null &&
      myRank <= reward.rank &&
      (!ownedTitleIds.has(reward.titleId) || !seasonRewardClaimed),
  }));
}

export function parseArtisanWeeklyWorkshopStats(
  raw: unknown,
  weekKey: string,
): ArtisanWeeklyWorkshopStats {
  const obj =
    raw != null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  if (obj.weekKey !== weekKey) {
    return { weekKey, totalCrafts: 0, qualityCrafts: 0, xp: 0 };
  }
  const claimedRewardWeekKey =
    typeof obj.claimedRewardWeekKey === "string"
      ? obj.claimedRewardWeekKey
      : null;
  return {
    weekKey,
    totalCrafts: Math.max(0, Math.floor(Number(obj.totalCrafts) || 0)),
    qualityCrafts: Math.max(0, Math.floor(Number(obj.qualityCrafts) || 0)),
    xp: Math.max(0, Math.floor(Number(obj.xp) || 0)),
    ...(claimedRewardWeekKey ? { claimedRewardWeekKey } : {}),
  };
}

export function addArtisanWeeklyWorkshopCraft(
  stats: ArtisanWeeklyWorkshopStats,
  opts: { qualityCrafted: boolean; xp: number },
): ArtisanWeeklyWorkshopStats {
  return {
    ...stats,
    totalCrafts: stats.totalCrafts + 1,
    qualityCrafts: stats.qualityCrafts + (opts.qualityCrafted ? 1 : 0),
    xp: stats.xp + Math.max(0, Math.floor(opts.xp)),
  };
}
