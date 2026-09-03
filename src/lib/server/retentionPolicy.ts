import { FEED_RETENTION_DAYS } from "@/lib/feed-config";

export const DAY_MS = 24 * 60 * 60 * 1_000;

export const RETENTION_POLICY = {
  abuseDays: 30,
  economyDays: 30,
  adminAuditDays: 60,
  endedSanctionDays: 60,
  coopReplayDays: 7,
  coopReplaysPerSession: 100,
  guildActivitiesPerGuild: 500,
  marketplaceClosedDays: 60,
  arenaTournamentDays: 30,
  serverFeedDays: FEED_RETENTION_DAYS,
  pushDeliveryDays: 30,
  resolvedUgcReportDays: 180,
  storageMetricsDays: 30,
  deleteBatchSize: 5_000,
  economyDeleteMaxBatches: 24,
  backlogDeleteMaxBatches: 6,
  tableDailyGrowthBytes: 100 * 1024 * 1024,
  tableDailyGrowthRatio: 0.2,
  storageWarningRatio: 0.7,
  storageCriticalRatio: 0.85,
} as const;

export function retentionCutoff(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export type EconomyRetentionLoad = {
  inflow24h: number;
  dailyDeleteCapacity: number;
  utilizationPct: number;
  level: "normal" | "warning" | "critical";
};

export function economyRetentionLoad(inflow24h: number): EconomyRetentionLoad {
  const normalized =
    Number.isSafeInteger(inflow24h) && inflow24h > 0 ? inflow24h : 0;
  const dailyDeleteCapacity =
    RETENTION_POLICY.deleteBatchSize * RETENTION_POLICY.economyDeleteMaxBatches;
  const ratio = normalized / dailyDeleteCapacity;
  return {
    inflow24h: normalized,
    dailyDeleteCapacity,
    utilizationPct: Math.round(ratio * 10_000) / 100,
    level: ratio >= 1 ? "critical" : ratio >= 0.8 ? "warning" : "normal",
  };
}

export async function drainRetentionBatches(
  runBatch: () => Promise<{ deleted: number; more: boolean }>,
  maxBatches: number,
): Promise<{ deleted: number; more: boolean }> {
  const limit = Math.max(1, Math.floor(maxBatches));
  let deleted = 0;
  let more = false;
  for (let batch = 0; batch < limit; batch += 1) {
    const result = await runBatch();
    deleted += result.deleted;
    more = result.more;
    if (!more) break;
  }
  return { deleted, more };
}
