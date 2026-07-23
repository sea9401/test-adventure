import { eq } from "drizzle-orm";
import { db } from "@/db";
import { guildDiningWeekly, guildMembers } from "@/db/schema";
import {
  GUILD_DINING_USER_SAVE_KEY,
  consumeGuildDiningEffectState,
  guildDiningPantryTarget,
  parseGuildDiningUserState,
  type GuildDiningBonusKind,
  type GuildDiningMenuId,
} from "@/adventure/data/v2/guildDining";
import { kstWeekMondayKey } from "@/lib/kst";
import {
  lockSaveForUpdate,
  readSave,
  upsertSave,
  type DbExecutor,
} from "./savesKv";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type GuildDiningWeeklyRow = {
  guildId: number;
  weekKey: string;
  selectedMenuIds: GuildDiningMenuId[];
  pantryPoints: number;
  targetPoints: number;
  eligibleUserIds: string[];
};

function stringList(raw: unknown): string[] {
  return Array.isArray(raw)
    ? [...new Set(raw.filter((value): value is string => typeof value === "string"))]
    : [];
}

async function memberIds(tx: Tx, guildId: number): Promise<string[]> {
  const rows = await tx
    .select({ userId: guildMembers.userId })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));
  return rows.map((row) => row.userId);
}

export async function lockGuildDiningWeekly(
  tx: Tx,
  guildId: number,
  weekKey: string,
): Promise<GuildDiningWeeklyRow> {
  const eligibleUserIds = await memberIds(tx, guildId);
  const targetPoints = guildDiningPantryTarget(eligibleUserIds.length);
  await tx
    .insert(guildDiningWeekly)
    .values({
      guildId,
      weekKey,
      selectedMenuIds: ["hearty_stew"],
      pantryPoints: 0,
      targetPoints,
      eligibleUserIds,
    })
    .onConflictDoNothing();

  let row = (
    await tx
      .select()
      .from(guildDiningWeekly)
      .where(eq(guildDiningWeekly.guildId, guildId))
      .for("update")
      .limit(1)
  )[0];

  if (row.weekKey !== weekKey) {
    row = (
      await tx
        .update(guildDiningWeekly)
        .set({
          weekKey,
          selectedMenuIds: ["hearty_stew"],
          pantryPoints: 0,
          targetPoints,
          eligibleUserIds,
          updatedAt: new Date(),
        })
        .where(eq(guildDiningWeekly.guildId, guildId))
        .returning()
    )[0];
  }

  return {
    guildId,
    weekKey,
    selectedMenuIds: stringList(row.selectedMenuIds) as GuildDiningMenuId[],
    pantryPoints: Math.max(0, Math.floor(row.pantryPoints)),
    targetPoints: Math.max(1, Math.floor(row.targetPoints)),
    eligibleUserIds: stringList(row.eligibleUserIds),
  };
}

export async function updateGuildDiningWeekly(
  tx: Tx,
  state: GuildDiningWeeklyRow,
): Promise<void> {
  await tx
    .update(guildDiningWeekly)
    .set({
      weekKey: state.weekKey,
      selectedMenuIds: state.selectedMenuIds,
      pantryPoints: state.pantryPoints,
      targetPoints: state.targetPoints,
      eligibleUserIds: state.eligibleUserIds,
      updatedAt: new Date(),
    })
    .where(eq(guildDiningWeekly.guildId, state.guildId));
}

export async function consumeGuildDiningEffect(
  tx: DbExecutor,
  userId: string,
  kind: GuildDiningBonusKind,
  baseAmount: number,
  now: Date = new Date(),
): Promise<{ bonus: number; expiresAt: number; menuId: GuildDiningMenuId | null }> {
  const weekKey = kstWeekMondayKey(now);
  const snapshot = await readSave<Record<string, unknown>>(
    tx,
    userId,
    GUILD_DINING_USER_SAVE_KEY,
    {},
  );
  const snapshotGuildId = Math.max(0, Math.floor(Number(snapshot.guildId) || 0));
  const snapshotState = parseGuildDiningUserState(snapshot, {
    weekKey,
    guildId: snapshotGuildId,
    now,
  });
  if (
    snapshotState.activeEffect?.kind !== kind &&
    snapshotState.activeEffect?.kind !== "all_xp"
  ) {
    return { bonus: 0, expiresAt: 0, menuId: null };
  }

  const raw = await lockSaveForUpdate<Record<string, unknown>>(
    tx,
    userId,
    GUILD_DINING_USER_SAVE_KEY,
    {},
  );
  const storedGuildId = Math.max(0, Math.floor(Number(raw.guildId) || 0));
  const state = parseGuildDiningUserState(raw, {
    weekKey,
    guildId: storedGuildId,
    now,
  });
  const result = consumeGuildDiningEffectState(state, kind, baseAmount, now);
  if (result.consumed) {
    await upsertSave(tx, userId, GUILD_DINING_USER_SAVE_KEY, result.state);
  }
  return {
    bonus: result.bonus,
    expiresAt: result.state.activeEffect?.expiresAt ?? 0,
    menuId: result.state.activeEffect?.menuId ?? null,
  };
}
