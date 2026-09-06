import { isLargeGoldMovement, LARGE_GOLD_MOVEMENT_LABEL } from "./opsEconomyThresholds";
import { readAlertThresholdSettings } from "./opsSettings";
import { scoreSuspiciousUsers } from "./suspiciousUserScore";

export const HOUR_MS = 60 * 60 * 1000;

export const FIVE_MIN_MS = 5 * 60 * 1000;


export function suggestAlertThresholds({
  abuse,
  economy,
  auditCount,
  suspiciousUsers,
  connectedIps,
}: {
  abuse: ReturnType<typeof summarizeAbuse>;
  economy: ReturnType<typeof summarizeEconomy>;
  auditCount: number;
  suspiciousUsers: ReturnType<typeof scoreSuspiciousUsers>;
  connectedIps: ReturnType<typeof scoreConnectedIps>;
}) {
  const topUser = suspiciousUsers[0];
  const topIp = connectedIps[0];
  const topAction = abuse.topActions[0];
  return {
    abuseLast5m: suggested(abuse.last5m, DEFAULT_SUGGESTED.abuseLast5m),
    abuseLast1h: suggested(abuse.last1h, DEFAULT_SUGGESTED.abuseLast1h),
    rewardFailures: suggested(economy.rewardFailures24h, DEFAULT_SUGGESTED.rewardFailures),
    largeGoldEvents: suggested(economy.largeGoldEvents24h, DEFAULT_SUGGESTED.largeGoldEvents),
    adminAudit: suggested(auditCount, DEFAULT_SUGGESTED.adminAudit),
    repeatUserEvents: suggested(topUser?.events ?? 0, DEFAULT_SUGGESTED.repeatUserEvents),
    connectedIpUsers: suggested(topIp?.userCount ?? 0, DEFAULT_SUGGESTED.connectedIpUsers),
    topActionEvents: suggested(topAction?.count ?? 0, DEFAULT_SUGGESTED.topActionEvents),
  };
}


export const DEFAULT_SUGGESTED = {
  abuseLast5m: 20,
  abuseLast1h: 50,
  rewardFailures: 5,
  largeGoldEvents: 3,
  adminAudit: 30,
  repeatUserEvents: 30,
  connectedIpUsers: 3,
  topActionEvents: 80,
};


export function suggested(current: number, fallback: number) {
  if (current <= 0) return fallback;
  return Math.max(fallback, Math.ceil(current * 1.5));
}


export function buildDailyReport({
  abuse,
  economy,
  auditRows,
  rewardFailures,
  rewardFailureStatuses,
}: {
  abuse: ReturnType<typeof summarizeAbuse>;
  economy: ReturnType<typeof summarizeEconomy>;
  auditRows: Array<{ action: string }>;
  rewardFailures: Array<{ id: number }>;
  rewardFailureStatuses: Array<{ eventId: number; status: string }>;
}) {
  const failureIds = new Set(rewardFailures.map((row) => row.id));
  const statusRows = rewardFailureStatuses.filter((row) => failureIds.has(row.eventId));
  return {
    rewardFailures: rewardFailures.length,
    rewardFailuresHandled: statusRows.length,
    rewardCompensated: statusRows.filter((row) => row.status === "compensated").length,
    sanctionsChanged: auditRows.filter((row) => row.action.startsWith("sanction.")).length,
    abuseEvents: abuse.last24h,
    rateLimited: abuse.rateLimited24h,
    largeGoldEvents: economy.largeGoldEvents24h,
    adminChanges: auditRows.length,
    goldNet: economy.goldIn24h - economy.goldOut24h,
  };
}


export function buildPeriodComparison({
  current,
  previous,
}: {
  current: ReturnType<typeof buildDailyReport>;
  previous: ReturnType<typeof buildDailyReport>;
}) {
  return {
    current,
    previous,
    deltas: {
      rewardFailures: current.rewardFailures - previous.rewardFailures,
      rewardFailuresHandled: current.rewardFailuresHandled - previous.rewardFailuresHandled,
      rewardCompensated: current.rewardCompensated - previous.rewardCompensated,
      sanctionsChanged: current.sanctionsChanged - previous.sanctionsChanged,
      abuseEvents: current.abuseEvents - previous.abuseEvents,
      rateLimited: current.rateLimited - previous.rateLimited,
      largeGoldEvents: current.largeGoldEvents - previous.largeGoldEvents,
      adminChanges: current.adminChanges - previous.adminChanges,
      goldNet: current.goldNet - previous.goldNet,
    },
  };
}


