import { desc, gte } from "drizzle-orm";
import { db } from "@/db";
import { abuseEvents, adminAuditLog, economyEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";

const HOUR_MS = 60 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const sp = new URL(req.url).searchParams;
  const hours = clampHours(Number(sp.get("hours")) || 24);
  const now = Date.now();
  const since = new Date(now - hours * HOUR_MS);

  const [abuseRows, economyRows, auditRows] = await Promise.all([
    db
      .select({
        id: abuseEvents.id,
        userId: abuseEvents.userId,
        ip: abuseEvents.ip,
        action: abuseEvents.action,
        reason: abuseEvents.reason,
        createdAt: abuseEvents.createdAt,
      })
      .from(abuseEvents)
      .where(gte(abuseEvents.createdAt, since))
      .orderBy(desc(abuseEvents.id))
      .limit(1_000),
    db
      .select({
        id: economyEvents.id,
        userId: economyEvents.userId,
        eventType: economyEvents.eventType,
        goldDelta: economyEvents.goldDelta,
        itemKind: economyEvents.itemKind,
        itemId: economyEvents.itemId,
        quantity: economyEvents.quantity,
        createdAt: economyEvents.createdAt,
      })
      .from(economyEvents)
      .where(gte(economyEvents.createdAt, since))
      .orderBy(desc(economyEvents.id))
      .limit(1_000),
    db
      .select({
        id: adminAuditLog.id,
        adminEmail: adminAuditLog.adminEmail,
        action: adminAuditLog.action,
        targetUserId: adminAuditLog.targetUserId,
        createdAt: adminAuditLog.createdAt,
      })
      .from(adminAuditLog)
      .where(gte(adminAuditLog.createdAt, since))
      .orderBy(desc(adminAuditLog.id))
      .limit(300),
  ]);

  const abuse = summarizeAbuse(abuseRows, now);
  const economy = summarizeEconomy(economyRows, now);

  return Response.json({
    ok: true,
    generatedAt: new Date(now).toISOString(),
    periodHours: hours,
    webhookConfigured: Boolean(process.env.OPS_ALERT_WEBHOOK_URL),
    abuse,
    economy,
    audit: {
      last24h: auditRows.length,
      latest: auditRows.slice(0, 10),
    },
    alerts: buildAlerts({
      abuse,
      economy,
      auditCount: auditRows.length,
      periodHours: hours,
    }),
    suspiciousUsers: scoreSuspiciousUsers(abuseRows),
    slowQueryCandidates: [
      {
        key: "marketplace.prices",
        status: "cached",
        cacheTtlSec: 30,
        note: "최근 판매 완료 매물 집계",
      },
      {
        key: "marketplace.history",
        status: "cached",
        cacheTtlSec: 15,
        note: "최근 체결 거래 정렬 조회",
      },
      {
        key: "me.state.outpost",
        status: "cached",
        cacheTtlSec: 3,
        note: "거점/정착지 조회",
      },
    ],
  });
}

function clampHours(value: number): number {
  if (!Number.isFinite(value)) return 24;
  if (value <= 1) return 1;
  if (value <= 6) return 6;
  if (value <= 24) return 24;
  return 168;
}

function summarizeAbuse(
  rows: Array<{
    action: string;
    reason: string;
    userId: string | null;
    ip: string | null;
    createdAt: Date;
  }>,
  now: number,
) {
  const last5m = rows.filter((r) => now - r.createdAt.getTime() <= FIVE_MIN_MS);
  const last1h = rows.filter((r) => now - r.createdAt.getTime() <= HOUR_MS);
  const actions = topCounts(rows.map((r) => r.action));
  const ips = topCounts(rows.flatMap((r) => (r.ip ? [r.ip] : [])));
  const users = topCounts(rows.flatMap((r) => (r.userId ? [r.userId] : [])));
  return {
    last5m: last5m.length,
    last1h: last1h.length,
    last24h: rows.length,
    rateLimited24h: rows.filter((r) => r.reason === "rate_limited").length,
    topActions: actions,
    topIps: ips,
    topUsers: users,
  };
}

