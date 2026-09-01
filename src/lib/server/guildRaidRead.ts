import "server-only";

import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  guildMembers,
  guildRaidAttackLogs,
  guildRaidEvents,
  guildRaidGuildScores,
  guildRaidParticipants,
  guilds,
} from "@/db/schema";
import {
  GUILD_RAID_DAILY_ATTACKS,
  GUILD_RAID_ELIGIBLE_ATTACKS,
  guildRaidDayKey,
  guildRaidMaxHp,
  guildRaidPhase,
  guildRaidRewardForRank,
  normalizeGuildRaidPage,
} from "@/adventure/data/v2/guildRaid";
import { parseCoopBossKindId } from "@/adventure/data/v2/coopBosses";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  ensureCurrentGuildRaid,
  readGuildRaidLeaderboard,
} from "@/lib/server/guildRaidLifecycle";
import {
  readMuseunCosmeticAppearanceMap,
  readProfileAvatarMap,
} from "@/lib/server/museunCosmetics";

function parseReplayPayload(raw: unknown): ReplayPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const replay = raw as Partial<ReplayPayload>;
  if (!replay.enemy || typeof replay.enemy !== "object") return null;
  if (typeof replay.playerMaxHp !== "number") return null;
  if (typeof replay.playerMaxMp !== "number") return null;
  if (!Array.isArray(replay.log) || replay.log.length === 0) return null;
  return replay as ReplayPayload;
}

export async function readGuildRaidState(
  userId: string,
  now = new Date(),
  pages: { leaderboardPage?: unknown; recentPage?: unknown } = {},
) {
  const event = await ensureCurrentGuildRaid(now);
  const [participantRows, currentGuildRows] = await Promise.all([
    db
      .select()
      .from(guildRaidParticipants)
      .where(
        and(
          eq(guildRaidParticipants.eventId, event.id),
          eq(guildRaidParticipants.userId, userId),
        ),
      )
      .limit(1),
    db
      .select({ id: guilds.id, name: guilds.name, emblem: guilds.emblem })
      .from(guildMembers)
      .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
      .where(and(eq(guildMembers.userId, userId), isNull(guilds.disbandedAt)))
      .limit(1),
  ]);
  const participant = participantRows[0] ?? null;
  const currentGuild = currentGuildRows[0] ?? null;
  const raidGuildId = participant?.guildId ?? currentGuild?.id ?? null;
  if (raidGuildId == null) {
    return { ok: false as const, error: "no_guild" as const };
  }

  const [scoreRows, recentCountRows, leaderboard] = await Promise.all([
    db
      .select()
      .from(guildRaidGuildScores)
      .where(
        and(
          eq(guildRaidGuildScores.eventId, event.id),
          eq(guildRaidGuildScores.guildId, raidGuildId),
        ),
      )
      .limit(1),
    db
      .select({ total: count() })
      .from(guildRaidAttackLogs)
      .where(
        and(
          eq(guildRaidAttackLogs.eventId, event.id),
          eq(guildRaidAttackLogs.guildId, raidGuildId),
        ),
      ),
    readGuildRaidLeaderboard(
      event.id,
      raidGuildId,
      pages.leaderboardPage,
    ),
  ]);
  const score = scoreRows[0] ?? null;
  const recentTotal = recentCountRows[0]?.total ?? 0;
  const recentPage = normalizeGuildRaidPage(pages.recentPage, recentTotal);
  const [memberRows, recentRows] = await Promise.all([
    db
      .select()
      .from(guildRaidParticipants)
      .where(
        and(
          eq(guildRaidParticipants.eventId, event.id),
          eq(guildRaidParticipants.guildId, raidGuildId),
        ),
      )
      .orderBy(desc(guildRaidParticipants.damage)),
    db
      .select({
        id: guildRaidAttackLogs.id,
        name: guildRaidAttackLogs.name,
        guildId: guildRaidAttackLogs.guildId,
        damageDealt: guildRaidAttackLogs.damageDealt,
        stageBefore: guildRaidAttackLogs.stageBefore,
        stageAfter: guildRaidAttackLogs.stageAfter,
        createdAt: guildRaidAttackLogs.createdAt,
      })
      .from(guildRaidAttackLogs)
      .where(
        and(
          eq(guildRaidAttackLogs.eventId, event.id),
          eq(guildRaidAttackLogs.guildId, raidGuildId),
        ),
      )
      .orderBy(desc(guildRaidAttackLogs.createdAt))
      .offset(recentPage.offset)
      .limit(recentPage.limit),
  ]);
  const today = guildRaidDayKey(now);
  const dailyAttackCount =
    participant?.dayKey === today ? participant.dailyAttackCount : 0;
  const bossKind = parseCoopBossKindId(event.bossKind);
  if (!bossKind) {
    return { ok: false as const, error: "bad_boss" as const };
  }
  const phase = guildRaidPhase(now, event);
  const eligible =
    participant?.eligibleAtSettlement ??
    ((participant?.attackCount ?? 0) >= GUILD_RAID_ELIGIBLE_ATTACKS &&
      (participant?.damage ?? 0) >= 1);
  const rank = leaderboard.viewer?.rank ?? null;
  const reward = rank == null ? null : guildRaidRewardForRank(rank);
  const initialMaxHp = guildRaidMaxHp(1);
  const currentGuildMatches = currentGuild?.id === raidGuildId;

  return {
    ok: true as const,
    event: {
      id: event.id,
      bossKind,
      status: event.status,
      phase,
      stage: score?.stage ?? 1,
      hp: score?.hp ?? initialMaxHp,
      maxHp: score?.maxHp ?? initialMaxHp,
      startsAt: event.startsAt.getTime(),
      endsAt: event.endsAt.getTime(),
      settledAt: event.settledAt?.getTime() ?? null,
    },
    my: {
      lockedGuildId: participant?.guildId ?? null,
      damage: participant?.damage ?? 0,
      attackCount: participant?.attackCount ?? 0,
      dailyAttackCount,
      dailyAttackLimit: GUILD_RAID_DAILY_ATTACKS,
      remainingAttacks: Math.max(0, GUILD_RAID_DAILY_ATTACKS - dailyAttackCount),
      eligible,
      rewardClaimedAt: participant?.rewardClaimedAt?.getTime() ?? null,
      reward,
      canClaim:
        phase === "claim" &&
        eligible &&
        participant?.rewardClaimedAt == null &&
        reward != null,
    },
    guild: {
      id: raidGuildId,
      name:
        score?.guildNameSnapshot ??
        (currentGuildMatches ? currentGuild.name : "이전 길드"),
      emblem:
        score?.guildEmblemSnapshot ??
        (currentGuildMatches ? currentGuild.emblem : null),
      damage: score?.damage ?? 0,
      rank,
    },
    members: memberRows.map((member) => ({
      userId: member.userId,
      name: member.nameSnapshot,
      damage: member.damage,
      attackCount: member.attackCount,
      eligible:
        member.eligibleAtSettlement ??
        (member.attackCount >= GUILD_RAID_ELIGIBLE_ATTACKS && member.damage >= 1),
    })),
    leaderboard: leaderboard.rows.map((row) => ({
      guildId: row.guildId,
      guildName: row.guildName,
      guildEmblem: row.guildEmblem,
      damage: row.damage,
      rank: row.rank,
    })),
    leaderboardPagination: leaderboard.pagination,
    recentAttacks: recentRows.map((attack) => ({
      id: attack.id,
      name: attack.name,
      guildId: attack.guildId,
      damageDealt: attack.damageDealt,
      stagesCleared: Math.max(0, attack.stageAfter - attack.stageBefore),
      at: attack.createdAt.getTime(),
    })),
    recentPagination: {
      page: recentPage.page,
      pageSize: recentPage.pageSize,
      totalPages: recentPage.totalPages,
      total: recentTotal,
    },
  };
}

