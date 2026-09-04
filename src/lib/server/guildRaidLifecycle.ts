import "server-only";

import { and, count, desc, eq, gt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  guildRaidEvents,
  guildRaidGuildScores,
  guildRaidParticipants,
} from "@/db/schema";
import {
  GUILD_RAID_PILOT_BOSS_KIND,
  guildRaidCombatEndsAt,
  guildRaidMaxHp,
  guildRaidWeekKey,
  isGuildRaidParticipantEligible,
  normalizeGuildRaidPage,
  rankGuildRaidScores,
} from "@/adventure/data/v2/guildRaid";
import { weekStartUtcFor } from "@/lib/server/pvp/season";

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

export type GuildRaidRankedScoreRecord = GuildRaidScoreRecord & {
  rank: number;
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
  countScores(eventId: string): Promise<number>;
  listRankedScoresPage(
    eventId: string,
    offset: number,
    limit: number,
  ): Promise<GuildRaidRankedScoreRecord[]>;
  findRankedScore(
    eventId: string,
    guildId: number,
  ): Promise<GuildRaidRankedScoreRecord | null>;
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

type GuildRaidQueryDatabase = Pick<typeof db, "$with" | "select" | "with">;

export function buildGuildRaidViewerRankQuery(
  database: GuildRaidQueryDatabase,
  eventId: string,
  guildId: number,
) {
  const ranked = database.$with("guild_raid_ranked_score").as(
    database
      .select({
        eventId: guildRaidGuildScores.eventId,
        guildId: guildRaidGuildScores.guildId,
        guildName: guildRaidGuildScores.guildNameSnapshot,
        guildEmblem: guildRaidGuildScores.guildEmblemSnapshot,
        damage: guildRaidGuildScores.damage,
        finalRank: guildRaidGuildScores.finalRank,
        settledAt: guildRaidGuildScores.settledAt,
        rank: sql<number>`rank() over (order by ${guildRaidGuildScores.damage} desc)`
          .mapWith(Number)
          .as("rank"),
      })
      .from(guildRaidGuildScores)
      .where(
        and(
          eq(guildRaidGuildScores.eventId, eventId),
          gt(guildRaidGuildScores.damage, 0),
        ),
      ),
  );
  return database
    .with(ranked)
    .select()
    .from(ranked)
    .where(eq(ranked.guildId, guildId))
    .limit(1);
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

  async countScores(eventId) {
    const [row] = await db
      .select({ total: count() })
      .from(guildRaidGuildScores)
      .where(
        and(
          eq(guildRaidGuildScores.eventId, eventId),
          gt(guildRaidGuildScores.damage, 0),
        ),
      );
    return row?.total ?? 0;
  },

  async listRankedScoresPage(eventId, offset, limit) {
    const rows = await db
      .select({
        eventId: guildRaidGuildScores.eventId,
        guildId: guildRaidGuildScores.guildId,
        guildName: guildRaidGuildScores.guildNameSnapshot,
        guildEmblem: guildRaidGuildScores.guildEmblemSnapshot,
        damage: guildRaidGuildScores.damage,
        finalRank: guildRaidGuildScores.finalRank,
        settledAt: guildRaidGuildScores.settledAt,
        rank: sql<number>`rank() over (order by ${guildRaidGuildScores.damage} desc)`.mapWith(Number),
      })
      .from(guildRaidGuildScores)
      .where(
        and(
          eq(guildRaidGuildScores.eventId, eventId),
          gt(guildRaidGuildScores.damage, 0),
        ),
      )
      .orderBy(desc(guildRaidGuildScores.damage), guildRaidGuildScores.guildId)
      .offset(offset)
      .limit(limit);
    return rows.map((row) => ({
      ...row,
      rank: row.finalRank ?? row.rank,
    }));
  },

  async findRankedScore(eventId, guildId) {
    const [row] = await buildGuildRaidViewerRankQuery(db, eventId, guildId);
    return row ? { ...row, rank: row.finalRank ?? row.rank } : null;
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
      endsAt: guildRaidCombatEndsAt(startsAt),
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
    requestedPage: unknown = 1,
  ) {
    const total = await store.countScores(eventId);
    const page = normalizeGuildRaidPage(requestedPage, total);
    const [rows, viewer] = await Promise.all([
      store.listRankedScoresPage(eventId, page.offset, page.limit),
      viewerGuildId == null
        ? Promise.resolve(null)
        : store.findRankedScore(eventId, viewerGuildId),
    ]);
    return {
      rows,
      viewer,
      pagination: {
        page: page.page,
        pageSize: page.pageSize,
        totalPages: page.totalPages,
        total,
      },
    };
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
