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

export async function sendOpsAlert(
  message: string,
  detail?: Record<string, unknown>,
) {
  const channel = selectOpsAlertChannel(detail);
  const url = channel.url;
  const recordedDetail = { ...(detail ?? {}), channel: channel.key };
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
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: message,
        detail: recordedDetail,
        at: new Date().toISOString(),
      }),
    });
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
