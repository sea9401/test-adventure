import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  guildMembers,
  guildRaidEvents,
  guildRaidGuildScores,
  guilds,
} from "@/db/schema";
import {
  GUILD_RAID_DEFAULT_BOSS_ID,
  parseGuildRaidBossId,
  type GuildRaidBossId,
} from "@/adventure/data/v2/guildRaidBosses";
import { guildRaidWeekKey } from "@/adventure/data/v2/guildRaid";
import type { GuildRaidPracticeResult } from "@/adventure/v2/guild/guildRaidTypes";
import {
  simulateGuildRaidBattle,
  type GuildRaidBattleResult,
} from "@/lib/server/guildRaidBattle";

type GuildRaidPracticeContext = {
  hasGuild: boolean;
  /** 이번 주 길드가 고른 보스(점수 행의 boss_kind). 고르기 전이면 null. */
  selectedBossKind: string | null;
  event: object | null;
};

type GuildRaidPracticeDependencies = {
  readContext(
    userId: string,
    weekKey: string,
  ): Promise<GuildRaidPracticeContext>;
  simulate(input: {
    userId: string;
    bossId: GuildRaidBossId;
  }): Promise<GuildRaidBattleResult | null>;
};

export type GuildRaidPracticeOutcome =
  | GuildRaidPracticeResult
  | {
      ok: false;
      error: "no_guild" | "no_character" | "bad_boss" | "event_ended";
    };

export function createGuildRaidPracticeService(
  dependencies: GuildRaidPracticeDependencies,
) {
  return async function practiceGuildRaid({
    userId,
    bossId: requestedBossId,
    now = new Date(),
  }: {
    userId: string;
    bossId?: unknown;
    now?: Date;
  }): Promise<GuildRaidPracticeOutcome> {
    const context = await dependencies.readContext(
      userId,
      guildRaidWeekKey(now),
    );
    if (!context.hasGuild) return { ok: false, error: "no_guild" };
    if (!context.event) {
      return { ok: false, error: "event_ended" };
    }

    // 연습은 선택과 무관하게 아무 보스나 가능하다. 지정이 없으면 길드가 고른 보스, 그것도 없으면 기본 보스.
    const rawBossId =
      requestedBossId ?? context.selectedBossKind ?? GUILD_RAID_DEFAULT_BOSS_ID;
    const bossKind = parseGuildRaidBossId(rawBossId);
    if (!bossKind) return { ok: false, error: "bad_boss" };
    const battle = await dependencies.simulate({ userId, bossId: bossKind });
    if (!battle) return { ok: false, error: "no_character" };

    return {
      ok: true,
      practice: true,
      bossKind,
      playerName: battle.playerName,
      damageDealt: battle.damageDealt,
      damageTaken: battle.damageTaken,
      diedEarly: battle.diedEarly,
      turns: battle.turns,
      replay: battle.replay,
    };
  };
}

export const practiceGuildRaid = createGuildRaidPracticeService({
  async readContext(userId, weekKey) {
    const [currentGuildRows, eventRows] = await Promise.all([
      db
        .select({ id: guilds.id })
        .from(guildMembers)
        .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
        .where(
          and(eq(guildMembers.userId, userId), isNull(guilds.disbandedAt)),
        )
        .limit(1),
      db
        .select({ id: guildRaidEvents.id })
        .from(guildRaidEvents)
        .where(eq(guildRaidEvents.weekKey, weekKey))
        .limit(1),
    ]);
    const guildId = currentGuildRows[0]?.id;
    const event = eventRows[0] ?? null;
    const [selection] =
      guildId != null && event
        ? await db
            .select({ bossKind: guildRaidGuildScores.bossKind })
            .from(guildRaidGuildScores)
            .where(
              and(
                eq(guildRaidGuildScores.eventId, event.id),
                eq(guildRaidGuildScores.guildId, guildId),
              ),
            )
            .limit(1)
        : [];
    return {
      hasGuild: guildId != null,
      selectedBossKind: selection?.bossKind ?? null,
      event,
    };
  },
  simulate({ userId, bossId }) {
    return simulateGuildRaidBattle({
      tx: db,
      userId,
      bossId,
      lockForUpdate: false,
    });
  },
});
