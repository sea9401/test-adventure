import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  grantTitleIfMissingInTx,
  ownedTitleIdsOf,
} from "@/lib/server/grantTitle";
import { logGuildActivity } from "@/lib/server/guildActivityLog";
import { addGuildFame } from "@/lib/server/v2GuildFame";
import { currentGuildWorkshopWeek } from "@/lib/server/guildWorkshopWeekly";
import {
  latestArtisanLeaderboardSnapshotForUser,
  snapshotStaleArtisanLeaderboards,
} from "@/lib/server/artisanLeaderboardSnapshots";
import { TITLES } from "@/adventure/data/titles";
import {
  artisanLeaderboardRewardViews,
  artisanLeaderboardRewardFame,
  artisanLeaderboardNextReward,
  artisanLeaderboardRewardTitleIds,
  parseArtisanWeeklyWorkshopStats,
  rankArtisanLeaderboardEntries,
  type ArtisanLeaderboardRankInput,
} from "@/adventure/data/v2/artisanLeaderboard";
import {
  artisanLevel,
  artisanXpForNextLevel,
  artisanXpIntoLevel,
  parseArtisanState,
} from "@/adventure/data/v2/artisan";
import { parseGuildWorkshopStats } from "@/adventure/data/v2/guildWorkshop";

const RANKING_CACHE_TTL_MS = 30_000;

type BlacksmithRankingEntry = ArtisanLeaderboardRankInput & {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNext: number;
  cumulativeCrafts: number;
};

type RankingCache = {
  rows: BlacksmithRankingEntry[];
  computedAt: number;
  inFlight?: Promise<BlacksmithRankingEntry[]>;
};

const rankingCache = new Map<string, RankingCache>();

async function loadBlacksmithRankingsFresh(weekKey: string) {
  const craftingRows = await db
    .select({ userId: savesKv.userId, value: savesKv.value })
    .from(savesKv)
    .where(eq(savesKv.key, "crafting.v2"));

  return rankArtisanLeaderboardEntries(craftingRows
    .map((row) => {
      const value = (row.value ?? null) as {
        artisan?: unknown;
        workshopStats?: unknown;
        weeklyWorkshopStats?: unknown;
      } | null;
      const artisan = parseArtisanState(value?.artisan);
      const blacksmith = artisan.blacksmith ?? { xp: 0, crafts: 0 };
      const cumulativeStats = parseGuildWorkshopStats(value?.workshopStats);
      const weeklyStats = parseArtisanWeeklyWorkshopStats(
        value?.weeklyWorkshopStats,
        weekKey,
      );
      return {
        userId: row.userId,
        level: artisanLevel(blacksmith),
        xp: blacksmith.xp,
        xpIntoLevel: artisanXpIntoLevel(blacksmith),
        xpForNext: artisanXpForNextLevel(blacksmith),
        totalCrafts: weeklyStats.totalCrafts,
        qualityCrafts: weeklyStats.qualityCrafts,
        weeklyXp: weeklyStats.xp,
        cumulativeCrafts: cumulativeStats.totalCrafts,
      };
    }));
}

async function loadCachedBlacksmithRankings(weekKey: string) {
  const now = Date.now();
  const entry = rankingCache.get(weekKey);
  if (entry && now - entry.computedAt < RANKING_CACHE_TTL_MS) return entry.rows;
  if (entry?.inFlight) return entry.inFlight;

  const promise = loadBlacksmithRankingsFresh(weekKey).then(
    (rows) => {
      rankingCache.set(weekKey, { rows, computedAt: Date.now() });
      return rows;
    },
    (err: unknown) => {
      const e = rankingCache.get(weekKey);
      if (e && e.inFlight === promise) {
        rankingCache.set(weekKey, { rows: e.rows, computedAt: e.computedAt });
      }
      throw err;
    },
  );
  rankingCache.set(weekKey, {
    rows: entry?.rows ?? [],
    computedAt: entry?.computedAt ?? 0,
    inFlight: promise,
  });
  return promise;
}

function currentLeaderboardSeason() {
  const week = currentGuildWorkshopWeek();
  return {
    key: week.key,
    label: `${week.key} 장인 시즌`,
    endsAt: week.endsAt.toISOString(),
    basis: "이번 시즌 제작 횟수 기준",
  };
}

async function loadOwnedTitleIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "adventure-log.v2")))
    .limit(1);
  return new Set(ownedTitleIdsOf(rows[0]?.value));
}

async function loadWeeklyWorkshopStats(userId: string, weekKey: string) {
  const rows = await db
    .select({ value: savesKv.value })
    .from(savesKv)
    .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "crafting.v2")))
    .limit(1);
  const value = (rows[0]?.value ?? null) as
    | { weeklyWorkshopStats?: unknown }
    | null;
  return parseArtisanWeeklyWorkshopStats(value?.weeklyWorkshopStats, weekKey);
}

function rewardViews(
  myRank: number | null,
  ownedTitleIds: Set<string>,
  seasonRewardClaimed: boolean,
) {
  return artisanLeaderboardRewardViews(
    myRank,
    ownedTitleIds,
    seasonRewardClaimed,
  ).map((reward) => ({
    ...reward,
    titleName: TITLES[reward.titleId]?.name ?? reward.label,
  }));
}

