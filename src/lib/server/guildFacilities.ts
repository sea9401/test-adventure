import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { outpostVillages } from "@/db/schema";
import {
  PLACEABLE_SETTLEMENT_BUILDING_IDS,
  SETTLEMENT_BUILDING_IDS,
  settlementBuildingIdOf,
  settlementBuildingLevelOf,
  settlementBuildingSlot,
  type SettlementBuildingId,
} from "@/adventure/data/v2/settlement";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];
type QueryDb = Tx | typeof dbType;

export function guildFacilityOutpostId(
  guildId: number,
  buildingId: SettlementBuildingId,
): string {
  return `guild-facility:${guildId}:${buildingId}`;
}

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

export async function readGuildFacilityLevel(
  tx: QueryDb,
  guildId: number,
  buildingId: SettlementBuildingId,
): Promise<number> {
  const rows = await tx
    .select({ buildings: outpostVillages.buildings })
    .from(outpostVillages)
    .where(eq(outpostVillages.guildId, guildId));
  return settlementBuildingSummaryFromRows(rows).levels[buildingId];
}

// 길드 시설은 해금 콘텐츠가 아니라 길드의 기본 기능이다. 기존 영지에 같은 시설이
// 이미 있으면 보존하고, 없는 시설만 전용 synthetic 마을의 Lv.1 슬롯으로 지급한다.
export async function grantGuildBaseFacilities(
  tx: Tx,
  guildId: number,
): Promise<SettlementBuildingId[]> {
  const rows = await tx
    .select({ buildings: outpostVillages.buildings })
    .from(outpostVillages)
    .where(eq(outpostVillages.guildId, guildId));
  const { counts } = settlementBuildingSummaryFromRows(rows);
  const missing = PLACEABLE_SETTLEMENT_BUILDING_IDS.filter(
    (buildingId) => counts[buildingId] <= 0,
  );
  if (missing.length === 0) return [];

  await tx
    .insert(outpostVillages)
    .values(
      missing.map((buildingId) => ({
        outpostId: guildFacilityOutpostId(guildId, buildingId),
        guildId,
        ownerUserId: null,
        tier: "village",
        name: null,
        productionKind: null,
        unlockedSlots: 1,
        slotKinds: {},
        buildings: { 0: settlementBuildingSlot(buildingId, 1) },
        jobs: {},
      })),
    )
    .onConflictDoNothing();

  return missing;
}
