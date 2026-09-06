"use client";


export type CountRow = { key: string; count: number };


export type DailyReport = {
  rewardFailures: number;
  rewardFailuresHandled: number;
  rewardCompensated: number;
  sanctionsChanged: number;
  abuseEvents: number;
  rateLimited: number;
  largeGoldEvents: number;
  adminChanges: number;
  goldNet: number;
};


export type Dashboard = {
  generatedAt: string;
  periodHours: number;
  webhookConfigured: boolean;
  alertChannels: {
    default: boolean;
    reward: boolean;
    abuse: boolean;
    economy: boolean;
    deploy: boolean;
  };
  alertThresholds: AlertThresholdSettings;
  suggestedAlertThresholds: AlertThresholdSettings;
  alertHistory: AlertHistoryEntry[];
  opsSummary: string[];
  compensationOverview: {
    count: number;
    userCount: number;
    totalQuantity: number;
    byKind: CountRow[];
  };
  dailyReport: DailyReport;
  periodComparison: {
    current: DailyReport;
    previous: DailyReport;
    deltas: DailyReport;
  };
  sanctionReport: {
    expiring24h: Array<{
      id: number;
      userId: string;
      gameName: string | null;
      type: string;
      reason: string;
      expiresAt: string | null;
    }>;
    lifted: Array<{
      id: number;
      userId: string;
      gameName: string | null;
      type: string;
      reason: string;
      liftedAt: string | null;
      liftedByEmail: string | null;
    }>;
  };
  riskEvents: Array<{
    id: string;
    level: "danger" | "warning" | "info";
    title: string;
    message: string;
    createdAt: string;
    href: string;
  }>;
  alerts: Array<{
    level: "danger" | "warning" | "info";
    title: string;
    message: string;
    detail?:
      | { kind: "suspicious_user"; userId: string }
      | { kind: "connected_ip"; ip: string };
  }>;
  abuse: {
    last5m: number;
    last1h: number;
    last24h: number;
    rateLimited24h: number;
    topActions: CountRow[];
    topIps: CountRow[];
    topUsers: CountRow[];
  };
  economy: {
    last1h: number;
    last24h: number;
    goldIn24h: number;
    goldOut24h: number;
    rewardFailures24h: number;
    largeGoldEvents24h: number;
    topEvents: CountRow[];
    topItems: CountRow[];
    topRewardFailures: CountRow[];
  };
  audit: {
    last24h: number;
    latest: Array<{
      id: number;
      adminEmail: string;
      action: string;
      targetUserId: string | null;
      createdAt: string;
    }>;
  };
  slowQueryCandidates: Array<{
    key: string;
    status: string;
    cacheTtlSec: number;
    note: string;
  }>;
  suspiciousUsers: Array<{
    userId: string;
    score: number;
    severity: "watch" | "review" | "strong";
    events: number;
    rateLimited: number;
    rewardFailures: number;
    avgIntervalSec: number;
    actionCount: number;
    ipCount: number;
    ips: string[];
    topActions: CountRow[];
    recentEvents: Array<{
      action: string;
      reason: string;
      ip: string | null;
      createdAt: string;
    }>;
    lastAt: string;
  }>;
  sanctionRecommendations: Array<{
    userId: string;
    score: number;
    recommendation: string;
    reason: string;
    href: string;
  }>;
  connectedIps: Array<{
    ip: string;
    events: number;
    rateLimited: number;
    userCount: number;
    actionCount: number;
    userIds: string[];
    users: Array<{
      userId: string;
      events: number;
      rateLimited: number;
      actionCount: number;
      topActions: CountRow[];
      firstAt: string;
      lastAt: string;
    }>;
    lastAt: string;
  }>;
  rewardFailureCandidates: Array<{
    id: number;
    userId: string | null;
    eventType: string;
    itemId: string | null;
    detail: Record<string, unknown> | null;
    createdAt: string;
    classification: {
      key: string;
      label: string;
      tone: "danger" | "warning" | "info";
      priority: number;
      action: string;
    };
  }>;
  rewardFailureStatusRecent: RewardFailureStatusEntry[];
  opsChangeHistory: Array<{
    id: number;
    adminEmail: string;
    action: string;
    targetUserId: string | null;
    summary: string;
    createdAt: string;
  }>;
};


export type HotTimeSettings = {
  enabled: boolean;
  title: string;
  startsAt: string;
  endsAt: string;
  bonuses: {
    goldPct: number;
    expPct: number;
    masteryPct: number;
    fishingCoinPct: number;
  };
  note: string;
};


export type LifeFieldFeatureSettings = {
  environmentEnabled: boolean;
  discoveriesEnabled: boolean;
  discoveryRewardsEnabled: boolean;
  feedEnabled: boolean;
  milestonesEnabled: boolean;
};


export type HotTimeSchedule = {
  id: string;
  enabled: boolean;
  title: string;
  days: number[];
  startsAt: string;
  endsAt: string;
  bonuses: HotTimeSettings["bonuses"];
  note: string;
};


export type AlertThresholdSettings = {
  abuseLast5m: number;
  abuseLast1h: number;
  rewardFailures: number;
  largeGoldEvents: number;
  adminAudit: number;
  repeatUserEvents: number;
  connectedIpUsers: number;
  topActionEvents: number;
};


export type AlertHistoryEntry = {
  id: string;
  message: string;
  detail: Record<string, unknown> | null;
  status: "sent" | "failed" | "skipped";
  error: string | null;
  createdAt: string;
};


export type RewardFailureStatus = "reviewed" | "compensated" | "ignored";


export type RewardFailureStatusEntry = {
  eventId: number;
  status: RewardFailureStatus;
  note: string;
  adminEmail: string;
  updatedAt: string;
};


export type RewardCompensationPreset = {
  id: string;
  label: string;
  itemKind:
    | "gold"
    | "fishing_coin"
    | "mastery_certificate"
    | "stamina_potion"
    | "material";
  itemId: string;
  quantity: number;
  reason: string;
};
