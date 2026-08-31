import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
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

export async function readGuildRaidState(userId: string, now = new Date()) {
  const [guild] = await db
    .select({ id: guilds.id, name: guilds.name, emblem: guilds.emblem })
    .from(guildMembers)
    .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
    .where(and(eq(guildMembers.userId, userId), isNull(guilds.disbandedAt)))
    .limit(1);
  if (!guild) return { ok: false as const, error: "no_guild" as const };

  const event = await ensureCurrentGuildRaid(now);
  const [participantRows, scoreRows, memberRows, recentRows, leaderboard] =
    await Promise.all([
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
        .select()
        .from(guildRaidGuildScores)
        .where(
          and(
            eq(guildRaidGuildScores.eventId, event.id),
            eq(guildRaidGuildScores.guildId, guild.id),
          ),
        )
        .limit(1),
      db
        .select()
        .from(guildRaidParticipants)
        .where(
          and(
            eq(guildRaidParticipants.eventId, event.id),
            eq(guildRaidParticipants.guildId, guild.id),
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
        .where(eq(guildRaidAttackLogs.eventId, event.id))
        .orderBy(desc(guildRaidAttackLogs.createdAt))
        .limit(20),
      readGuildRaidLeaderboard(event.id, guild.id),
    ]);
  const participant = participantRows[0] ?? null;
  const score = scoreRows[0] ?? null;
  const today = guildRaidDayKey(now);
  const dailyAttackCount =
    participant?.dayKey === today ? participant.dailyAttackCount : 0;
  const bossKind = parseCoopBossKindId(event.bossKind);
  if (!bossKind) {
    return { ok: false as const, error: "bad_boss" as const };
  }

  return {
    ok: true as const,
    event: {
      id: event.id,
      bossKind,
      status: event.status,
      stage: event.stage,
      hp: event.hp,
      maxHp: event.maxHp,
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
      eligible:
        participant?.eligibleAtSettlement ??
        ((participant?.attackCount ?? 0) >= GUILD_RAID_ELIGIBLE_ATTACKS &&
          (participant?.damage ?? 0) >= 1),
    },
    guild: {
      id: guild.id,
      name: guild.name,
      emblem: guild.emblem,
      damage: score?.damage ?? 0,
      rank: leaderboard.viewer?.rank ?? null,
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
    recentAttacks: recentRows.map((attack) => ({
      id: attack.id,
      name: attack.name,
      guildId: attack.guildId,
      damageDealt: attack.damageDealt,
      stagesCleared: Math.max(0, attack.stageAfter - attack.stageBefore),
      at: attack.createdAt.getTime(),
    })),
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
