import { eq } from "drizzle-orm";
import { db } from "@/db";
import { opsSettings } from "@/db/schema";
import {
  OPS_ALERT_HISTORY_KEY,
  parseOpsAlertHistory,
  type OpsAlertHistoryEntry,
} from "@/lib/server/opsSettings";

type OpsSignalOptions = {
  key: string;
  alertType: string;
  label: string;
  threshold: number;
  windowMs: number;
  detail?: Record<string, unknown>;
};

type SignalBucket = {
  count: number;
  resetAt: number;
  alertedAt: number;
};

const signalBuckets = new Map<string, SignalBucket>();

const SAFE_WEBHOOK_STRING_KEYS = new Set([
  "alertType",
  "eventType",
  "action",
  "group",
  "scope",
  "activity",
  "riskLevel",
  "channel",
]);
const SAFE_WEBHOOK_NUMBER_KEYS = new Set([
  "count",
  "threshold",
  "windowMs",
  "accountCount",
  "dailyCompleted",
  "globalDailyCompleted",
  "riskScore",
  "strongSignals",
  "behaviorSignals",
  "goldDelta",
  "failed",
  "attempted",
  "abuseEvents",
  "rateLimited",
  "economyEvents",
  "goldIn",
  "goldOut",
  "rewardFailures",
  "adminActions",
]);
const SAFE_WEBHOOK_COUNT_LIST_KEYS = new Set([
  "topEconomyEvents",
  "topAbuseActions",
]);
const SAFE_CODE = /^[a-zA-Z0-9._:/-]{1,160}$/;

function safeCode(value: unknown): string | null {
  return typeof value === "string" && SAFE_CODE.test(value) ? value : null;
}

// 외부 웹훅은 허용 목록으로 새 객체를 만든다. userId/IP/name/accounts/queueIds 등은
// 키 이름을 바꾸거나 새 호출부가 추가돼도 기본적으로 빠진다. 원본 detail 은 내부
// ops history 에만 남겨 관리자 화면에서 조사할 수 있다.
export function sanitizeOpsWebhookDetail(detail: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (SAFE_WEBHOOK_STRING_KEYS.has(key)) {
      const code = safeCode(value);
      if (code !== null) sanitized[key] = code;
      continue;
    }
    if (SAFE_WEBHOOK_NUMBER_KEYS.has(key)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        sanitized[key] = value;
      }
      continue;
    }
    if (SAFE_WEBHOOK_COUNT_LIST_KEYS.has(key) && Array.isArray(value)) {
      sanitized[key] = value.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const record = entry as Record<string, unknown>;
        const itemKey = safeCode(record.key);
        const itemCount = record.count;
        return itemKey !== null &&
          typeof itemCount === "number" &&
          Number.isFinite(itemCount)
          ? [{ key: itemKey, count: itemCount }]
          : [];
      });
    }
  }
  return sanitized;
}

function webhookMessage(channel: string, detail: Record<string, unknown>) {
  const alertType = safeCode(detail.alertType);
  return alertType
    ? `[ops] ${channel}: ${alertType}`
    : `[ops] ${channel} alert`;
}

function isDiscordWebhook(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname === "discord.com" ||
      hostname.endsWith(".discord.com") ||
      hostname === "discordapp.com" ||
      hostname.endsWith(".discordapp.com")
    );
  } catch {
    return false;
  }
}

function webhookPayload(
  url: string,
  channel: string,
  detail: Record<string, unknown>,
  at: string,
) {
  const text = webhookMessage(channel, detail);
  if (!isDiscordWebhook(url)) {
    return { text, detail, at };
  }

  const serializedDetail = JSON.stringify(detail, null, 2);
  const maxDetailLength = 4_000;
  const displayedDetail =
    serializedDetail.length > maxDetailLength
      ? `${serializedDetail.slice(0, maxDetailLength - 1)}…`
      : serializedDetail;

  return {
    content: text,
    embeds: [
      {
        description: `\`\`\`json\n${displayedDetail}\n\`\`\``,
        timestamp: at,
        color: 0xf59e0b,
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

export async function sendOpsAlert(
  message: string,
  detail?: Record<string, unknown>,
) {
  const channel = selectOpsAlertChannel(detail);
  const url = channel.url;
  const recordedDetail = { ...(detail ?? {}), channel: channel.key };
  const webhookDetail = sanitizeOpsWebhookDetail(recordedDetail);
  if (!url) {
    await recordOpsAlertHistory({
      message,
      detail: recordedDetail,
      status: "skipped",
      error: `${channel.envName} not configured`,
    });
    return;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        webhookPayload(
          url,
          channel.key,
          webhookDetail,
          new Date().toISOString(),
        ),
      ),
    });
    if (!response.ok) {
      throw new Error(`webhook responded with HTTP ${response.status}`);
    }
    await recordOpsAlertHistory({
      message,
      detail: recordedDetail,
      status: "sent",
      error: null,
    });
  } catch (e) {
    console.error("[ops-alert] webhook failed", e);
    await recordOpsAlertHistory({
      message,
      detail: recordedDetail,
      status: "failed",
      error: e instanceof Error ? e.message : "unknown error",
    });
  }
}

export function recordOpsSignal({
  key,
  alertType,
  label,
  threshold,
  windowMs,
  detail,
}: OpsSignalOptions) {
  const now = Date.now();
  const current = signalBuckets.get(key);
  const bucket =
    current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + windowMs, alertedAt: 0 };

  bucket.count += 1;
  signalBuckets.set(key, bucket);

  if (bucket.count < threshold || bucket.alertedAt > 0) return;
  bucket.alertedAt = now;
  void sendOpsAlert(`[ops] ${label}`, {
    ...detail,
    alertType,
    signalKey: key,
    count: bucket.count,
    threshold,
    windowMs,
  });
}

