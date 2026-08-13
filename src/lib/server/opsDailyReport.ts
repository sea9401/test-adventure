import { desc, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { abuseEvents, adminAuditLog, economyEvents } from "@/db/schema";

type NumericAggregate = number | string;

type CountRow = {
  key: string;
  count: NumericAggregate;
};

export type OpsDailyReportAggregates = {
  abuseEvents: NumericAggregate;
  rateLimited: NumericAggregate;
  economyEvents: NumericAggregate;
  goldIn: NumericAggregate;
  goldOut: NumericAggregate;
  rewardFailures: NumericAggregate;
  adminActions: NumericAggregate;
  topEconomyEvents: CountRow[];
  topAbuseActions: CountRow[];
};

function safeInteger(value: NumericAggregate, label: string): number {
  const normalized = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`${label} aggregate is not a non-negative safe integer`);
  }
  return normalized;
}

function normalizeCountRows(rows: CountRow[], label: string) {
  return rows.map((row) => ({
    key: row.key,
    count: safeInteger(row.count, `${label}.${row.key}`),
  }));
}

export function buildOpsDailyReport(
  aggregates: OpsDailyReportAggregates,
  since: Date,
) {
  if (!Number.isFinite(since.getTime())) throw new Error("since must be a valid date");
  return {
    alertType: "ops.daily_report",
    since: since.toISOString(),
    abuseEvents: safeInteger(aggregates.abuseEvents, "abuseEvents"),
    rateLimited: safeInteger(aggregates.rateLimited, "rateLimited"),
    economyEvents: safeInteger(aggregates.economyEvents, "economyEvents"),
    goldIn: safeInteger(aggregates.goldIn, "goldIn"),
    goldOut: safeInteger(aggregates.goldOut, "goldOut"),
    rewardFailures: safeInteger(aggregates.rewardFailures, "rewardFailures"),
    adminActions: safeInteger(aggregates.adminActions, "adminActions"),
    topEconomyEvents: normalizeCountRows(
      aggregates.topEconomyEvents,
      "topEconomyEvents",
    ),
    topAbuseActions: normalizeCountRows(
      aggregates.topAbuseActions,
      "topAbuseActions",
    ),
  };
}

export async function collectOpsDailyReport(since: Date) {
  const abuseCount = sql<number>`count(*)::bigint`;
  const economyCount = sql<number>`count(*)::bigint`;
  const [
    [abuseTotals],
    [economyTotals],
    [auditTotals],
    topEconomyEvents,
    topAbuseActions,
  ] = await Promise.all([
    db
      .select({
        abuseEvents: sql<number>`count(*)::bigint`,
        rateLimited: sql<number>`count(*) filter (where ${abuseEvents.reason} = 'rate_limited')::bigint`,
      })
      .from(abuseEvents)
      .where(gte(abuseEvents.createdAt, since)),
    db
      .select({
        economyEvents: sql<number>`count(*)::bigint`,
        goldIn: sql<number>`coalesce(sum(case when ${economyEvents.goldDelta} > 0 then ${economyEvents.goldDelta} else 0 end), 0)::bigint`,
        goldOut: sql<number>`coalesce(sum(case when ${economyEvents.goldDelta} < 0 then -${economyEvents.goldDelta} else 0 end), 0)::bigint`,
        rewardFailures: sql<number>`count(*) filter (where ${economyEvents.eventType} like 'reward.failure.%')::bigint`,
      })
      .from(economyEvents)
      .where(gte(economyEvents.createdAt, since)),
    db
      .select({ adminActions: sql<number>`count(*)::bigint` })
      .from(adminAuditLog)
      .where(gte(adminAuditLog.createdAt, since)),
    db
      .select({ key: economyEvents.eventType, count: economyCount })
      .from(economyEvents)
      .where(gte(economyEvents.createdAt, since))
      .groupBy(economyEvents.eventType)
      .orderBy(desc(economyCount), economyEvents.eventType)
      .limit(8),
    db
      .select({ key: abuseEvents.action, count: abuseCount })
      .from(abuseEvents)
      .where(gte(abuseEvents.createdAt, since))
      .groupBy(abuseEvents.action)
      .orderBy(desc(abuseCount), abuseEvents.action)
      .limit(8),
  ]);

  return buildOpsDailyReport(
    {
      abuseEvents: abuseTotals?.abuseEvents ?? 0,
      rateLimited: abuseTotals?.rateLimited ?? 0,
      economyEvents: economyTotals?.economyEvents ?? 0,
      goldIn: economyTotals?.goldIn ?? 0,
      goldOut: economyTotals?.goldOut ?? 0,
      rewardFailures: economyTotals?.rewardFailures ?? 0,
      adminActions: auditTotals?.adminActions ?? 0,
      topEconomyEvents,
      topAbuseActions,
    },
    since,
  );
}