// GET /api/v2/artisan/leaderboard — 전체 대장장이 제작 랭킹(top 20 + 내 순위).
export async function GET() {
  const viewerId = await ensureUser();
  if (!viewerId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const season = currentLeaderboardSeason();
  await snapshotStaleArtisanLeaderboards(season.key);
  const [ranked, ownedTitleIds, weeklyStats, previousSeason] = await Promise.all([
    loadCachedBlacksmithRankings(season.key),
    loadOwnedTitleIds(viewerId),
    loadWeeklyWorkshopStats(viewerId, season.key),
    latestArtisanLeaderboardSnapshotForUser(viewerId),
  ]);

  const viewerIndex = ranked.findIndex((entry) => entry.userId === viewerId);
  const top = ranked.slice(0, 20);
  const includeViewer =
    viewerIndex >= 20 ? [...top, ranked[viewerIndex]] : top;
  const userIds = includeViewer.map((entry) => entry.userId);

  const [profileRows, memberRows] = await Promise.all([
    userIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ userId: savesKv.userId, value: savesKv.value })
          .from(savesKv)
          .where(
            and(
              inArray(savesKv.userId, userIds),
              eq(savesKv.key, "character-profile.v2"),
            ),
          ),
    userIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            userId: guildMembers.userId,
            guildId: guildMembers.guildId,
            guildName: guilds.name,
          })
          .from(guildMembers)
          .leftJoin(guilds, eq(guilds.id, guildMembers.guildId))
          .where(inArray(guildMembers.userId, userIds)),
  ]);

  const nameByUser = new Map<string, string>();
  for (const row of profileRows) {
    const value = (row.value ?? null) as { name?: string } | null;
    const name = value?.name?.trim();
    if (name) nameByUser.set(row.userId, name);
  }
  const guildByUser = new Map<string, { id: number; name: string }>();
  for (const row of memberRows) {
    guildByUser.set(row.userId, {
      id: row.guildId,
      name: row.guildName ?? "이름 없는 길드",
    });
  }

  const entries = includeViewer.map((entry) => {
    const guild = guildByUser.get(entry.userId) ?? null;
    return {
      ...entry,
      rank: ranked.findIndex((r) => r.userId === entry.userId) + 1,
      name: nameByUser.get(entry.userId) ?? "모험가",
      guild,
      isMe: entry.userId === viewerId,
    };
  });

  return Response.json({
    ok: true,
    profession: "blacksmith",
    season,
    previousSeason,
    totalRanked: ranked.length,
    myRank: viewerIndex >= 0 ? viewerIndex + 1 : null,
    rewards: rewardViews(
      viewerIndex >= 0 ? viewerIndex + 1 : null,
      ownedTitleIds,
      weeklyStats.claimedRewardWeekKey === season.key,
    ),
    nextReward: artisanLeaderboardNextReward(
      viewerIndex >= 0 ? viewerIndex + 1 : null,
    ),
    entries,
  });
}

// POST /api/v2/artisan/leaderboard — 현재 순위 기준 랭킹 칭호 보상 수령.
export async function POST() {
  const viewerId = await ensureUser();
  if (!viewerId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const season = currentLeaderboardSeason();
  const ranked = await loadBlacksmithRankingsFresh(season.key);
  const viewerIndex = ranked.findIndex((entry) => entry.userId === viewerId);
  const myRank = viewerIndex >= 0 ? viewerIndex + 1 : null;
  const titleIds = artisanLeaderboardRewardTitleIds(myRank);
  if (!myRank || titleIds.length === 0) {
    return Response.json(
      {
        ok: false,
        error: myRank ? "no_reward" : "not_ranked",
        myRank,
        rewards: rewardViews(
          myRank,
          await loadOwnedTitleIds(viewerId),
          (await loadWeeklyWorkshopStats(viewerId, season.key))
            .claimedRewardWeekKey === season.key,
        ),
      },
      { status: 409 },
    );
  }

  const grantedTitles = await db.transaction(async (tx) => {
    const obtainedAt = Date.now();
    const granted: string[] = [];
    const craftingRaw = await lockSaveForUpdate<{
      weeklyWorkshopStats?: unknown;
      [key: string]: unknown;
    }>(tx, viewerId, "crafting.v2", {});
    const weeklyStats = parseArtisanWeeklyWorkshopStats(
      craftingRaw.weeklyWorkshopStats,
      season.key,
    );
    const seasonRewardAlreadyClaimed =
      weeklyStats.claimedRewardWeekKey === season.key;
    for (const titleId of titleIds) {
      if (await grantTitleIfMissingInTx(tx, viewerId, titleId, obtainedAt)) {
        granted.push(titleId);
      }
    }
    const rewardFame = seasonRewardAlreadyClaimed
      ? 0
      : artisanLeaderboardRewardFame(titleIds);
    if (granted.length > 0 || rewardFame > 0) {
      const member = (
        await tx
          .select({ guildId: guildMembers.guildId })
          .from(guildMembers)
          .where(eq(guildMembers.userId, viewerId))
          .limit(1)
      )[0];
      if (member) {
        if (rewardFame > 0) {
          await addGuildFame(tx, member.guildId, rewardFame);
          await upsertSave(tx, viewerId, "crafting.v2", {
            ...craftingRaw,
            weeklyWorkshopStats: {
              ...weeklyStats,
              claimedRewardWeekKey: season.key,
            },
          });
        }
        const bestTitleId = granted[0];
        await logGuildActivity(tx, {
          guildId: member.guildId,
          type: "artisan_rank_reward",
          actorUserId: viewerId,
          meta: {
            artisanRank: myRank,
            titleName: bestTitleId ? TITLES[bestTitleId]?.name : undefined,
            rewardFame,
          },
        });
      }
    }
    return { granted, rewardFame };
  });
  const ownedTitleIds = await loadOwnedTitleIds(viewerId);

  return Response.json({
    ok: true,
    profession: "blacksmith",
    season,
    myRank,
    rewards: rewardViews(myRank, ownedTitleIds, true),
    nextReward: artisanLeaderboardNextReward(myRank),
    grantedTitles: grantedTitles.granted,
    rewardFame: grantedTitles.rewardFame,
  });
}
