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

async function sendOpsAlert(message: string, detail?: Record<string, unknown>) {
  const url = process.env.OPS_ALERT_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: message,
        detail,
        at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error("[ops-alert] webhook failed", e);
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
    count: bucket.count,
    threshold,
    windowMs,
  });
}

export function resetOpsAlertsForTests() {
  signalBuckets.clear();
}
