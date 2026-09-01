import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
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
  applyGuildRaidDamage,
  guildRaidDayKey,
  guildRaidMaxHp,
  type GuildRaidStageState,
} from "@/adventure/data/v2/guildRaid";
import {
  parseCoopBossKindId,
  type CoopBossKindId,
} from "@/adventure/data/v2/coopBosses";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import { ensureCurrentGuildRaid } from "@/lib/server/guildRaidLifecycle";
import {
  simulateGuildRaidBattle,
  type GuildRaidBattleResult,
} from "@/lib/server/guildRaidBattle";

export type GuildRaidParticipantMutationState = {
  guildId: number;
  damage: number;
  attackCount: number;
  dayKey: string;
  dailyAttackCount: number;
};

export type GuildRaidAttackMutationInput = {
  now: Date;
  event: {
    id: string;
    bossKind: string;
    status: string;
    endsAt: Date;
  };
  guildProgress: GuildRaidStageState;
  guild: { id: number; name: string; emblem: string | null };
  participant: GuildRaidParticipantMutationState | null;
  existingAttack: { attackId: number; damageDealt: number } | null;
  battle: GuildRaidBattleResult;
  maxHpForStage?: (stage: number) => number;
};

export type GuildRaidAttackMutation =
  | { ok: false; error: "daily_limit" | "guild_locked" | "event_ended" }
  | {
      ok: true;
      alreadyCommitted: true;
      attackId: number;
      damageDealt: number;
    }
  | {
      ok: true;
      alreadyCommitted: false;
      guildProgress: GuildRaidStageState;
      participant: GuildRaidParticipantMutationState;
      guildDamageDelta: number;
      stagesCleared: number;
      battle: GuildRaidBattleResult;
    };

export function validGuildRaidRequestId(value: string): boolean {
  return /^[A-Za-z0-9-]{8,64}$/.test(value);
}

export function resolveGuildRaidAttackMutation(
  input: GuildRaidAttackMutationInput,
): GuildRaidAttackMutation {
  if (input.existingAttack) {
    return {
      ok: true,
      alreadyCommitted: true,
      attackId: input.existingAttack.attackId,
      damageDealt: input.existingAttack.damageDealt,
    };
  }
  if (input.event.status !== "active" || input.event.endsAt <= input.now) {
    return { ok: false, error: "event_ended" };
  }
  if (input.participant && input.participant.guildId !== input.guild.id) {
    return { ok: false, error: "guild_locked" };
  }

  const today = guildRaidDayKey(input.now);
  const dailyAttackCount =
    input.participant?.dayKey === today
      ? input.participant.dailyAttackCount
      : 0;
  if (dailyAttackCount >= GUILD_RAID_DAILY_ATTACKS) {
    return { ok: false, error: "daily_limit" };
  }

  const damage = Math.max(0, Math.floor(input.battle.damageDealt));
  const nextGuildProgress = applyGuildRaidDamage(
    input.guildProgress,
    damage,
    input.maxHpForStage ?? guildRaidMaxHp,
  );
  return {
    ok: true,
    alreadyCommitted: false,
    guildProgress: {
      stage: nextGuildProgress.stage,
      hp: nextGuildProgress.hp,
      maxHp: nextGuildProgress.maxHp,
    },
    participant: {
      guildId: input.participant?.guildId ?? input.guild.id,
      damage: (input.participant?.damage ?? 0) + damage,
      attackCount: (input.participant?.attackCount ?? 0) + 1,
      dayKey: today,
      dailyAttackCount: dailyAttackCount + 1,
    },
    guildDamageDelta: damage,
    stagesCleared: nextGuildProgress.stagesCleared,
    battle: input.battle,
  };
}

export type GuildRaidAttackOutcome =
  | {
      ok: false;
      error:
        | "no_guild"
        | "no_character"
        | "bad_boss"
        | "daily_limit"
        | "guild_locked"
        | "event_ended";
    }
  | {
      ok: true;
      alreadyCommitted: boolean;
      attackId: number;
      damageDealt: number;
      damageTaken: number;
      diedEarly: boolean;
      replay: ReplayPayload;
      stage: number;
      hp: number;
      maxHp: number;
      stagesCleared: number;
      myDamage: number;
      myAttackCount: number;
      dailyAttackCount: number;
    };

