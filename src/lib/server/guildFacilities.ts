import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { outpostVillages } from "@/db/schema";
import {
  settlementBuildingIdOf,
  settlementBuildingLevelOf,
  settlementBuildingSlot,
  SETTLEMENT_BUILDING_IDS,
  type SettlementBuildingId,
} from "@/adventure/data/v2/settlement";
import type { VillageRow } from "./v2Settlement";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];
type QueryDb = Tx | typeof dbType;

const GUILD_FACILITY_OUTPOST_PREFIX = "__guild_facilities__";

export function guildFacilitiesOutpostId(guildId: number): string {
  return `${GUILD_FACILITY_OUTPOST_PREFIX}:${guildId}`;
}

export function guildSmithyLevelFromBuildings(buildings: unknown): number {
  if (
    buildings == null ||
    typeof buildings !== "object" ||
    Array.isArray(buildings)
  ) {
    return 0;
  }
  let level = 0;
  for (const raw of Object.values(buildings as Record<string, unknown>)) {
    if (settlementBuildingIdOf(raw) === "guild_smithy") {
      level = Math.max(level, settlementBuildingLevelOf(raw));
    }
  }
  return level;
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

export async function lockGuildFacilitiesVillage(
  tx: Tx,
  guildId: number,
): Promise<VillageRow> {
  const outpostId = guildFacilitiesOutpostId(guildId);
  await tx
    .insert(outpostVillages)
    .values({
      outpostId,
      guildId,
      ownerUserId: null,
      tier: "village",
      name: "길드 시설",
      productionKind: null,
      unlockedSlots: 1,
      slotKinds: {},
      buildings: {},
      jobs: {},
    })
    .onConflictDoNothing();

  const row = (
    await tx
      .select()
      .from(outpostVillages)
      .where(eq(outpostVillages.outpostId, outpostId))
      .for("update")
      .limit(1)
  )[0];
  return {
    outpostId,
    guildId,
    ownerUserId: null,
    tier: "village",
    name: "길드 시설",
    productionKind: null,
    unlockedSlots: 1,
    slotKinds: {},
    buildings:
      typeof row?.buildings === "object" && row.buildings !== null
        ? Object.fromEntries(
            Object.entries(row.buildings as Record<string, unknown>)
              .map(([slot, raw]) => {
                const id = settlementBuildingIdOf(raw);
                return id
                  ? [slot, settlementBuildingSlot(id, settlementBuildingLevelOf(raw))]
                  : null;
              })
              .filter((entry): entry is [string, ReturnType<typeof settlementBuildingSlot>] =>
                entry != null,
              ),
          )
        : {},
    jobs: {},
  };
}
