import { eq } from "drizzle-orm";
import type { db } from "@/db";
import {
  adventurerAssociationFacilities,
  guildMembers,
} from "@/db/schema";
import {
  ADVENTURER_ASSOCIATION_FACILITY_IDS,
  nextAssociationFacilityUpgrade,
  type AdventurerAssociationFacilityId,
  type AdventurerAssociationFacilityProgress,
} from "@/adventure/data/v2/adventurerAssociation";
import {
  settlementBuildingMaxLevel,
  type SettlementResources,
} from "@/adventure/data/v2/settlement";
import type { DbExecutor } from "./savesKv";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function canUseAdventurerAssociation(
  executor: DbExecutor,
  userId: string,
): Promise<boolean> {
  const membership = (
    await executor
      .select({ userId: guildMembers.userId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1)
  )[0];
  return membership == null;
}

function nonNegativeInt(value: unknown): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function resources(value: unknown): SettlementResources {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SettlementResources)
    : {};
}

function progressFromRow(
  buildingId: AdventurerAssociationFacilityId,
  row?: {
    level: number;
    targetLevel: number;
    materials: unknown;
    gold: number;
  },
): AdventurerAssociationFacilityProgress {
  const level = Math.max(
    1,
    Math.min(
      settlementBuildingMaxLevel(buildingId, "association"),
      Math.floor(row?.level ?? 1),
    ),
  );
  const next = nextAssociationFacilityUpgrade(buildingId, level);
  return {
    buildingId,
    level,
    targetLevel: next?.level ?? null,
    materials: next ? resources(row?.materials) : {},
    gold: next ? nonNegativeInt(row?.gold) : 0,
  };
}

export async function readAssociationFacilities(
  executor: DbExecutor,
): Promise<AdventurerAssociationFacilityProgress[]> {
  const rows = await executor.select().from(adventurerAssociationFacilities);
  const byId = new Map(rows.map((row) => [row.buildingId, row]));
  return ADVENTURER_ASSOCIATION_FACILITY_IDS.map((buildingId) =>
    progressFromRow(buildingId, byId.get(buildingId)),
  );
}

export async function lockAssociationFacility(
  tx: Tx,
  buildingId: AdventurerAssociationFacilityId,
): Promise<AdventurerAssociationFacilityProgress> {
  await tx
    .insert(adventurerAssociationFacilities)
    .values({ buildingId, level: 1, targetLevel: 2 })
    .onConflictDoNothing();
  const row = (
    await tx
      .select()
      .from(adventurerAssociationFacilities)
      .where(eq(adventurerAssociationFacilities.buildingId, buildingId))
      .for("update")
      .limit(1)
  )[0];
  return progressFromRow(buildingId, row);
}

export async function saveAssociationFacility(
  tx: Tx,
  progress: AdventurerAssociationFacilityProgress,
): Promise<void> {
  await tx
    .insert(adventurerAssociationFacilities)
    .values({
      buildingId: progress.buildingId,
      level: progress.level,
      targetLevel: progress.targetLevel ?? 5,
      materials: progress.materials,
      gold: progress.gold,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: adventurerAssociationFacilities.buildingId,
      set: {
        level: progress.level,
        targetLevel: progress.targetLevel ?? 5,
        materials: progress.materials,
        gold: progress.gold,
        updatedAt: new Date(),
      },
    });
}

export async function associationFacilityLevel(
  executor: DbExecutor,
  buildingId: AdventurerAssociationFacilityId,
): Promise<number> {
  const row = (
    await executor
      .select({ level: adventurerAssociationFacilities.level })
      .from(adventurerAssociationFacilities)
      .where(eq(adventurerAssociationFacilities.buildingId, buildingId))
      .limit(1)
  )[0];
  return Math.max(
    1,
    Math.min(
      settlementBuildingMaxLevel(buildingId, "association"),
      Math.floor(row?.level ?? 1),
    ),
  );
}
