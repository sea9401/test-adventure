import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { artisanLeaderboardSnapshots, savesKv } from "@/db/schema";
import {
  parseArtisanWeeklyWorkshopStats,
  rankArtisanLeaderboardEntries,
} from "@/adventure/data/v2/artisanLeaderboard";

type SnapshotCandidate = {
  userId: string;
  weekKey: string;
  totalCrafts: number;
  qualityCrafts: number;
  weeklyXp: number;
};

function candidateFromSave(row: {
  userId: string;
  value: unknown;
}): SnapshotCandidate | null {
  const value = (row.value ?? null) as { weeklyWorkshopStats?: unknown } | null;
  const raw = value?.weeklyWorkshopStats;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const weekKey =
    typeof (raw as Record<string, unknown>).weekKey === "string"
      ? String((raw as Record<string, unknown>).weekKey)
      : "";
  if (!weekKey) return null;
  const stats = parseArtisanWeeklyWorkshopStats(raw, weekKey);
  if (stats.totalCrafts <= 0 && stats.qualityCrafts <= 0 && stats.xp <= 0) {
    return null;
  }
  return {
    userId: row.userId,
    weekKey,
    totalCrafts: stats.totalCrafts,
    qualityCrafts: stats.qualityCrafts,
    weeklyXp: stats.xp,
  };
}

export async function snapshotStaleArtisanLeaderboards(
  currentWeekKey: string,
): Promise<number> {
  const rows = await db
    .select({ userId: savesKv.userId, value: savesKv.value })
    .from(savesKv)
    .where(eq(savesKv.key, "crafting.v2"));
  const candidates = rows
    .map(candidateFromSave)
    .filter((row): row is SnapshotCandidate => row != null)
    .filter((row) => row.weekKey !== currentWeekKey);
  const weekKeys = Array.from(new Set(candidates.map((row) => row.weekKey)));
  if (weekKeys.length === 0) return 0;

  const existing = await db
    .select({ weekKey: artisanLeaderboardSnapshots.weekKey })
    .from(artisanLeaderboardSnapshots)
    .where(inArray(artisanLeaderboardSnapshots.weekKey, weekKeys));
  const existingWeeks = new Set(existing.map((row) => row.weekKey));
  let inserted = 0;
  for (const weekKey of weekKeys) {
    if (existingWeeks.has(weekKey)) continue;
    const ranked = rankArtisanLeaderboardEntries(
      candidates.filter((row) => row.weekKey === weekKey),
    );
    if (ranked.length === 0) continue;
    const values = ranked.map((entry, index) => ({
      weekKey,
      userId: entry.userId,
      rank: index + 1,
      totalCrafts: entry.totalCrafts,
      qualityCrafts: entry.qualityCrafts,
      weeklyXp: entry.weeklyXp,
    }));
    const result = await db
      .insert(artisanLeaderboardSnapshots)
      .values(values)
      .onConflictDoNothing()
      .returning({ userId: artisanLeaderboardSnapshots.userId });
    inserted += result.length;
  }
  return inserted;
}

export async function latestArtisanLeaderboardSnapshotForUser(userId: string) {
  const rows = await db
    .select({
      weekKey: artisanLeaderboardSnapshots.weekKey,
      rank: artisanLeaderboardSnapshots.rank,
      totalCrafts: artisanLeaderboardSnapshots.totalCrafts,
      qualityCrafts: artisanLeaderboardSnapshots.qualityCrafts,
      weeklyXp: artisanLeaderboardSnapshots.weeklyXp,
      rewardClaimedAt: artisanLeaderboardSnapshots.rewardClaimedAt,
    })
    .from(artisanLeaderboardSnapshots)
    .where(eq(artisanLeaderboardSnapshots.userId, userId))
    .orderBy(desc(artisanLeaderboardSnapshots.weekKey))
    .limit(1);
  return rows[0] ?? null;
}
