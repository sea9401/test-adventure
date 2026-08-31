import "server-only";

import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  guildRaidEvents,
  guildRaidGuildScores,
  guildRaidParticipants,
} from "@/db/schema";
import {
  GUILD_RAID_PILOT_BOSS_KIND,
  guildRaidMaxHp,
  guildRaidWeekKey,
  isGuildRaidParticipantEligible,
  rankGuildRaidScores,
} from "@/adventure/data/v2/guildRaid";
import { weekEndUtcFor, weekStartUtcFor } from "@/lib/server/pvp/season";

export type GuildRaidEventRecord = {
  id: string;
  weekKey: string;
  bossKind: string;
  startsAt: Date;
  endsAt: Date;
  status: "active" | "settled";
  stage: number;
  hp: number;
  maxHp: number;
  settledAt: Date | null;
};

export type GuildRaidScoreRecord = {
  eventId: string;
  guildId: number;
  guildName: string;
  guildEmblem: string | null;
  damage: number;
  finalRank: number | null;
  settledAt: Date | null;
};

export type GuildRaidParticipantRecord = {
  eventId: string;
  userId: string;
  guildId: number;
  name: string;
  damage: number;
  attackCount: number;
  eligibleAtSettlement: boolean | null;
};

export type GuildRaidSettlement = {
  scores: GuildRaidScoreRecord[];
  participants: GuildRaidParticipantRecord[];
};

export type GuildRaidLifecycleStore = {
  findEventByWeek(weekKey: string): Promise<GuildRaidEventRecord | null>;
  createEvent(event: GuildRaidEventRecord): Promise<GuildRaidEventRecord>;
  listExpiredActiveEventIds(now: Date): Promise<string[]>;
  settleEvent(
    eventId: string,
    now: Date,
    build: (
      scores: GuildRaidScoreRecord[],
      participants: GuildRaidParticipantRecord[],
    ) => GuildRaidSettlement,
  ): Promise<boolean>;
  listScores(eventId: string): Promise<GuildRaidScoreRecord[]>;
};

function toEventRecord(
  row: typeof guildRaidEvents.$inferSelect,
): GuildRaidEventRecord {
  return {
    id: row.id,
    weekKey: row.weekKey,
    bossKind: row.bossKind,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status === "settled" ? "settled" : "active",
    stage: row.stage,
    hp: row.hp,
    maxHp: row.maxHp,
    settledAt: row.settledAt,
  };
}

function toScoreRecord(
  row: typeof guildRaidGuildScores.$inferSelect,
): GuildRaidScoreRecord {
  return {
    eventId: row.eventId,
    guildId: row.guildId,
    guildName: row.guildNameSnapshot,
    guildEmblem: row.guildEmblemSnapshot,
    damage: row.damage,
    finalRank: row.finalRank,
    settledAt: row.settledAt,
  };
}

function toParticipantRecord(
  row: typeof guildRaidParticipants.$inferSelect,
): GuildRaidParticipantRecord {
  return {
    eventId: row.eventId,
    userId: row.userId,
    guildId: row.guildId,
    name: row.nameSnapshot,
    damage: row.damage,
    attackCount: row.attackCount,
    eligibleAtSettlement: row.eligibleAtSettlement,
  };
}

