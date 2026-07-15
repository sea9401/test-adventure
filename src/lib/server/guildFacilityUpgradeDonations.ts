import { and, eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { guildFacilityUpgradeDonations } from "@/db/schema";
import {
  SETTLEMENT_RESOURCE_KEYS,
  isSettlementBuildingId,
  type GuildFacilityDonationProgressMap,
  type SettlementBuildingId,
  type SettlementResources,
} from "@/adventure/data/v2/settlement";
import type { DbExecutor } from "@/lib/server/savesKv";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

export function parseGuildFacilityDonationMaterials(
  raw: unknown,
): SettlementResources {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const materials: SettlementResources = {};
  for (const key of SETTLEMENT_RESOURCE_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      materials[key] = Math.floor(value);
    }
  }
  return materials;
}

export async function readGuildFacilityDonationProgress(
  tx: DbExecutor,
  guildId: number,
): Promise<GuildFacilityDonationProgressMap> {
  const rows = await tx
    .select({
      buildingId: guildFacilityUpgradeDonations.buildingId,
      targetLevel: guildFacilityUpgradeDonations.targetLevel,
      materials: guildFacilityUpgradeDonations.materials,
    })
    .from(guildFacilityUpgradeDonations)
    .where(eq(guildFacilityUpgradeDonations.guildId, guildId));
  const progress: GuildFacilityDonationProgressMap = {};
  for (const row of rows) {
    if (!isSettlementBuildingId(row.buildingId)) continue;
    progress[row.buildingId] = {
      targetLevel: Math.max(1, Math.floor(row.targetLevel)),
      materials: parseGuildFacilityDonationMaterials(row.materials),
    };
  }
  return progress;
}

// 빈 행을 먼저 보장한 뒤 FOR UPDATE 한다. 첫 기부가 동시에 들어와도 한 요청이 다른
// 요청의 누적분을 덮어쓰지 않는다. 현재 시설 레벨과 targetLevel 이 다르면 새 단계로 초기화한다.
export async function lockGuildFacilityDonationProgress(
  tx: Tx,
  guildId: number,
  buildingId: SettlementBuildingId,
  targetLevel: number,
): Promise<SettlementResources> {
  await tx
    .insert(guildFacilityUpgradeDonations)
    .values({ guildId, buildingId, targetLevel, materials: {} })
    .onConflictDoNothing();

  const row = (
    await tx
      .select({
        targetLevel: guildFacilityUpgradeDonations.targetLevel,
        materials: guildFacilityUpgradeDonations.materials,
      })
      .from(guildFacilityUpgradeDonations)
      .where(
        and(
          eq(guildFacilityUpgradeDonations.guildId, guildId),
          eq(guildFacilityUpgradeDonations.buildingId, buildingId),
        ),
      )
      .for("update")
      .limit(1)
  )[0];

  if (!row || row.targetLevel !== targetLevel) {
    await setGuildFacilityDonationProgress(
      tx,
      guildId,
      buildingId,
      targetLevel,
      {},
    );
    return {};
  }
  return parseGuildFacilityDonationMaterials(row.materials);
}

export async function setGuildFacilityDonationProgress(
  tx: Tx,
  guildId: number,
  buildingId: SettlementBuildingId,
  targetLevel: number,
  materials: SettlementResources,
): Promise<void> {
  const safe = parseGuildFacilityDonationMaterials(materials);
  await tx
    .insert(guildFacilityUpgradeDonations)
    .values({ guildId, buildingId, targetLevel, materials: safe })
    .onConflictDoUpdate({
      target: [
        guildFacilityUpgradeDonations.guildId,
        guildFacilityUpgradeDonations.buildingId,
      ],
      set: { targetLevel, materials: safe, updatedAt: new Date() },
    });
}

export async function clearGuildFacilityDonationProgress(
  tx: Tx,
  guildId: number,
  buildingId: SettlementBuildingId,
): Promise<void> {
  await tx
    .delete(guildFacilityUpgradeDonations)
    .where(
      and(
        eq(guildFacilityUpgradeDonations.guildId, guildId),
        eq(guildFacilityUpgradeDonations.buildingId, buildingId),
      ),
    );
}