export function buildOpsSummary({
  alerts,
  comparison,
  compensationOverview,
  openRewardFailures,
}: {
  alerts: Array<{ level: "danger" | "warning" | "info"; title: string; message: string }>;
  comparison: ReturnType<typeof buildPeriodComparison>;
  compensationOverview: ReturnType<typeof buildCompensationOverview>;
  openRewardFailures: number;
}) {
  const lines: string[] = [];
  const danger = alerts.filter((row) => row.level === "danger");
  if (danger.length > 0) {
    lines.push(`즉시 확인 알림 ${danger.length.toLocaleString()}건: ${danger[0].title}`);
  } else if (alerts.length > 0) {
    lines.push(`주의 알림 ${alerts.length.toLocaleString()}건이 있습니다.`);
  } else {
    lines.push("설정된 임계치를 넘은 운영 알림은 없습니다.");
  }
  if (openRewardFailures > 0) {
    lines.push(`미처리 보상 실패 후보 ${openRewardFailures.toLocaleString()}건이 남아 있습니다.`);
  }
  const rewardDelta = comparison.deltas.rewardFailures;
  if (rewardDelta !== 0) {
    lines.push(
      `보상 실패는 이전 24시간 대비 ${rewardDelta > 0 ? "증가" : "감소"}했습니다(${formatSigned(rewardDelta)}).`,
    );
  }
  const rateDelta = comparison.deltas.rateLimited;
  if (rateDelta !== 0) {
    lines.push(
      `요청 제한 이벤트는 이전 24시간 대비 ${rateDelta > 0 ? "증가" : "감소"}했습니다(${formatSigned(rateDelta)}).`,
    );
  }
  if (compensationOverview.count > 0) {
    lines.push(
      `최근 24시간 보정 지급 ${compensationOverview.count.toLocaleString()}건, 대상 ${compensationOverview.userCount.toLocaleString()}명입니다.`,
    );
  }
  return lines.slice(0, 5);
}


