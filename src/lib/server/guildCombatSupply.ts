import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { guilds } from "@/db/schema";
import {
  EMPTY_GUILD_COMBAT_SUPPLY_LEVELS,
  guildCombatSupplyBonuses,
  parseGuildCombatOperationsTier,
  parseGuildCombatSupplyLevels,
  type GuildCombatSupplyLevels,
} from "@/adventure/data/v2/guildCombatSupply";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

export type GuildCombatSupplyState = {
  levels: GuildCombatSupplyLevels;
  operationsTier: number;
};

export async function readGuildCombatSupplyState(
  tx: Tx,
  guildId: number | null,
  now: Date = new Date(),
): Promise<GuildCombatSupplyState> {
  if (guildId == null) {
    return {
      levels: { ...EMPTY_GUILD_COMBAT_SUPPLY_LEVELS },
      operationsTier: 0,
    };
  }
  const row = (
    await tx
      .select({ buffs: guilds.buffs })
      .from(guilds)
      .where(eq(guilds.id, guildId))
      .limit(1)
  )[0];
  return {
    levels: parseGuildCombatSupplyLevels(row?.buffs),
    operationsTier: parseGuildCombatOperationsTier(row?.buffs, now),
  };
}

export async function readGuildCombatSupplyBonuses(
  tx: Tx,
  guildId: number | null,
  now: Date = new Date(),
): Promise<ReturnType<typeof guildCombatSupplyBonuses>> {
  const state = await readGuildCombatSupplyState(tx, guildId, now);
  return guildCombatSupplyBonuses(state.levels, state.operationsTier);
}

export async function readGuildCombatSupplyLevels(
  tx: Tx,
  guildId: number | null,
): Promise<GuildCombatSupplyLevels> {
  return (await readGuildCombatSupplyState(tx, guildId)).levels;
}
