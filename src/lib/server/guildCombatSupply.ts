import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { guilds } from "@/db/schema";
import {
  EMPTY_GUILD_COMBAT_SUPPLY_LEVELS,
  parseGuildCombatSupplyLevels,
  type GuildCombatSupplyLevels,
} from "@/adventure/data/v2/guildCombatSupply";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

export async function readGuildCombatSupplyLevels(
  tx: Tx,
  guildId: number | null,
): Promise<GuildCombatSupplyLevels> {
  if (guildId == null) return { ...EMPTY_GUILD_COMBAT_SUPPLY_LEVELS };
  const row = (
    await tx
      .select({ buffs: guilds.buffs })
      .from(guilds)
      .where(eq(guilds.id, guildId))
      .limit(1)
  )[0];
  return parseGuildCombatSupplyLevels(row?.buffs);
}