export async function readGuildRaidReplay(userId: string, attackId: number) {
  const [membership] = await db
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, userId))
    .limit(1);
  if (!membership) return null;

  const [row] = await db
    .select({
      id: guildRaidAttackLogs.id,
      userId: guildRaidAttackLogs.userId,
      name: guildRaidAttackLogs.name,
      damageDealt: guildRaidAttackLogs.damageDealt,
      damageTaken: guildRaidAttackLogs.damageTaken,
      diedEarly: guildRaidAttackLogs.diedEarly,
      replay: guildRaidAttackLogs.replay,
      createdAt: guildRaidAttackLogs.createdAt,
      bossKind: guildRaidEvents.bossKind,
    })
    .from(guildRaidAttackLogs)
    .innerJoin(guildRaidEvents, eq(guildRaidEvents.id, guildRaidAttackLogs.eventId))
    .where(eq(guildRaidAttackLogs.id, attackId))
    .limit(1);
  const replay = row ? parseReplayPayload(row.replay) : null;
  const bossKind = row ? parseCoopBossKindId(row.bossKind) : null;
  if (!row || !replay || !bossKind) return null;
  const [avatarByUser, cosmeticByUser] = await Promise.all([
    readProfileAvatarMap([row.userId]),
    readMuseunCosmeticAppearanceMap([row.userId]),
  ]);
  return {
    bossKind,
    attack: {
      id: row.id,
      name: row.name,
      damageDealt: row.damageDealt,
      damageTaken: row.damageTaken,
      diedEarly: row.diedEarly,
      isMe: row.userId === userId,
      avatar: avatarByUser.get(row.userId) ?? "male1",
      profileBorder: cosmeticByUser.get(row.userId)?.profileBorder ?? null,
      replay,
      at: row.createdAt.getTime(),
    },
  };
}