function existingOutcome(
  attack: typeof guildRaidAttackLogs.$inferSelect,
  participant: typeof guildRaidParticipants.$inferSelect | null,
): GuildRaidAttackOutcome {
  return {
    ok: true,
    alreadyCommitted: true,
    attackId: attack.id,
    damageDealt: attack.damageDealt,
    damageTaken: attack.damageTaken,
    diedEarly: attack.diedEarly,
    replay: attack.replay as ReplayPayload,
    stage: attack.stageAfter,
    hp: attack.hpAfter,
    maxHp: guildRaidMaxHp(attack.stageAfter),
    stagesCleared: Math.max(0, attack.stageAfter - attack.stageBefore),
    myDamage: participant?.damage ?? attack.damageDealt,
    myAttackCount: participant?.attackCount ?? 1,
    dailyAttackCount: participant?.dailyAttackCount ?? 1,
  };
}

export async function attackGuildRaid({
  userId,
  requestId,
  now = new Date(),
}: {
  userId: string;
  requestId: string;
  now?: Date;
}): Promise<GuildRaidAttackOutcome> {
  const current = await ensureCurrentGuildRaid(now);
  return db.transaction(async (tx) => {
    const [existingBefore] = await tx
      .select()
      .from(guildRaidAttackLogs)
      .where(
        and(
          eq(guildRaidAttackLogs.eventId, current.id),
          eq(guildRaidAttackLogs.userId, userId),
          eq(guildRaidAttackLogs.requestId, requestId),
        ),
      )
      .limit(1);
    if (existingBefore) {
      const [participant] = await tx
        .select()
        .from(guildRaidParticipants)
        .where(
          and(
            eq(guildRaidParticipants.eventId, current.id),
            eq(guildRaidParticipants.userId, userId),
          ),
        )
        .limit(1);
      return existingOutcome(existingBefore, participant ?? null);
    }

    const [guild] = await tx
      .select({ id: guilds.id, name: guilds.name, emblem: guilds.emblem })
      .from(guildMembers)
      .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
      .where(
        and(eq(guildMembers.userId, userId), isNull(guilds.disbandedAt)),
      )
      .limit(1);
    if (!guild) return { ok: false, error: "no_guild" };

    const bossKind = parseCoopBossKindId(current.bossKind);
    if (!bossKind) return { ok: false, error: "bad_boss" };
    const battle = await simulateGuildRaidBattle({
      tx,
      userId,
      bossKind: bossKind as CoopBossKindId,
    });
    if (!battle) return { ok: false, error: "no_character" };

    const [event] = await tx
      .select()
      .from(guildRaidEvents)
      .where(eq(guildRaidEvents.id, current.id))
      .limit(1);
    if (!event) return { ok: false, error: "event_ended" };

    const [existing] = await tx
      .select()
      .from(guildRaidAttackLogs)
      .where(
        and(
          eq(guildRaidAttackLogs.eventId, event.id),
          eq(guildRaidAttackLogs.userId, userId),
          eq(guildRaidAttackLogs.requestId, requestId),
        ),
      )
      .limit(1);
    const [participantRow] = await tx
      .select()
      .from(guildRaidParticipants)
      .where(
        and(
          eq(guildRaidParticipants.eventId, event.id),
          eq(guildRaidParticipants.userId, userId),
        ),
      )
      .for("update");
    if (existing) return existingOutcome(existing, participantRow ?? null);

    const initialMaxHp = guildRaidMaxHp(1);
    await tx
      .insert(guildRaidGuildScores)
      .values({
        eventId: event.id,
        guildId: guild.id,
        guildNameSnapshot: guild.name,
        guildEmblemSnapshot: guild.emblem,
        damage: 0,
        stage: 1,
        hp: initialMaxHp,
        maxHp: initialMaxHp,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [guildRaidGuildScores.eventId, guildRaidGuildScores.guildId],
      });
    const [guildProgress] = await tx
      .select()
      .from(guildRaidGuildScores)
      .where(
        and(
          eq(guildRaidGuildScores.eventId, event.id),
          eq(guildRaidGuildScores.guildId, guild.id),
        ),
      )
      .for("update");
    if (!guildProgress) throw new Error("guild raid progress row missing");

    const mutation = resolveGuildRaidAttackMutation({
      now,
      event: {
        id: event.id,
        bossKind: event.bossKind,
        status: event.status,
        endsAt: event.endsAt,
      },
      guildProgress: {
        stage: guildProgress.stage,
        hp: guildProgress.hp,
        maxHp: guildProgress.maxHp,
      },
      guild,
      participant: participantRow
        ? {
            guildId: participantRow.guildId,
            damage: participantRow.damage,
            attackCount: participantRow.attackCount,
            dayKey: participantRow.dayKey,
            dailyAttackCount: participantRow.dailyAttackCount,
          }
        : null,
      existingAttack: null,
      battle,
    });
    if (!mutation.ok) return mutation;
    if (mutation.alreadyCommitted) {
      throw new Error("unreachable committed guild raid mutation");
    }

    await tx
      .insert(guildRaidParticipants)
      .values({
        eventId: event.id,
        userId,
        guildId: mutation.participant.guildId,
        nameSnapshot: battle.playerName,
        damage: mutation.participant.damage,
        attackCount: mutation.participant.attackCount,
        dayKey: mutation.participant.dayKey,
        dailyAttackCount: mutation.participant.dailyAttackCount,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [guildRaidParticipants.eventId, guildRaidParticipants.userId],
        set: {
          nameSnapshot: battle.playerName,
          damage: mutation.participant.damage,
          attackCount: mutation.participant.attackCount,
          dayKey: mutation.participant.dayKey,
          dailyAttackCount: mutation.participant.dailyAttackCount,
          updatedAt: now,
        },
      });
    await tx
      .update(guildRaidGuildScores)
      .set({
        guildNameSnapshot: guild.name,
        guildEmblemSnapshot: guild.emblem,
        damage: sql`${guildRaidGuildScores.damage} + ${mutation.guildDamageDelta}`,
        stage: mutation.guildProgress.stage,
        hp: mutation.guildProgress.hp,
        maxHp: mutation.guildProgress.maxHp,
        updatedAt: now,
      })
      .where(
        and(
          eq(guildRaidGuildScores.eventId, event.id),
          eq(guildRaidGuildScores.guildId, guild.id),
        ),
      );
    const [attack] = await tx
      .insert(guildRaidAttackLogs)
      .values({
        eventId: event.id,
        userId,
        guildId: guild.id,
        requestId,
        name: battle.playerName,
        damageDealt: battle.damageDealt,
        damageTaken: battle.damageTaken,
        diedEarly: battle.diedEarly,
        stageBefore: guildProgress.stage,
        stageAfter: mutation.guildProgress.stage,
        hpBefore: guildProgress.hp,
        hpAfter: mutation.guildProgress.hp,
        replay: battle.replay,
        createdAt: now,
      })
      .returning({ id: guildRaidAttackLogs.id });
    if (!attack) throw new Error("guild raid attack insert returned no row");

    return {
      ok: true,
      alreadyCommitted: false,
      attackId: attack.id,
      damageDealt: battle.damageDealt,
      damageTaken: battle.damageTaken,
      diedEarly: battle.diedEarly,
      replay: battle.replay,
      stage: mutation.guildProgress.stage,
      hp: mutation.guildProgress.hp,
      maxHp: mutation.guildProgress.maxHp,
      stagesCleared: mutation.stagesCleared,
      myDamage: mutation.participant.damage,
      myAttackCount: mutation.participant.attackCount,
      dailyAttackCount: mutation.participant.dailyAttackCount,
    };
  });
}
