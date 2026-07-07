import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { outpostVillages } from "@/db/schema";
import {
  SETTLEMENT_BUILDING_IDS,
  settlementBuildingIdOf,
  settlementBuildingLevelOf,
  type SettlementBuildingId,
} from "@/adventure/data/v2/settlement";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];
type QueryDb = Tx | typeof dbType;

export function settlementBuildingSummaryFromRows(
  rows: Array<{ buildings: unknown }>,
): {
  counts: Record<SettlementBuildingId, number>;
  levels: Record<SettlementBuildingId, number>;
} {
  const counts = Object.fromEntries(
    SETTLEMENT_BUILDING_IDS.map((id) => [id, 0]),
  ) as Record<SettlementBuildingId, number>;
  const levels = Object.fromEntries(
    SETTLEMENT_BUILDING_IDS.map((id) => [id, 0]),
  ) as Record<SettlementBuildingId, number>;

  for (const row of rows) {
    if (typeof row.buildings !== "object" || row.buildings === null) continue;
    for (const rawBuilding of Object.values(row.buildings)) {
      const buildingId = settlementBuildingIdOf(rawBuilding);
      if (!buildingId) continue;
      counts[buildingId] += 1;
      levels[buildingId] = Math.max(
        levels[buildingId],
        settlementBuildingLevelOf(rawBuilding),
      );
    }
  }

  return { counts, levels };
}

export async function readGuildSmithyLevel(
  tx: QueryDb,
  guildId: number,
): Promise<number> {
  const rows = await tx
    .select({ buildings: outpostVillages.buildings })
    .from(outpostVillages)
    .where(eq(outpostVillages.guildId, guildId));
  return settlementBuildingSummaryFromRows(rows).levels.guild_smithy;
}
