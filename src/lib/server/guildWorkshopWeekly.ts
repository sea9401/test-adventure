import { eq } from "drizzle-orm";
import type { db as dbType } from "@/db";
import { guildWorkshopWeekly } from "@/db/schema";
import {
  addGuildWorkshopWeeklyProgress,
  parseGuildWorkshopWeeklyState,
  type GuildWorkshopWeeklyState,
} from "@/adventure/data/v2/guildWorkshopWeekly";
import {
  seasonIdFor,
  weekEndUtcFor,
  weekStartUtcFor,
} from "@/lib/server/pvp/season";

type Tx = Parameters<Parameters<typeof dbType.transaction>[0]>[0];

export function currentGuildWorkshopWeek(now: Date = new Date()): {
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
        craftCount?: number | null;
        qualityCount?: number | null;
        claimed?: unknown;
      }
    | null
    | undefined,
  weekKey: string,
): GuildWorkshopWeeklyState {
  return parseGuildWorkshopWeeklyState(
    row
      ? {
          weekKey: row.weekKey,
          craftCount: row.craftCount,
          qualityCount: row.qualityCount,
          claimed: row.claimed,
        }
      : null,
    weekKey,
  );
}

export async function lockGuildWorkshopWeeklyState(
  tx: Tx,
  guildId: number,
  weekKey: string,
): Promise<GuildWorkshopWeeklyState> {
  await tx
    .insert(guildWorkshopWeekly)
    .values({ guildId, weekKey })
    .onConflictDoNothing();

  const row = (
    await tx
      .select({
        weekKey: guildWorkshopWeekly.weekKey,
        craftCount: guildWorkshopWeekly.craftCount,
        qualityCount: guildWorkshopWeekly.qualityCount,
        claimed: guildWorkshopWeekly.claimed,
      })
      .from(guildWorkshopWeekly)
      .where(eq(guildWorkshopWeekly.guildId, guildId))
      .for("update")
      .limit(1)
  )[0];
  const state = rowToState(row, weekKey);
  if (row?.weekKey !== weekKey) {
    await saveGuildWorkshopWeeklyState(tx, guildId, state);
  }
  return state;
}

export async function readGuildWorkshopWeeklyState(
  tx: Tx,
  guildId: number,
  weekKey: string,
): Promise<GuildWorkshopWeeklyState> {
  const row = (
    await tx
      .select({
        weekKey: guildWorkshopWeekly.weekKey,
        craftCount: guildWorkshopWeekly.craftCount,
        qualityCount: guildWorkshopWeekly.qualityCount,
        claimed: guildWorkshopWeekly.claimed,
      })
      .from(guildWorkshopWeekly)
      .where(eq(guildWorkshopWeekly.guildId, guildId))
      .limit(1)
  )[0];
  return rowToState(row, weekKey);
}

export async function saveGuildWorkshopWeeklyState(
  tx: Tx,
  guildId: number,
  state: GuildWorkshopWeeklyState,
): Promise<void> {
  await tx
    .insert(guildWorkshopWeekly)
    .values({
      guildId,
      weekKey: state.weekKey,
      craftCount: state.craftCount,
      qualityCount: state.qualityCount,
      claimed: state.claimed,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: guildWorkshopWeekly.guildId,
      set: {
        weekKey: state.weekKey,
        craftCount: state.craftCount,
        qualityCount: state.qualityCount,
        claimed: state.claimed,
        updatedAt: new Date(),
      },
    });
}

export async function incrementGuildWorkshopWeeklyProgress(
  tx: Tx,
  guildId: number,
  qualityCrafted: boolean,
  now: Date = new Date(),
): Promise<GuildWorkshopWeeklyState> {
  const week = currentGuildWorkshopWeek(now);
  const state = await lockGuildWorkshopWeeklyState(tx, guildId, week.key);
  const next = addGuildWorkshopWeeklyProgress(state, qualityCrafted);
  await saveGuildWorkshopWeeklyState(tx, guildId, next);
  return next;
}
