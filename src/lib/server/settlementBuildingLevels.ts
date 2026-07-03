import { eq } from "drizzle-orm";
import { db } from "@/db";
import { outpostVillages } from "@/db/schema";
import {
  settlementBuildingIdOf,
  settlementBuildingLevelOf,
  type SettlementBuildingId,
} from "@/adventure/data/v2/settlement";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function maxBuildingLevelFromBuildings(
  buildings: unknown,
  buildingId: SettlementBuildingId,
): number {
  if (buildings == null || typeof buildings !== "object" || Array.isArray(buildings)) {
    return 0;
  }
  let level = 0;
  for (const raw of Object.values(buildings as Record<string, unknown>)) {
    if (settlementBuildingIdOf(raw) === buildingId) {
      level = Math.max(level, settlementBuildingLevelOf(raw));
    }
  }
  return level;
}

export async function maxGuildSettlementBuildingLevel(
  tx: Tx,
  guildId: number,
  buildingId: SettlementBuildingId,
): Promise<number> {
  const rows = await tx
    .select({ buildings: outpostVillages.buildings })
    .from(outpostVillages)
    .where(eq(outpostVillages.guildId, guildId));
  return rows.reduce(
    (max, row) =>
      Math.max(max, maxBuildingLevelFromBuildings(row.buildings, buildingId)),
    0,
  );
}

export async function maxGuildSettlementBuildingLevelFromDb(
  guildId: number,
  buildingId: SettlementBuildingId,
): Promise<number> {
  const rows = await db
    .select({ buildings: outpostVillages.buildings })
    .from(outpostVillages)
    .where(eq(outpostVillages.guildId, guildId));
  return rows.reduce(
    (max, row) =>
      Math.max(max, maxBuildingLevelFromBuildings(row.buildings, buildingId)),
    0,
  );
}
