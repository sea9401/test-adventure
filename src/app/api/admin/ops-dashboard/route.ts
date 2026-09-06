import { db } from "@/db";
import { abuseEvents, adminAuditLog, economyEvents, users, userSanctions } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";
import {
  alertChannelStatus,
  buildAlerts,
  buildCompensationOverview,
  buildCompensationReport,
  buildDailyReport,
  buildOpsChangeHistory,
  buildOpsSummary,
  buildPeriodComparison,
  buildRiskEvents,
  buildSanctionRecommendations,
  clampHours,
  HOUR_MS,
  scoreConnectedIps,
  suggestAlertThresholds,
  summarizeAbuse,
  summarizeEconomy,
} from "@/lib/server/opsDashboardModel";
import {
  readAlertThresholdSettings,
  readOpsAlertHistory,
  readRewardFailureStatuses,
} from "@/lib/server/opsSettings";
import { classifyRewardFailure } from "@/lib/server/rewardFailureClassification";
import {
  rowsAfterSuspicionScoreReset,
  SUSPICION_SCORE_RESET_ACTION,
  suspicionScoreResetCutoffs,
} from "@/lib/server/suspicionScoreReset";
import { scoreSuspiciousUsers } from "@/lib/server/suspiciousUserScore";
import { and, desc, eq, gte, isNull, lt, lte } from "drizzle-orm";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const sp = new URL(req.url).searchParams;
  const hours = clampHours(Number(sp.get("hours")) || 24);
  const now = Date.now();
  const since = new Date(now - hours * HOUR_MS);
  const daySince = new Date(now - 24 * HOUR_MS);
  const prevDaySince = new Date(now - 48 * HOUR_MS);

  const [
    abuseRows,
    economyRows,
    auditRows,
    suspicionScoreResetRows,
    currentDayAbuseRows,
    currentDayEconomyRows,
    currentDayAuditRows,
    previousAbuseRows,
    previousEconomyRows,
    previousAuditRows,
    { alertThresholds },
    alertHistory,
    rewardFailureStatuses,
    expiringSanctions,
    recentLiftedSanctions,
  ] = await Promise.all([
    db
      .select({
        id: abuseEvents.id,
        userId: abuseEvents.userId,
        ip: abuseEvents.ip,
        action: abuseEvents.action,
        reason: abuseEvents.reason,
        detail: abuseEvents.detail,
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
        detail: economyEvents.detail,
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
        detail: adminAuditLog.detail,
        createdAt: adminAuditLog.createdAt,
      })
      .from(adminAuditLog)
      .where(gte(adminAuditLog.createdAt, since))
      .orderBy(desc(adminAuditLog.id))
      .limit(300),
    db
      .select({
        targetUserId: adminAuditLog.targetUserId,
        createdAt: adminAuditLog.createdAt,
      })
      .from(adminAuditLog)
      .where(
        and(
          eq(adminAuditLog.action, SUSPICION_SCORE_RESET_ACTION),
          gte(adminAuditLog.createdAt, since),
        ),
      )
      .orderBy(desc(adminAuditLog.id))
      .limit(1_000),
    db
      .select({
        action: abuseEvents.action,
        reason: abuseEvents.reason,
        userId: abuseEvents.userId,
        ip: abuseEvents.ip,
        createdAt: abuseEvents.createdAt,
      })
      .from(abuseEvents)
      .where(gte(abuseEvents.createdAt, daySince))
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
        detail: economyEvents.detail,
        createdAt: economyEvents.createdAt,
      })
      .from(economyEvents)
      .where(gte(economyEvents.createdAt, daySince))
      .orderBy(desc(economyEvents.id))
      .limit(1_000),
    db
      .select({
        action: adminAuditLog.action,
      })
      .from(adminAuditLog)
      .where(gte(adminAuditLog.createdAt, daySince))
      .orderBy(desc(adminAuditLog.id))
      .limit(1_000),
    db
      .select({
        action: abuseEvents.action,
        reason: abuseEvents.reason,
        userId: abuseEvents.userId,
        ip: abuseEvents.ip,
        createdAt: abuseEvents.createdAt,
      })
      .from(abuseEvents)
      .where(and(gte(abuseEvents.createdAt, prevDaySince), lt(abuseEvents.createdAt, daySince)))
      .orderBy(desc(abuseEvents.id))
      .limit(1_000),
    db
      .select({
        id: economyEvents.id,
        eventType: economyEvents.eventType,
        goldDelta: economyEvents.goldDelta,
        itemKind: economyEvents.itemKind,
        itemId: economyEvents.itemId,
        quantity: economyEvents.quantity,
        createdAt: economyEvents.createdAt,
      })
      .from(economyEvents)
      .where(and(gte(economyEvents.createdAt, prevDaySince), lt(economyEvents.createdAt, daySince)))
      .orderBy(desc(economyEvents.id))
      .limit(1_000),
    db
      .select({
        action: adminAuditLog.action,
      })
      .from(adminAuditLog)
      .where(and(gte(adminAuditLog.createdAt, prevDaySince), lt(adminAuditLog.createdAt, daySince)))
      .orderBy(desc(adminAuditLog.id))
      .limit(1_000),
    readAlertThresholdSettings(),
    readOpsAlertHistory(),
    readRewardFailureStatuses(),
    db
      .select({
        id: userSanctions.id,
        userId: userSanctions.userId,
        gameName: users.gameName,
        type: userSanctions.type,
        reason: userSanctions.reason,
        expiresAt: userSanctions.expiresAt,
      })
      .from(userSanctions)
      .leftJoin(users, eq(users.id, userSanctions.userId))
      .where(
        and(
          isNull(userSanctions.liftedAt),
          gte(userSanctions.expiresAt, new Date(now)),
          lte(userSanctions.expiresAt, new Date(now + 24 * HOUR_MS)),
        ),
      )
      .orderBy(userSanctions.expiresAt)
      .limit(12),
    db
      .select({
        id: userSanctions.id,
        userId: userSanctions.userId,
        gameName: users.gameName,
        type: userSanctions.type,
        reason: userSanctions.reason,
        liftedAt: userSanctions.liftedAt,
        liftedByEmail: userSanctions.liftedByEmail,
      })
      .from(userSanctions)
      .leftJoin(users, eq(users.id, userSanctions.userId))
      .where(gte(userSanctions.liftedAt, since))
      .orderBy(desc(userSanctions.liftedAt))
      .limit(12),
  ]);

  const abuse = summarizeAbuse(abuseRows, now);
  const economy = summarizeEconomy(economyRows, now);
  const suspicionResetCutoffs = suspicionScoreResetCutoffs(
    suspicionScoreResetRows,
  );
  const suspiciousUsers = scoreSuspiciousUsers(
    rowsAfterSuspicionScoreReset(abuseRows, suspicionResetCutoffs),
    rowsAfterSuspicionScoreReset(
      currentDayEconomyRows,
      suspicionResetCutoffs,
    ),
  );
  const connectedIps = scoreConnectedIps(abuseRows);
  const previousAbuse = summarizeAbuse(previousAbuseRows, daySince.getTime());
  const previousEconomy = summarizeEconomy(previousEconomyRows, daySince.getTime());
  const currentDayAbuse = summarizeAbuse(currentDayAbuseRows, now);
  const currentDayEconomy = summarizeEconomy(currentDayEconomyRows, now);
  const rewardFailureStatusById = new Map(
    rewardFailureStatuses.map((entry) => [entry.eventId, entry]),
  );
  const rewardFailures = economyRows.filter((row) =>
    row.eventType.startsWith("reward.failure."),
  );
  const current24hRewardFailures = currentDayEconomyRows.filter((row) =>
    row.eventType.startsWith("reward.failure."),
  );
  const openRewardFailureCandidates = economyRows
    .filter((row) => row.eventType.startsWith("reward.failure."))
    .filter((row) => !rewardFailureStatusById.has(row.id))
    .slice(0, 12)
    .map((row) => ({
      id: row.id,
      userId: row.userId,
      eventType: row.eventType,
      itemId: row.itemId,
      detail: row.detail,
      createdAt: row.createdAt,
      classification: classifyRewardFailure(row, currentDayEconomyRows),
    }));
  const periodComparison = buildPeriodComparison({
    current: buildDailyReport({
      abuse: currentDayAbuse,
      economy: currentDayEconomy,
      auditRows: currentDayAuditRows,
      rewardFailures: current24hRewardFailures,
      rewardFailureStatuses,
    }),
    previous: buildDailyReport({
      abuse: previousAbuse,
      economy: previousEconomy,
      auditRows: previousAuditRows,
      rewardFailures: previousEconomyRows.filter((row) =>
        row.eventType.startsWith("reward.failure."),
      ),
      rewardFailureStatuses,
    }),
  });
  const alerts = buildAlerts({
    abuse,
    economy,
    auditCount: auditRows.length,
    periodHours: hours,
    thresholds: alertThresholds,
    suspiciousUsers,
    connectedIps,
  });
  const compensationOverview = buildCompensationOverview(currentDayEconomyRows);
  const compensationReport = buildCompensationReport(currentDayEconomyRows, auditRows);
  const opsChangeHistory = buildOpsChangeHistory(auditRows);

  return Response.json({
    ok: true,
    generatedAt: new Date(now).toISOString(),
    periodHours: hours,
    webhookConfigured: Boolean(process.env.OPS_ALERT_WEBHOOK_URL),
    alertChannels: alertChannelStatus(),
    abuse,
    economy,
    alertThresholds,
    suggestedAlertThresholds: suggestAlertThresholds({
      abuse,
      economy,
      auditCount: auditRows.length,
      suspiciousUsers,
      connectedIps,
    }),
    alertHistory: alertHistory.slice(0, 12),
    dailyReport: buildDailyReport({
      abuse,
      economy,
      auditRows,
      rewardFailures,
      rewardFailureStatuses,
    }),
    periodComparison,
    opsSummary: buildOpsSummary({
      alerts,
      comparison: periodComparison,
      compensationOverview,
      openRewardFailures: openRewardFailureCandidates.length,
    }),
    compensationOverview,
    compensationReport,
    sanctionReport: {
      expiring24h: expiringSanctions.map((row) => ({
        ...row,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      })),
      lifted: recentLiftedSanctions.map((row) => ({
        ...row,
        liftedAt: row.liftedAt?.toISOString() ?? null,
      })),
    },
    riskEvents: buildRiskEvents(auditRows, economyRows),
    audit: {
      last24h: auditRows.length,
      latest: auditRows.slice(0, 10),
    },
    alerts,
    rewardFailureCandidates: openRewardFailureCandidates,
    rewardFailureStatusRecent: rewardFailureStatuses.slice(0, 12),
    suspiciousUsers,
    sanctionRecommendations: buildSanctionRecommendations(suspiciousUsers),
    connectedIps,
    opsChangeHistory,
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
