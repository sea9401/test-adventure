import { and, eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { guildFacilityOperations } from "@/db/schema";
import {
  accrueGuildFacilityOperationsState,
  guildFacilityOperationsRequired,
  guildFacilityOperationsView,
  normalizeGuildFacilityOperationsState,
  GUILD_FACILITY_OPERATIONS_MIN_LEVEL,
  type GuildFacilityOperationsState,
  type GuildFacilityOperationsView,
} from "@/adventure/data/v2/guildFacilityOperations";
import { todayGuildTrainingWeekKey } from "@/adventure/data/v2/guildTrainingGround";
import {
  GUILD_FACILITY_EXPANDED_IDS,
  settlementBuildingMaxLevel,
  type GuildFacilityExpandedId,
  type SettlementBuildingId,
} from "@/adventure/data/v2/settlement";
import { readGuildFacilityLevel } from "@/lib/server/guildFacilities";
import type { DbExecutor } from "@/lib/server/savesKv";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

function canAccrueAtLevel(
  buildingId: GuildFacilityExpandedId,
  level: number,
): boolean {
  return (
    level >= GUILD_FACILITY_OPERATIONS_MIN_LEVEL &&
    level < settlementBuildingMaxLevel(buildingId, "guild_facility")
  );
}

// 빈 행을 먼저 보장한 뒤 FOR UPDATE 한다. 동시 적립이 서로의 점수를 덮어쓰지 않는다.
export async function lockGuildFacilityOperations(
  tx: Tx,
  guildId: number,
  buildingId: GuildFacilityExpandedId,
  currentLevel: number,
  now: Date = new Date(),
): Promise<GuildFacilityOperationsState> {
  const weekKey = todayGuildTrainingWeekKey(now);
  await tx
    .insert(guildFacilityOperations)
    .values({
      guildId,
      buildingId,
      targetLevel: currentLevel + 1,
      points: 0,
      weekKey,
      weekPoints: 0,
    })
    .onConflictDoNothing();
  const row = (
    await tx
      .select({
        targetLevel: guildFacilityOperations.targetLevel,
        points: guildFacilityOperations.points,
        weekKey: guildFacilityOperations.weekKey,
        weekPoints: guildFacilityOperations.weekPoints,
      })
      .from(guildFacilityOperations)
      .where(
        and(
          eq(guildFacilityOperations.guildId, guildId),
          eq(guildFacilityOperations.buildingId, buildingId),
        ),
      )
      .for("update")
      .limit(1)
  )[0];
  return normalizeGuildFacilityOperationsState(row ?? null, {
    currentLevel,
    weekKey,
  });
}

export async function saveGuildFacilityOperations(
  tx: Tx,
  guildId: number,
  buildingId: GuildFacilityExpandedId,
  state: GuildFacilityOperationsState,
): Promise<void> {
  await tx
    .update(guildFacilityOperations)
    .set({
      targetLevel: state.targetLevel,
      points: state.points,
      weekKey: state.weekKey,
      weekPoints: state.weekPoints,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(guildFacilityOperations.guildId, guildId),
        eq(guildFacilityOperations.buildingId, buildingId),
      ),
    );
}

// 시설 이용 활동이 성공한 같은 트랜잭션에서 호출한다. 실제 적립량을 돌려준다.
export async function accrueGuildFacilityOperations(
  tx: Tx,
  args: {
    guildId: number;
    buildingId: GuildFacilityExpandedId;
    points: number;
    now?: Date;
  },
): Promise<number> {
  const level = await readGuildFacilityLevel(tx, args.guildId, args.buildingId);
  if (!canAccrueAtLevel(args.buildingId, level) || args.points <= 0) return 0;
  const state = await lockGuildFacilityOperations(
    tx,
    args.guildId,
    args.buildingId,
    level,
    args.now,
  );
  const result = accrueGuildFacilityOperationsState(state, args.points, {
    currentLevel: level,
    maxLevel: settlementBuildingMaxLevel(args.buildingId, "guild_facility"),
  });
  if (result.accrued > 0) {
    await saveGuildFacilityOperations(
      tx,
      args.guildId,
      args.buildingId,
      result.state,
    );
  }
  return result.accrued;
}

// 길드 정보 화면용. 목표가 Lv.6 이상이고 최대 레벨 전인 시설만 돌려준다.
export async function readGuildFacilityOperationsViews(
  executor: DbExecutor,
  guildId: number,
  levels: Partial<Record<SettlementBuildingId, number>>,
  now: Date = new Date(),
): Promise<Partial<Record<GuildFacilityExpandedId, GuildFacilityOperationsView>>> {
  const rows = await executor
    .select({
      buildingId: guildFacilityOperations.buildingId,
      targetLevel: guildFacilityOperations.targetLevel,
      points: guildFacilityOperations.points,
      weekKey: guildFacilityOperations.weekKey,
      weekPoints: guildFacilityOperations.weekPoints,
    })
    .from(guildFacilityOperations)
    .where(eq(guildFacilityOperations.guildId, guildId));
  const byId = new Map(rows.map((row) => [row.buildingId, row]));
  const weekKey = todayGuildTrainingWeekKey(now);
  const views: Partial<Record<GuildFacilityExpandedId, GuildFacilityOperationsView>> = {};
  for (const buildingId of GUILD_FACILITY_EXPANDED_IDS) {
    const level = Math.floor(levels[buildingId] ?? 0);
    if (!canAccrueAtLevel(buildingId, level)) continue;
    const state = normalizeGuildFacilityOperationsState(
      byId.get(buildingId) ?? null,
      { currentLevel: level, weekKey },
    );
    if (guildFacilityOperationsRequired(state.targetLevel) <= 0) continue;
    views[buildingId] = guildFacilityOperationsView(state);
  }
  return views;
}