export function resetOpsAlertsForTests() {
  signalBuckets.clear();
}

async function recordOpsAlertHistory(entry: Omit<OpsAlertHistoryEntry, "id" | "createdAt">) {
  if (!process.env.DATABASE_URL) return;
  try {
    const now = new Date();
    const current = (
      await db
        .select({ value: opsSettings.value })
        .from(opsSettings)
        .where(eq(opsSettings.key, OPS_ALERT_HISTORY_KEY))
        .limit(1)
    )[0];
    const entries = parseOpsAlertHistory(current?.value);
    const next: OpsAlertHistoryEntry[] = [
      {
        id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        message: entry.message.slice(0, 300),
        detail: entry.detail,
        status: entry.status,
        error: entry.error ? entry.error.slice(0, 300) : null,
        createdAt: now.toISOString(),
      },
      ...entries,
    ].slice(0, 100);
    await db
      .insert(opsSettings)
      .values({
        key: OPS_ALERT_HISTORY_KEY,
        value: next,
        updatedByEmail: "system",
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: opsSettings.key,
        set: { value: next, updatedByEmail: "system", updatedAt: now },
      });
  } catch (e) {
    console.error("[ops-alert] history failed", e);
  }
}

function selectOpsAlertChannel(detail?: Record<string, unknown>) {
  const requestedChannel = typeof detail?.channel === "string" ? detail.channel : "";
  if (requestedChannel === "reward") {
    return webhookChannel(
      "reward",
      "OPS_ALERT_REWARD_WEBHOOK_URL",
      process.env.OPS_ALERT_REWARD_WEBHOOK_URL,
    );
  }
  if (requestedChannel === "abuse") {
    return webhookChannel(
      "abuse",
      "OPS_ALERT_ABUSE_WEBHOOK_URL",
      process.env.OPS_ALERT_ABUSE_WEBHOOK_URL,
    );
  }
  if (requestedChannel === "economy") {
    return webhookChannel(
      "economy",
      "OPS_ALERT_ECONOMY_WEBHOOK_URL",
      process.env.OPS_ALERT_ECONOMY_WEBHOOK_URL,
    );
  }
  if (requestedChannel === "deploy") {
    return webhookChannel(
      "deploy",
      "OPS_ALERT_DEPLOY_WEBHOOK_URL",
      process.env.OPS_ALERT_DEPLOY_WEBHOOK_URL,
    );
  }
  if (requestedChannel === "default") {
    return webhookChannel("default", "OPS_ALERT_WEBHOOK_URL", process.env.OPS_ALERT_WEBHOOK_URL);
  }
  const signalKey = typeof detail?.signalKey === "string" ? detail.signalKey : "";
  const eventType = typeof detail?.eventType === "string" ? detail.eventType : "";
  if (signalKey.includes("reward") || eventType.startsWith("reward.failure.")) {
    return webhookChannel(
      "reward",
      "OPS_ALERT_REWARD_WEBHOOK_URL",
      process.env.OPS_ALERT_REWARD_WEBHOOK_URL,
    );
  }
  if (
    signalKey.includes("abuse") ||
    signalKey.includes("rate-limit") ||
    signalKey.includes("same-ip")
  ) {
    return webhookChannel(
      "abuse",
      "OPS_ALERT_ABUSE_WEBHOOK_URL",
      process.env.OPS_ALERT_ABUSE_WEBHOOK_URL,
    );
  }
  if (signalKey.includes("economy") || eventType.startsWith("admin.reward.")) {
    return webhookChannel(
      "economy",
      "OPS_ALERT_ECONOMY_WEBHOOK_URL",
      process.env.OPS_ALERT_ECONOMY_WEBHOOK_URL,
    );
  }
  return webhookChannel("default", "OPS_ALERT_WEBHOOK_URL", process.env.OPS_ALERT_WEBHOOK_URL);
}

function webhookChannel(key: string, envName: string, url: string | undefined) {
  return {
    key,
    envName,
    url: url || process.env.OPS_ALERT_WEBHOOK_URL,
  };
}
