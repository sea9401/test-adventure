import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import {
  adventurerAssociationFacilities,
  guildMembers,
  savesKv,
} from "@/db/schema";
import {
  ADVENTURER_ASSOCIATION_FACILITY_IDS,
  WEEKLY_FACILITY_SOURCE_SAVE_KEY,
  nextAssociationFacilityUpgrade,
  parseWeeklyFacilitySourceState,
  resolveWeeklyFacilitySourceClaim,
  weeklyFacilitySourcesAfterGuildJoin,
  type AdventurerAssociationFacilityId,
  type AdventurerAssociationFacilityProgress,
  type WeeklyFacilitySource,
  type WeeklyFacilitySourceSelection,
} from "@/adventure/data/v2/adventurerAssociation";
import type { SettlementResources } from "@/adventure/data/v2/settlement";
import { readSave, upsertSave, type DbExecutor } from "./savesKv";

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
  const level = Math.max(1, Math.min(5, Math.floor(row?.level ?? 1)));
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
  return Math.max(1, Math.min(5, Math.floor(row?.level ?? 1)));
}

export async function readWeeklyFacilitySource(
  executor: DbExecutor,
  userId: string,
  buildingId: AdventurerAssociationFacilityId,
  weekKey: string,
): Promise<WeeklyFacilitySource | null> {
  return (
    await readWeeklyFacilitySourceSelection(
      executor,
      userId,
      buildingId,
      weekKey,
    )
  )?.source ?? null;
}

export async function readWeeklyFacilitySourceSelection(
  executor: DbExecutor,
  userId: string,
  buildingId: AdventurerAssociationFacilityId,
  weekKey: string,
): Promise<WeeklyFacilitySourceSelection | null> {
  const raw = await readSave(
    executor,
    userId,
    WEEKLY_FACILITY_SOURCE_SAVE_KEY,
    {},
  );
  const selected = parseWeeklyFacilitySourceState(raw)[buildingId];
  return selected?.weekKey === weekKey ? selected : null;
}

export async function claimWeeklyFacilitySource(
  tx: Tx,
  userId: string,
  buildingId: AdventurerAssociationFacilityId,
  source: WeeklyFacilitySource,
  weekKey: string,
  guildId?: number,
): Promise<{ ok: true } | { ok: false; selected: WeeklyFacilitySource }> {
  // 미존재 saves_kv 행은 FOR UPDATE로 잠글 수 없으므로 먼저 빈 행을 만든다.
  await tx
    .insert(savesKv)
    .values({
      userId,
      key: WEEKLY_FACILITY_SOURCE_SAVE_KEY,
      value: {},
      version: 1,
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
  const row = (
    await tx
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(
        and(
          eq(savesKv.userId, userId),
          eq(savesKv.key, WEEKLY_FACILITY_SOURCE_SAVE_KEY),
        ),
      )
      .for("update")
      .limit(1)
  )[0];
  const raw = row?.value ?? {};
  const state = parseWeeklyFacilitySourceState(raw);
  const current = state[buildingId];
  const decision = resolveWeeklyFacilitySourceClaim(buildingId, current, {
    weekKey,
    source,
    ...(source === "guild" && guildId != null ? { guildId } : {}),
  });
  if (!decision.ok) {
    return decision;
  }
  await upsertSave(tx, userId, WEEKLY_FACILITY_SOURCE_SAVE_KEY, {
    ...state,
    [buildingId]: decision.selection,
  });
  return { ok: true };
}

export async function reconcileWeeklyFacilitySourcesOnGuildJoin(
  tx: Tx,
  userId: string,
  guildId: number,
  weekKey: string,
): Promise<AdventurerAssociationFacilityId[]> {
  await tx
    .insert(savesKv)
    .values({
      userId,
      key: WEEKLY_FACILITY_SOURCE_SAVE_KEY,
      value: {},
      version: 1,
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
  const row = (
    await tx
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(
        and(
          eq(savesKv.userId, userId),
          eq(savesKv.key, WEEKLY_FACILITY_SOURCE_SAVE_KEY),
        ),
      )
      .for("update")
      .limit(1)
  )[0];
  const current = parseWeeklyFacilitySourceState(row?.value ?? {});
  const result = weeklyFacilitySourcesAfterGuildJoin(
    current,
    weekKey,
    guildId,
  );
  if (result.transferred.length > 0) {
    await upsertSave(
      tx,
      userId,
      WEEKLY_FACILITY_SOURCE_SAVE_KEY,
      result.state,
    );
  }
  return result.transferred;
}
