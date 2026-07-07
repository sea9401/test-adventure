import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { guildExplorationWeekly, guildMembers } from "@/db/schema";
import {
  addGuildExplorationProgress,
  guildExplorationWeeklyClaimedPayload,
  parseGuildExplorationWeeklyState,
  type GuildExplorationWeeklyMetric,
  type GuildExplorationWeeklyState,
} from "@/adventure/data/v2/guildExploration";
import { explorationHqUpgradeForLevel } from "@/adventure/data/v2/settlement";
import { maxGuildSettlementBuildingLevel } from "./settlementBuildingLevels";
import {
  seasonIdFor,
  weekEndUtcFor,
  weekStartUtcFor,
} from "./pvp/season";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

export function currentGuildExplorationWeek(now: Date = new Date()): {
  key: string;
  endsAt: Date;
} {
  const start = weekStartUtcFor(now);
  return { key: seasonIdFor(start), endsAt: weekEndUtcFor(start) };
}

function rowToState(
  row:
    | {
        weekKey?: string | null;
        coopEpicProgress?: number | null;
        huntWinProgress?: number | null;
        deepHuntWinProgress?: number | null;
        fishingCatchProgress?: number | null;
        claimed?: unknown;
      }
    | null
    | undefined,
  weekKey: string,
): GuildExplorationWeeklyState {
  return parseGuildExplorationWeeklyState(
    row
      ? {
          weekKey: row.weekKey,
          coopEpicProgress: row.coopEpicProgress,
          huntWinProgress: row.huntWinProgress,
          deepHuntWinProgress: row.deepHuntWinProgress,
          fishingCatchProgress: row.fishingCatchProgress,
          claimed: row.claimed,
        }
      : null,
    weekKey,
  );
}

export async function lockGuildExplorationWeeklyState(
  tx: Tx,
  guildId: number,
  weekKey: string,
): Promise<GuildExplorationWeeklyState> {
  await tx
    .insert(guildExplorationWeekly)
    .values({ guildId, weekKey })
    .onConflictDoNothing();

  const row = (
    await tx
      .select({
        weekKey: guildExplorationWeekly.weekKey,
        coopEpicProgress: guildExplorationWeekly.coopEpicProgress,
        huntWinProgress: guildExplorationWeekly.huntWinProgress,
        deepHuntWinProgress: guildExplorationWeekly.deepHuntWinProgress,
        fishingCatchProgress: guildExplorationWeekly.fishingCatchProgress,
        claimed: guildExplorationWeekly.claimed,
      })
      .from(guildExplorationWeekly)
      .where(eq(guildExplorationWeekly.guildId, guildId))
      .for("update")
      .limit(1)
  )[0];
  const state = rowToState(row, weekKey);
  if (row?.weekKey !== weekKey) {
    await saveGuildExplorationWeeklyState(tx, guildId, state);
  }
  return state;
}

export async function readGuildExplorationWeeklyState(
  tx: Tx,
  guildId: number,
  weekKey: string,
): Promise<GuildExplorationWeeklyState> {
  const row = (
    await tx
      .select({
        weekKey: guildExplorationWeekly.weekKey,
        coopEpicProgress: guildExplorationWeekly.coopEpicProgress,
        huntWinProgress: guildExplorationWeekly.huntWinProgress,
        deepHuntWinProgress: guildExplorationWeekly.deepHuntWinProgress,
        fishingCatchProgress: guildExplorationWeekly.fishingCatchProgress,
        claimed: guildExplorationWeekly.claimed,
      })
      .from(guildExplorationWeekly)
      .where(eq(guildExplorationWeekly.guildId, guildId))
      .limit(1)
  )[0];
  return rowToState(row, weekKey);
}

export async function saveGuildExplorationWeeklyState(
  tx: Tx,
  guildId: number,
  state: GuildExplorationWeeklyState,
): Promise<void> {
  await tx
    .insert(guildExplorationWeekly)
    .values({
      guildId,
      weekKey: state.weekKey,
      coopEpicProgress: state.coopEpicProgress,
      huntWinProgress: state.huntWinProgress,
      deepHuntWinProgress: state.deepHuntWinProgress,
      fishingCatchProgress: state.fishingCatchProgress,
      claimed: guildExplorationWeeklyClaimedPayload(state),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: guildExplorationWeekly.guildId,
      set: {
        weekKey: state.weekKey,
        coopEpicProgress: state.coopEpicProgress,
        huntWinProgress: state.huntWinProgress,
        deepHuntWinProgress: state.deepHuntWinProgress,
        fishingCatchProgress: state.fishingCatchProgress,
        claimed: guildExplorationWeeklyClaimedPayload(state),
        updatedAt: new Date(),
      },
    });
}

export async function explorationHqLevelForGuild(
  tx: Tx,
  guildId: number,
): Promise<number> {
  return maxGuildSettlementBuildingLevel(tx, guildId, "exploration_hq");
}

export async function incrementGuildExplorationCoopProgress(
  tx: Tx,
  guildId: number,
  now: Date = new Date(),
): Promise<GuildExplorationWeeklyState | null> {
  return incrementGuildExplorationProgress(
    tx,
    guildId,
    "coopBossTierClaims",
    1,
    now,
  );
}

export async function incrementGuildExplorationProgress(
  tx: Tx,
  guildId: number,
  metric: GuildExplorationWeeklyMetric,
  count = 1,
  now: Date = new Date(),
): Promise<GuildExplorationWeeklyState | null> {
  const level = await explorationHqLevelForGuild(tx, guildId);
  if (level <= 0) return null;
  const week = currentGuildExplorationWeek(now);
  const upgrade = explorationHqUpgradeForLevel(level);
  const state = await lockGuildExplorationWeeklyState(tx, guildId, week.key);
  const next = addGuildExplorationProgress(
    state,
    metric,
    upgrade.missionProgressBonusPct,
    count,
  );
  await saveGuildExplorationWeeklyState(tx, guildId, next);
  return next;
}

export async function incrementGuildExplorationProgressForUser(
  tx: Tx,
  userId: string,
  metric: GuildExplorationWeeklyMetric,
  count = 1,
  now: Date = new Date(),
): Promise<GuildExplorationWeeklyState | null> {
  const membership = (
    await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(eq(guildMembers.userId, userId))
      .limit(1)
  )[0];
  if (!membership) return null;
  return incrementGuildExplorationProgress(
    tx,
    membership.guildId,
    metric,
    count,
    now,
  );
}