const drizzleGuildRaidLifecycleStore: GuildRaidLifecycleStore = {
  async findEventByWeek(weekKey) {
    const [row] = await db
      .select()
      .from(guildRaidEvents)
      .where(eq(guildRaidEvents.weekKey, weekKey))
      .limit(1);
    return row ? toEventRecord(row) : null;
  },

  async createEvent(event) {
    const [inserted] = await db
      .insert(guildRaidEvents)
      .values({
        id: event.id,
        weekKey: event.weekKey,
        bossKind: event.bossKind,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        status: event.status,
        stage: event.stage,
        hp: event.hp,
        maxHp: event.maxHp,
        settledAt: event.settledAt,
      })
      .onConflictDoNothing({ target: guildRaidEvents.weekKey })
      .returning();
    if (inserted) return toEventRecord(inserted);
    const existing = await this.findEventByWeek(event.weekKey);
    if (!existing) {
      throw new Error(`guild raid ${event.weekKey} missing after create race`);
    }
    return existing;
  },

  async listExpiredActiveEventIds(now) {
    const rows = await db
      .select({ id: guildRaidEvents.id })
      .from(guildRaidEvents)
      .where(
        and(
          eq(guildRaidEvents.status, "active"),
          lte(guildRaidEvents.endsAt, now),
        ),
      );
    return rows.map((row) => row.id);
  },

  async settleEvent(eventId, now, build) {
    return db.transaction(async (tx) => {
      const [event] = await tx
        .select()
        .from(guildRaidEvents)
        .where(eq(guildRaidEvents.id, eventId))
        .for("update");
      if (!event || event.status !== "active" || event.endsAt > now) {
        return false;
      }

      const [scoreRows, participantRows] = await Promise.all([
        tx
          .select()
          .from(guildRaidGuildScores)
          .where(eq(guildRaidGuildScores.eventId, eventId)),
        tx
          .select()
          .from(guildRaidParticipants)
          .where(eq(guildRaidParticipants.eventId, eventId)),
      ]);
      const settlement = build(
        scoreRows.map(toScoreRecord),
        participantRows.map(toParticipantRecord),
      );

      for (const score of settlement.scores) {
        await tx
          .update(guildRaidGuildScores)
          .set({ finalRank: score.finalRank, settledAt: now, updatedAt: now })
          .where(
            and(
              eq(guildRaidGuildScores.eventId, eventId),
              eq(guildRaidGuildScores.guildId, score.guildId),
            ),
          );
      }
      for (const participant of settlement.participants) {
        await tx
          .update(guildRaidParticipants)
          .set({
            eligibleAtSettlement: participant.eligibleAtSettlement,
            updatedAt: now,
          })
          .where(
            and(
              eq(guildRaidParticipants.eventId, eventId),
              eq(guildRaidParticipants.userId, participant.userId),
            ),
          );
      }
      await tx
        .update(guildRaidEvents)
        .set({ status: "settled", settledAt: now })
        .where(eq(guildRaidEvents.id, eventId));
      return true;
    });
  },

  async listScores(eventId) {
    const rows = await db
      .select()
      .from(guildRaidGuildScores)
      .where(eq(guildRaidGuildScores.eventId, eventId));
    return rows.map(toScoreRecord);
  },
};

export function createGuildRaidLifecycleService(store: GuildRaidLifecycleStore) {
  async function settleExpiredGuildRaids(now: Date = new Date()) {
    const eventIds = await store.listExpiredActiveEventIds(now);
    let settled = 0;
    for (const eventId of eventIds) {
      const didSettle = await store.settleEvent(
        eventId,
        now,
        (scores, participants) => ({
          scores: rankGuildRaidScores(scores.filter((score) => score.damage > 0)).map(
            ({ rank, ...score }) => ({
              ...score,
              finalRank: rank,
              settledAt: now,
            }),
          ),
          participants: participants.map((participant) => ({
            ...participant,
            eligibleAtSettlement: isGuildRaidParticipantEligible(
              participant.attackCount,
              participant.damage,
            ),
          })),
        }),
      );
      if (didSettle) settled += 1;
    }
    return settled;
  }

  async function getOrCreateCurrentGuildRaid(now: Date) {
    const weekKey = guildRaidWeekKey(now);
    const existing = await store.findEventByWeek(weekKey);
    if (existing) return existing;
    const startsAt = weekStartUtcFor(now);
    const maxHp = guildRaidMaxHp(1);
    return store.createEvent({
      id: `guild-raid:${weekKey}`,
      weekKey,
      bossKind: GUILD_RAID_PILOT_BOSS_KIND,
      startsAt,
      endsAt: weekEndUtcFor(startsAt),
      status: "active",
      stage: 1,
      hp: maxHp,
      maxHp,
      settledAt: null,
    });
  }

  async function ensureCurrentGuildRaid(now: Date = new Date()) {
    await settleExpiredGuildRaids(now);
    return getOrCreateCurrentGuildRaid(now);
  }

  async function rolloverGuildRaids(now: Date = new Date()) {
    const settled = await settleExpiredGuildRaids(now);
    const event = await getOrCreateCurrentGuildRaid(now);
    return { settled, eventId: event.id };
  }

  async function readGuildRaidLeaderboard(
    eventId: string,
    viewerGuildId: number | null,
  ) {
    const scores = (await store.listScores(eventId)).filter(
      (score) => score.damage > 0,
    );
    const ranked = rankGuildRaidScores(scores).map(({ rank, ...score }) => ({
      ...score,
      rank: score.finalRank ?? rank,
    }));
    const rows = ranked.slice(0, 50);
    const viewer =
      viewerGuildId == null
        ? null
        : ranked.find((row) => row.guildId === viewerGuildId) ?? null;
    return { rows, viewer };
  }

  return {
    ensureCurrentGuildRaid,
    settleExpiredGuildRaids,
    rolloverGuildRaids,
    readGuildRaidLeaderboard,
  };
}

export const {
  ensureCurrentGuildRaid,
  settleExpiredGuildRaids,
  rolloverGuildRaids,
  readGuildRaidLeaderboard,
} = createGuildRaidLifecycleService(drizzleGuildRaidLifecycleStore);
