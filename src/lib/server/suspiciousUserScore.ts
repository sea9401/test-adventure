export const FISHING_SUSPICION_INCIDENT_WINDOW_MS = 5_000;

export type SuspicionScoreEvent = {
  action: string;
  reason: string;
  userId: string | null;
  ip: string | null;
  detail?: unknown;
  createdAt: Date;
};

type InternalEvent = {
  action: string;
  reason: string;
  ip: string | null;
  detail?: unknown;
  createdAt: number;
};

type ScoringEvent = InternalEvent & {
  reasonWeight: number;
  incidentLastAt: number;
};

const FISHING_DERIVED_REASONS = new Set([
  "fishing_macro_pattern",
  "strong_activity_signal",
  "human_verification_required",
]);

function abuseReasonWeight(reason: string): number {
  if (reason === "multi_account_ip_fanout") return 30;
  if (reason === "persistent_same_ip_accounts") return 20;
  if (reason === "fishing_macro_pattern") return 24;
  if (reason === "strong_activity_signal") return 18;
  if (reason === "extreme_daily_activity") return 15;
  if (reason === "human_verification_failed") return 12;
  if (reason === "activity_behavior_pattern") return 8;
  return 0;
}

function isDerivedFishingEvent(event: InternalEvent): boolean {
  return (
    event.action.startsWith("v2:fishing:") &&
    FISHING_DERIVED_REASONS.has(event.reason)
  );
}

function isObservationOnlyFishingMacroEvent(event: InternalEvent): boolean {
  if (event.reason !== "fishing_macro_pattern") return false;
  if (!event.detail || typeof event.detail !== "object") return false;
  const signals = (event.detail as { signals?: unknown }).signals;
  if (!Array.isArray(signals)) return false;
  return !signals.some(
    (signal) =>
      signal === "impossibly_fast_post_bite_reel" ||
      signal === "repeated_prefire",
  );
}

function isManualVerificationTest(event: { detail?: unknown }): boolean {
  return Boolean(
    event.detail &&
      typeof event.detail === "object" &&
      (event.detail as { manualTest?: unknown }).manualTest === true,
  );
}

// 한 번의 빠른 챔질 판정에서 reel·activity-guard·human-check 이벤트가 연달아
// 기록된다. 운영 점수에서는 이를 세 건이 아니라 한 사건으로 보고 가장 강한 사유만 반영한다.
function collapseSuspicionScoreEvents(
  events: InternalEvent[],
): ScoringEvent[] {
  const sorted = [...events].sort((a, b) => a.createdAt - b.createdAt);
  const collapsed: ScoringEvent[] = [];
  let fishingIncident: ScoringEvent | null = null;

  for (const event of sorted) {
    // 과거 감쇠 중 재플래그 버그로 기록됐지만 강신호가 없었던 이벤트는 상세에는
    // 남겨 두고 운영 점수에서는 제외한다.
    if (isObservationOnlyFishingMacroEvent(event)) continue;
    if (
      isDerivedFishingEvent(event) &&
      fishingIncident &&
      event.createdAt - fishingIncident.incidentLastAt <=
        FISHING_SUSPICION_INCIDENT_WINDOW_MS
    ) {
      fishingIncident.reasonWeight = Math.max(
        fishingIncident.reasonWeight,
        abuseReasonWeight(event.reason),
      );
      fishingIncident.incidentLastAt = event.createdAt;
      continue;
    }

    const scoringEvent: ScoringEvent = {
      ...event,
      action: isDerivedFishingEvent(event)
        ? "v2:fishing:suspicion-incident"
        : event.action,
      reasonWeight: abuseReasonWeight(event.reason),
      incidentLastAt: event.createdAt,
    };
    collapsed.push(scoringEvent);
    if (isDerivedFishingEvent(event)) fishingIncident = scoringEvent;
  }

  return collapsed;
}

function averageIntervalSec(timestamps: number[]) {
  if (timestamps.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < timestamps.length; i += 1) {
    total += Math.max(0, timestamps[i] - timestamps[i - 1]);
  }
  return Math.round(total / (timestamps.length - 1) / 1000);
}

function topCounts(values: string[], limit = 5) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

export function scoreSuspiciousUsers(
  rows: SuspicionScoreEvent[],
  economyRows: Array<{
    userId?: string | null;
    eventType: string;
  }> = [],
) {
  const rewardFailuresByUser = new Map<string, number>();
  for (const row of economyRows) {
    if (!row.userId || !row.eventType.startsWith("reward.failure.")) continue;
    rewardFailuresByUser.set(
      row.userId,
      (rewardFailuresByUser.get(row.userId) ?? 0) + 1,
    );
  }

  const users = new Map<
    string,
    {
      ips: Set<string>;
      rawEvents: InternalEvent[];
      lastAt: number;
    }
  >();
  for (const row of rows) {
    if (!row.userId) continue;
    if (isManualVerificationTest(row)) continue;
    const value = users.get(row.userId) ?? {
      ips: new Set<string>(),
      rawEvents: [],
      lastAt: 0,
    };
    if (row.ip) value.ips.add(row.ip);
    value.rawEvents.push({
      action: row.action,
      reason: row.reason,
      ip: row.ip,
      detail: row.detail,
      createdAt: row.createdAt.getTime(),
    });
    value.lastAt = Math.max(value.lastAt, row.createdAt.getTime());
    users.set(row.userId, value);
  }

  return [...users.entries()]
    .map(([userId, value]) => {
      const scoringEvents = collapseSuspicionScoreEvents(value.rawEvents);
      const events = scoringEvents.length;
      const rateLimited = scoringEvents.filter(
        (event) => event.reason === "rate_limited",
      ).length;
      const reasonScore = scoringEvents.reduce(
        (sum, event) => sum + event.reasonWeight,
        0,
      );
      const actions = new Set(scoringEvents.map((event) => event.action));
      const avgIntervalSec = averageIntervalSec(
        scoringEvents.map((event) => event.createdAt),
      );
      const fastRepeatBonus =
        events >= 8 && avgIntervalSec > 0 && avgIntervalSec <= 10
          ? 30
          : events >= 8 && avgIntervalSec > 0 && avgIntervalSec <= 30
            ? 15
            : 0;
      const rewardFailures = rewardFailuresByUser.get(userId) ?? 0;
      const score =
        rateLimited * 5 +
        reasonScore +
        events * 2 +
        Math.max(0, actions.size - 1) * 3 +
        Math.max(0, value.ips.size - 1) * 4 +
        rewardFailures * 4 +
        fastRepeatBonus;
      const severity =
        score >= 120 || rateLimited >= 20 || fastRepeatBonus >= 30
          ? ("strong" as const)
          : score >= 60 || rateLimited >= 10 || rewardFailures >= 5
            ? ("review" as const)
            : ("watch" as const);
      return {
        userId,
        score,
        severity,
        events,
        rateLimited,
        rewardFailures,
        avgIntervalSec,
        actionCount: actions.size,
        ipCount: value.ips.size,
        ips: [...value.ips].sort().slice(0, 5),
        // 상세 조사에는 원본 이벤트를 유지하되 점수·건수만 사건 단위로 계산한다.
        topActions: topCounts(value.rawEvents.map((event) => event.action), 5),
        recentEvents: [...value.rawEvents]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 5)
          .map((event) => ({
            action: event.action,
            reason: event.reason,
            ip: event.ip,
            createdAt: new Date(event.createdAt).toISOString(),
          })),
        lastAt: new Date(value.lastAt).toISOString(),
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.rateLimited - a.rateLimited)
    .slice(0, 12);
}
