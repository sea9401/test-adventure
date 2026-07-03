import { desc, gte } from "drizzle-orm";
import { db } from "@/db";
import { abuseEvents, adminAuditLog, economyEvents } from "@/db/schema";
import { requireCronAuth } from "@/lib/server/cronAuth";
import { sendOpsAlert } from "@/lib/server/opsAlert";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const since = new Date(Date.now() - DAY_MS);
  const [abuseRows, economyRows, auditRows] = await Promise.all([
    db
      .select({
        action: abuseEvents.action,
        reason: abuseEvents.reason,
        createdAt: abuseEvents.createdAt,
      })
      .from(abuseEvents)
      .where(gte(abuseEvents.createdAt, since))
      .orderBy(desc(abuseEvents.id))
      .limit(2_000),
    db
      .select({
        eventType: economyEvents.eventType,
        goldDelta: economyEvents.goldDelta,
        itemKind: economyEvents.itemKind,
        quantity: economyEvents.quantity,
        createdAt: economyEvents.createdAt,
      })
      .from(economyEvents)
      .where(gte(economyEvents.createdAt, since))
      .orderBy(desc(economyEvents.id))
      .limit(2_000),
    db
      .select({
        action: adminAuditLog.action,
        createdAt: adminAuditLog.createdAt,
      })
      .from(adminAuditLog)
      .where(gte(adminAuditLog.createdAt, since))
      .orderBy(desc(adminAuditLog.id))
      .limit(1_000),
  ]);

  const goldIn = economyRows.reduce((sum, row) => sum + Math.max(0, row.goldDelta), 0);
  const goldOut = economyRows.reduce(
    (sum, row) => sum + Math.abs(Math.min(0, row.goldDelta)),
    0,
  );
  const rewardFailures = economyRows.filter((row) =>
    row.eventType.startsWith("reward.failure."),
  ).length;
  const rateLimited = abuseRows.filter((row) => row.reason === "rate_limited").length;

  const report = {
    since: since.toISOString(),
    abuseEvents: abuseRows.length,
    rateLimited,
    economyEvents: economyRows.length,
    goldIn,
    goldOut,
    rewardFailures,
    adminActions: auditRows.length,
    topEconomyEvents: topCounts(economyRows.map((row) => row.eventType)),
    topAbuseActions: topCounts(abuseRows.map((row) => row.action)),
  };

  await sendOpsAlert("[ops] daily report", report);

  return Response.json({ ok: true, report });
}

function topCounts(values: string[], limit = 8) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}