export function formatSigned(value: number) {
  return `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
}


export function buildRiskEvents(
  auditRows: Array<{
    id: number;
    adminEmail: string;
    action: string;
    targetUserId: string | null;
    detail: unknown;
    createdAt: Date;
  }>,
  economyRows: Array<{
    id: number;
    userId: string | null;
    eventType: string;
    goldDelta: number;
    itemKind: string | null;
    itemId: string | null;
    quantity: number | null;
    createdAt: Date;
  }>,
) {
  const auditRisks = auditRows.flatMap((row) => {
    const risk = riskForAudit(row);
    return risk
      ? [
          {
            id: `audit:${row.id}`,
            level: risk.level,
            title: risk.title,
            message: `${row.action} · ${row.adminEmail}`,
            createdAt: row.createdAt.toISOString(),
            href: `/admin?tab=audit&action=${encodeURIComponent(row.action)}`,
          },
        ]
      : [];
  });
  const economyRisks = economyRows.flatMap((row) => {
    if (!isLargeGoldMovement(row.goldDelta) && (row.quantity ?? 0) < 5_000) return [];
    return [
      {
        id: `economy:${row.id}`,
        level: isLargeGoldMovement(row.goldDelta) ? "danger" : "warning",
        title: "대량 재화 이동",
        message: `${row.eventType} · ${row.itemKind ?? "gold"} ${(
          row.quantity ?? Math.abs(row.goldDelta)
        ).toLocaleString()}`,
        createdAt: row.createdAt.toISOString(),
        href: `/admin?tab=economy&eventType=${encodeURIComponent(row.eventType)}`,
      },
    ];
  });
  return [...auditRisks, ...economyRisks]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 12);
}


export function detailObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}


export function buildCompensationOverview(
  rows: Array<{
    userId: string | null;
    eventType: string;
    itemKind: string | null;
    quantity: number | null;
  }>,
) {
  const compensations = rows.filter((row) => row.eventType === "admin.reward.compensate");
  const users = new Set(compensations.flatMap((row) => (row.userId ? [row.userId] : [])));
  const byKind = topCounts(
    compensations.flatMap((row) => (row.itemKind ? [row.itemKind] : [])),
    6,
  );
  return {
    count: compensations.length,
    userCount: users.size,
    totalQuantity: compensations.reduce((sum, row) => sum + Math.max(0, row.quantity ?? 0), 0),
    byKind,
  };
}


export function buildCompensationReport(
  economyRows: Array<{
    id: number;
    userId: string | null;
    eventType: string;
    goldDelta: number;
    itemKind: string | null;
    itemId: string | null;
    quantity: number | null;
    detail: unknown;
    createdAt: Date;
  }>,
  auditRows: Array<{
    id: number;
    adminEmail: string;
    action: string;
    targetUserId: string | null;
    detail: unknown;
    createdAt: Date;
  }>,
) {
  const compensations = economyRows.filter((row) => row.eventType === "admin.reward.compensate");
  const auditCompensations = auditRows.filter((row) => row.action === "reward.compensate");
  return {
    count: compensations.length,
    userCount: new Set(compensations.flatMap((row) => (row.userId ? [row.userId] : []))).size,
    totalGold: compensations.reduce((sum, row) => sum + Math.max(0, row.goldDelta), 0),
    totalQuantity: compensations.reduce((sum, row) => sum + Math.max(0, row.quantity ?? 0), 0),
    byKind: topCounts(compensations.flatMap((row) => (row.itemKind ? [row.itemKind] : [])), 8),
    byAdmin: topCounts(auditCompensations.map((row) => row.adminEmail), 8),
    byUser: topCounts(compensations.flatMap((row) => (row.userId ? [row.userId] : [])), 8),
    recent: compensations.slice(0, 16).map((row) => {
      const detail = detailObject(row.detail);
      return {
        id: row.id,
        userId: row.userId,
        itemKind: row.itemKind,
        itemId: row.itemId,
        quantity: row.quantity,
        goldDelta: row.goldDelta,
        reason: textValue(detail.reason),
        sourceEventId: numberValue(detail.sourceEventId),
        createdAt: row.createdAt.toISOString(),
      };
    }),
  };
}


export function buildOpsChangeHistory(
  rows: Array<{
    id: number;
    adminEmail: string;
    action: string;
    targetUserId: string | null;
    detail: unknown;
    createdAt: Date;
  }>,
) {
  return rows
    .filter(
      (row) =>
        row.action.startsWith("ops-settings.") ||
        row.action.startsWith("reward.") ||
        row.action.startsWith("sanction."),
    )
    .slice(0, 16)
    .map((row) => ({
      id: row.id,
      adminEmail: row.adminEmail,
      action: row.action,
      targetUserId: row.targetUserId,
      summary: summarizeAuditChange(row),
      createdAt: row.createdAt.toISOString(),
    }));
}


export function summarizeAuditChange(row: { action: string; detail: unknown }) {
  const detail = detailObject(row.detail);
  if (row.action === "reward.compensate") {
    return [
      textValue(detail.itemKind),
      numberValue(detail.quantity) > 0 ? numberValue(detail.quantity).toLocaleString() : null,
      textValue(detail.reason),
    ].filter(Boolean).join(" · ");
  }
  if (row.action.startsWith("sanction.")) {
    return [textValue(detail.reason), textValue(detail.adminMemo)].filter(Boolean).join(" · ");
  }
  if (row.action === "ops-settings.reward-compensation-presets.update") {
    return `프리셋 ${numberValue(detail.count).toLocaleString()}개`;
  }
  if (row.action === "ops-settings.hot-time.update") {
    return [detail.enabled ? "활성" : "비활성", textValue(detail.title)].filter(Boolean).join(" · ");
  }
  return "";
}


export function textValue(raw: unknown) {
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 120) : null;
}


export function numberValue(raw: unknown) {
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}


export function riskForAudit(row: { action: string; detail: unknown }) {
  const detail =
    row.detail && typeof row.detail === "object" && !Array.isArray(row.detail)
      ? (row.detail as Record<string, unknown>)
      : {};
  if (row.action === "sanction.ban") {
    return { level: "danger" as const, title: "영구 정지" };
  }
  if (row.action === "reward.compensate") {
    const quantity = Number(detail.quantity ?? 0);
    const itemKind = String(detail.itemKind ?? "");
    if ((itemKind === "gold" && quantity >= 100_000) || quantity >= 1_000) {
      return { level: "warning" as const, title: "대량 보정 지급" };
    }
  }
  if (row.action === "ops-settings.hot-time.update") {
    return { level: "info" as const, title: "핫타임 단발 설정 변경" };
  }
  if (row.action === "ops-settings.hot-time-schedules.update") {
    return { level: "info" as const, title: "핫타임 반복 예약 변경" };
  }
  return null;
}


export function clampHours(value: number): number {
  if (!Number.isFinite(value)) return 24;
  if (value <= 1) return 1;
  if (value <= 6) return 6;
  if (value <= 24) return 24;
  return 168;
}


export function summarizeAbuse(
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


export function summarizeEconomy(
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
  const largeGoldEvents = rows.filter((r) => isLargeGoldMovement(r.goldDelta));
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


export function topCounts(values: string[], limit = 8) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}


export function buildAlerts({
  abuse,
  economy,
  auditCount,
  periodHours,
  thresholds,
  suspiciousUsers,
  connectedIps,
}: {
  abuse: ReturnType<typeof summarizeAbuse>;
  economy: ReturnType<typeof summarizeEconomy>;
  auditCount: number;
  periodHours: number;
  thresholds: Awaited<ReturnType<typeof readAlertThresholdSettings>>["alertThresholds"];
  suspiciousUsers: ReturnType<typeof scoreSuspiciousUsers>;
  connectedIps: ReturnType<typeof scoreConnectedIps>;
}) {
  const alerts: Array<{
    level: "danger" | "warning" | "info";
    title: string;
    message: string;
    detail?:
      | { kind: "suspicious_user"; userId: string }
      | { kind: "connected_ip"; ip: string };
  }> = [];

  if (abuse.last5m >= thresholds.abuseLast5m) {
    alerts.push({
      level: "danger",
      title: "요청 제한 급증",
      message: `최근 5분 제한 이벤트 ${abuse.last5m.toLocaleString()}건`,
    });
  } else if (abuse.last1h >= thresholds.abuseLast1h) {
    alerts.push({
      level: "warning",
      title: "요청 제한 증가",
      message: `최근 1시간 제한 이벤트 ${abuse.last1h.toLocaleString()}건`,
    });
  }

  if (economy.rewardFailures24h >= thresholds.rewardFailures) {
    alerts.push({
      level: "danger",
      title: "보상 수령 실패 누적",
      message: `선택 기간(${periodLabel(periodHours)}) 실패 이벤트 ${economy.rewardFailures24h.toLocaleString()}건`,
    });
  }

  if (economy.largeGoldEvents24h >= thresholds.largeGoldEvents) {
    alerts.push({
      level: "warning",
      title: "대량 골드 이동",
      message: `${LARGE_GOLD_MOVEMENT_LABEL} 골드 이상 이동 ${economy.largeGoldEvents24h.toLocaleString()}건`,
    });
  }

  if (auditCount >= thresholds.adminAudit) {
    alerts.push({
      level: "info",
      title: "관리자 변경 많음",
      message: `선택 기간(${periodLabel(periodHours)}) 관리자 변경 ${auditCount.toLocaleString()}건`,
    });
  }

  const topUser = suspiciousUsers[0];
  if (topUser && topUser.events >= thresholds.repeatUserEvents) {
    alerts.push({
      level: "warning",
      title: "동일 계정 반복 이벤트",
      message: `${topUser.userId.slice(0, 12)} · 이벤트 ${topUser.events.toLocaleString()}건 · 점수 ${topUser.score.toLocaleString()}`,
      detail: { kind: "suspicious_user", userId: topUser.userId },
    });
  }

  const topIp = connectedIps[0];
  if (topIp && topIp.userCount >= thresholds.connectedIpUsers) {
    alerts.push({
      level: "warning",
      title: "동일 IP 다계정 연결",
      message: `${topIp.ip} · 계정 ${topIp.userCount.toLocaleString()}개 · 제한 ${topIp.rateLimited.toLocaleString()}건`,
      detail: { kind: "connected_ip", ip: topIp.ip },
    });
  }

  const topAction = abuse.topActions[0];
  if (topAction && topAction.count >= thresholds.topActionEvents) {
    alerts.push({
      level: "info",
      title: "특정 보호 이벤트 집중",
      message: `${topAction.key} · ${topAction.count.toLocaleString()}건`,
    });
  }

  return alerts;
}


export function periodLabel(hours: number) {
  return hours === 168 ? "7일" : `${hours}시간`;
}


export function scoreConnectedIps(
  rows: Array<{
    action: string;
    reason: string;
    userId: string | null;
    ip: string | null;
    createdAt: Date;
  }>,
) {
  const ips = new Map<
    string,
    {
      events: number;
      rateLimited: number;
      users: Map<
        string,
        {
          events: number;
          rateLimited: number;
          actions: Map<string, number>;
          firstAt: number;
          lastAt: number;
        }
      >;
      actions: Set<string>;
      lastAt: number;
    }
  >();
  for (const row of rows) {
    if (!row.ip) continue;
    const value =
      ips.get(row.ip) ?? {
        events: 0,
        rateLimited: 0,
        users: new Map(),
        actions: new Set<string>(),
        lastAt: 0,
      };
    value.events += 1;
    if (row.reason === "rate_limited") value.rateLimited += 1;
    if (row.userId) {
      const user = value.users.get(row.userId) ?? {
        events: 0,
        rateLimited: 0,
        actions: new Map<string, number>(),
        firstAt: row.createdAt.getTime(),
        lastAt: 0,
      };
      user.events += 1;
      if (row.reason === "rate_limited") user.rateLimited += 1;
      user.actions.set(row.action, (user.actions.get(row.action) ?? 0) + 1);
      user.firstAt = Math.min(user.firstAt, row.createdAt.getTime());
      user.lastAt = Math.max(user.lastAt, row.createdAt.getTime());
      value.users.set(row.userId, user);
    }
    value.actions.add(row.action);
    value.lastAt = Math.max(value.lastAt, row.createdAt.getTime());
    ips.set(row.ip, value);
  }
  return [...ips.entries()]
    .map(([ip, value]) => {
      const connectedUsers = [...value.users.entries()]
        .map(([userId, user]) => ({
          userId,
          events: user.events,
          rateLimited: user.rateLimited,
          actionCount: user.actions.size,
          topActions: [...user.actions.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 3)
            .map(([key, count]) => ({ key, count })),
          firstAt: new Date(user.firstAt).toISOString(),
          lastAt: new Date(user.lastAt).toISOString(),
        }))
        .sort((a, b) => b.events - a.events || a.userId.localeCompare(b.userId))
        .slice(0, 12);
      return {
        ip,
        events: value.events,
        rateLimited: value.rateLimited,
        userCount: value.users.size,
        actionCount: value.actions.size,
        userIds: connectedUsers.map((user) => user.userId),
        users: connectedUsers,
        lastAt: new Date(value.lastAt).toISOString(),
      };
    })
    .filter((row) => row.userCount >= 2 || row.rateLimited >= 5)
    .sort((a, b) => b.userCount - a.userCount || b.rateLimited - a.rateLimited)
    .slice(0, 12);
}


export function buildSanctionRecommendations(
  users: ReturnType<typeof scoreSuspiciousUsers>,
) {
  return users
    .filter((row) => row.score >= 30 || row.rateLimited >= 5 || row.events >= 20)
    .map((row) => {
      const recommendation =
        row.severity === "strong"
          ? "임시 정지 검토"
          : row.severity === "review"
            ? "채팅/거래 제한 검토"
            : "모니터링 유지";
      return {
        userId: row.userId,
        score: row.score,
        recommendation,
        reason: `단계 ${suspicionSeverityLabel(row.severity)} · 제한 ${row.rateLimited.toLocaleString()}건 · 실패 ${row.rewardFailures.toLocaleString()}건 · 평균간격 ${row.avgIntervalSec ? `${row.avgIntervalSec}s` : "-"}`,
        href: `/admin?tab=users&q=${encodeURIComponent(row.userId)}`,
      };
    })
    .slice(0, 8);
}


export function suspicionSeverityLabel(severity: "watch" | "review" | "strong") {
  if (severity === "strong") return "강한 의심";
  if (severity === "review") return "검토 필요";
  return "주의";
}


export function alertChannelStatus() {
  return {
    default: Boolean(process.env.OPS_ALERT_WEBHOOK_URL),
    reward: Boolean(process.env.OPS_ALERT_REWARD_WEBHOOK_URL),
    abuse: Boolean(process.env.OPS_ALERT_ABUSE_WEBHOOK_URL),
    economy: Boolean(process.env.OPS_ALERT_ECONOMY_WEBHOOK_URL),
    deploy: Boolean(process.env.OPS_ALERT_DEPLOY_WEBHOOK_URL),
  };
}