function summarizeEconomy(
  rows: Array<{
    eventType: string;
    goldDelta: number;
    itemKind: string | null;
    itemId: string | null;
    quantity: number | null;
    createdAt: Date;
  }>,
  now: number,
) {
  const last1h = rows.filter((r) => now - r.createdAt.getTime() <= HOUR_MS);
  const goldIn = rows.reduce((sum, r) => sum + Math.max(0, r.goldDelta), 0);
  const goldOut = rows.reduce((sum, r) => sum + Math.abs(Math.min(0, r.goldDelta)), 0);
  const rewardFailures = rows.filter((r) =>
    r.eventType.startsWith("reward.failure."),
  );
  const largeGoldEvents = rows.filter((r) => Math.abs(r.goldDelta) >= 500_000);
  return {
    last1h: last1h.length,
    last24h: rows.length,
    goldIn24h: goldIn,
    goldOut24h: goldOut,
    rewardFailures24h: rewardFailures.length,
    largeGoldEvents24h: largeGoldEvents.length,
    topEvents: topCounts(rows.map((r) => r.eventType)),
    topItems: topCounts(
      rows.flatMap((r) => (r.itemKind && r.itemId ? [`${r.itemKind}:${r.itemId}`] : [])),
    ),
    topRewardFailures: topCounts(rewardFailures.map((r) => r.itemId ?? r.eventType)),
  };
}

function topCounts(values: string[], limit = 8) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function buildAlerts({
  abuse,
  economy,
  auditCount,
  periodHours,
}: {
  abuse: ReturnType<typeof summarizeAbuse>;
  economy: ReturnType<typeof summarizeEconomy>;
  auditCount: number;
  periodHours: number;
}) {
  const alerts: Array<{
    level: "danger" | "warning" | "info";
    title: string;
    message: string;
  }> = [];

  if (abuse.last5m >= 20) {
    alerts.push({
      level: "danger",
      title: "요청 제한 급증",
      message: `최근 5분 제한 이벤트 ${abuse.last5m.toLocaleString()}건`,
    });
  } else if (abuse.last1h >= 50) {
    alerts.push({
      level: "warning",
      title: "요청 제한 증가",
      message: `최근 1시간 제한 이벤트 ${abuse.last1h.toLocaleString()}건`,
    });
  }

  if (economy.rewardFailures24h >= 5) {
    alerts.push({
      level: "danger",
      title: "보상 수령 실패 누적",
      message: `선택 기간(${periodLabel(periodHours)}) 실패 이벤트 ${economy.rewardFailures24h.toLocaleString()}건`,
    });
  }

  if (economy.largeGoldEvents24h >= 3) {
    alerts.push({
      level: "warning",
      title: "대량 골드 이동",
      message: `50만 골드 이상 이동 ${economy.largeGoldEvents24h.toLocaleString()}건`,
    });
  }

  if (auditCount >= 30) {
    alerts.push({
      level: "info",
      title: "관리자 변경 많음",
      message: `선택 기간(${periodLabel(periodHours)}) 관리자 변경 ${auditCount.toLocaleString()}건`,
    });
  }

  return alerts;
}

function periodLabel(hours: number) {
  return hours === 168 ? "7일" : `${hours}시간`;
}

function scoreSuspiciousUsers(
  rows: Array<{
    action: string;
    reason: string;
    userId: string | null;
    ip: string | null;
    createdAt: Date;
  }>,
) {
  const users = new Map<
    string,
    {
      events: number;
      rateLimited: number;
      actions: Set<string>;
      ips: Set<string>;
      lastAt: number;
    }
  >();
  for (const row of rows) {
    if (!row.userId) continue;
    const value =
      users.get(row.userId) ?? {
        events: 0,
        rateLimited: 0,
        actions: new Set<string>(),
        ips: new Set<string>(),
        lastAt: 0,
      };
    value.events += 1;
    if (row.reason === "rate_limited") value.rateLimited += 1;
    value.actions.add(row.action);
    if (row.ip) value.ips.add(row.ip);
    value.lastAt = Math.max(value.lastAt, row.createdAt.getTime());
    users.set(row.userId, value);
  }
  return [...users.entries()]
    .map(([userId, value]) => {
      const score =
        value.rateLimited * 5 +
        value.events * 2 +
        Math.max(0, value.actions.size - 1) * 3 +
        Math.max(0, value.ips.size - 1) * 4;
      return {
        userId,
        score,
        events: value.events,
        rateLimited: value.rateLimited,
        actionCount: value.actions.size,
        ipCount: value.ips.size,
        lastAt: new Date(value.lastAt).toISOString(),
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.rateLimited - a.rateLimited)
    .slice(0, 12);
}
