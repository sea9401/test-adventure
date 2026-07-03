import { db } from "@/db";
import { abuseEvents } from "@/db/schema";

type AbuseEventInput = {
  userId?: string | null;
  ip?: string | null;
  action: string;
  reason: string;
  detail?: Record<string, unknown> | null;
};

function cleanIp(ip: string | null | undefined): string | null {
  const value = ip?.trim();
  if (!value) return null;
  return value.slice(0, 128);
}

export function clientIpFromRequest(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return cleanIp(first);
  }
  return cleanIp(
    req.headers.get("x-real-ip") ??
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-client-ip"),
  );
}

export async function recordAbuseEvent(entry: AbuseEventInput): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await db.insert(abuseEvents).values({
      userId: entry.userId ?? null,
      ip: cleanIp(entry.ip),
      action: entry.action.slice(0, 160),
      reason: entry.reason.slice(0, 120),
      detail: entry.detail ?? null,
    });
  } catch (e) {
    console.error("[abuseLog] 기록 실패", entry.action, entry.reason, e);
  }
}

export function recordAbuseEventSoon(entry: AbuseEventInput): void {
  void recordAbuseEvent(entry);
}
