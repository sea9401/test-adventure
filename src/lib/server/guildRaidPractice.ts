import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guildRaidEvents, guilds } from "@/db/schema";
import {
  parseCoopBossKindId,
  type CoopBossKindId,
} from "@/adventure/data/v2/coopBosses";
import { guildRaidWeekKey } from "@/adventure/data/v2/guildRaid";
import type { GuildRaidPracticeResult } from "@/adventure/v2/guild/guildRaidTypes";
import {
  simulateGuildRaidBattle,
  type GuildRaidBattleResult,
} from "@/lib/server/guildRaidBattle";

type GuildRaidPracticeContext = {
  hasGuild: boolean;
  event: {
    bossKind: string;
    status: string;
    endsAt: Date;
  } | null;
};

type GuildRaidPracticeDependencies = {
  readContext(
    userId: string,
    weekKey: string,
  ): Promise<GuildRaidPracticeContext>;
  simulate(input: {
    userId: string;
    bossKind: CoopBossKindId;
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
    now = new Date(),
  }: {
    userId: string;
    now?: Date;
  }): Promise<GuildRaidPracticeOutcome> {
    const context = await dependencies.readContext(
      userId,
      guildRaidWeekKey(now),
    );
    if (!context.hasGuild) return { ok: false, error: "no_guild" };
    if (
      !context.event ||
      context.event.status !== "active" ||
      context.event.endsAt <= now
    ) {
      return { ok: false, error: "event_ended" };
    }

    const bossKind = parseCoopBossKindId(context.event.bossKind);
    if (!bossKind) return { ok: false, error: "bad_boss" };
    const battle = await dependencies.simulate({ userId, bossKind });
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
        .select({
          bossKind: guildRaidEvents.bossKind,
          status: guildRaidEvents.status,
          endsAt: guildRaidEvents.endsAt,
        })
        .from(guildRaidEvents)
        .where(eq(guildRaidEvents.weekKey, weekKey))
        .limit(1),
    ]);
    return {
      hasGuild: currentGuildRows.length > 0,
      event: eventRows[0] ?? null,
    };
  },
  simulate({ userId, bossKind }) {
    return simulateGuildRaidBattle({
      tx: db,
      userId,
      bossKind,
      lockForUpdate: false,
    });
  },
});
