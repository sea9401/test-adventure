import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guildRaidGuildScores, guilds } from "@/db/schema";
import { guildRaidMaxHp } from "@/adventure/data/v2/guildRaid";
import {
  GUILD_RAID_DEFAULT_BOSS_ID,
  parseGuildRaidBossId,
  type GuildRaidBossId,
} from "@/adventure/data/v2/guildRaidBosses";
import { isGuildMasterOrManager } from "@/lib/server/guildAdmin";
import { ensureCurrentGuildRaid } from "@/lib/server/guildRaidLifecycle";

export type GuildRaidSelectError =
  | "no_guild"
  | "forbidden"
  | "event_ended"
  | "bad_boss"
  | "already_selected";

type GuildRaidSelectFailure = {
  ok: false;
  error: GuildRaidSelectError;
  selected?: GuildRaidBossId;
};

export function resolveGuildRaidSelection(input: {
  now: Date;
  event: { status: string; endsAt: Date };
  canManage: boolean;
  bossId: GuildRaidBossId | null;
  existing: { bossKind: GuildRaidBossId } | null;
}): { ok: true } | GuildRaidSelectFailure {
  if (!input.canManage) return { ok: false, error: "forbidden" };
  if (input.event.status !== "active" || input.event.endsAt <= input.now) {
    return { ok: false, error: "event_ended" };
  }
  if (!input.bossId) return { ok: false, error: "bad_boss" };
  if (input.existing) {
    return {
      ok: false,
      error: "already_selected",
      selected: input.existing.bossKind,
    };
  }
  return { ok: true };
}

// 길드 점수 행을 만드는 것이 곧 이번 주 보스 선택이다. 행은 한 번만 생기므로 선택은 바꿀 수 없다.
export async function selectGuildRaidBoss({
  userId,
  bossId: rawBossId,
  now = new Date(),
}: {
  userId: string;
  bossId: unknown;
  now?: Date;
}): Promise<
  | { ok: true; bossId: GuildRaidBossId; selectedAt: number }
  | GuildRaidSelectFailure
> {
  const event = await ensureCurrentGuildRaid(now);
  const bossId = parseGuildRaidBossId(rawBossId);
  return db.transaction(async (tx) => {
    const [guild] = await tx
      .select({ id: guilds.id, name: guilds.name, emblem: guilds.emblem })
      .from(guildMembers)
      .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
      .where(and(eq(guildMembers.userId, userId), isNull(guilds.disbandedAt)))
      .limit(1);
    if (!guild) return { ok: false, error: "no_guild" };

    const readExisting = async () => {
      const [row] = await tx
        .select({ bossKind: guildRaidGuildScores.bossKind })
        .from(guildRaidGuildScores)
        .where(
          and(
            eq(guildRaidGuildScores.eventId, event.id),
            eq(guildRaidGuildScores.guildId, guild.id),
          ),
        )
        .limit(1);
      if (!row) return null;
      return {
        bossKind: parseGuildRaidBossId(row.bossKind) ?? GUILD_RAID_DEFAULT_BOSS_ID,
      };
    };

    const decision = resolveGuildRaidSelection({
      now,
      event,
      canManage: await isGuildMasterOrManager(tx, guild.id, userId),
      bossId,
      existing: await readExisting(),
    });
    if (!decision.ok) return decision;
    if (!bossId) return { ok: false, error: "bad_boss" };

    const maxHp = guildRaidMaxHp(bossId, 1);
    const [inserted] = await tx
      .insert(guildRaidGuildScores)
      .values({
        eventId: event.id,
        guildId: guild.id,
        guildNameSnapshot: guild.name,
        guildEmblemSnapshot: guild.emblem,
        bossKind: bossId,
        selectedByUserId: userId,
        selectedAt: now,
        damage: 0,
        stage: 1,
        hp: maxHp,
        maxHp,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [guildRaidGuildScores.eventId, guildRaidGuildScores.guildId],
      })
      .returning({ bossKind: guildRaidGuildScores.bossKind });
    if (!inserted) {
      const existing = await readExisting();
      return {
        ok: false,
        error: "already_selected",
        selected: existing?.bossKind,
      };
    }
    return { ok: true, bossId, selectedAt: now.getTime() };
  });
}
