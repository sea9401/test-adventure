import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { abuseEvents } from "@/db/schema";
import { recordOpsSignal } from "@/lib/server/opsAlert";

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
    recordAbuseOpsSignal(entry);
  } catch (e) {
    console.error("[abuseLog] 기록 실패", entry.action, entry.reason, e);
  }
}

function recordAbuseOpsSignal(entry: AbuseEventInput) {
  if (entry.reason === "rate_limited") {
    recordOpsSignal({
      key: `abuse:rate-limited:${entry.action}`,
      label: `rate limit spike: ${entry.action}`,
      threshold: 30,
      windowMs: 10 * 60_000,
      detail: {
        action: entry.action,
        userId: entry.userId ?? null,
        ip: cleanIp(entry.ip),
      },
    });
  }

  const ip = cleanIp(entry.ip);
  if (!ip) return;
  void db
    .select({ userId: abuseEvents.userId })
    .from(abuseEvents)
    .where(
      and(
        eq(abuseEvents.ip, ip),
        gte(abuseEvents.createdAt, new Date(Date.now() - 60 * 60_000)),
      ),
    )
    .limit(300)
    .then((rows) => {
      const userIds = new Set(
        rows
          .filter((row) => row.userId && row.userId !== entry.userId)
          .map((row) => row.userId as string),
      );
      if (entry.userId) userIds.add(entry.userId);
      if (userIds.size < 3) return;
      recordOpsSignal({
        key: `abuse:shared-ip:${ip}`,
        label: "shared IP multi-account abuse candidate",
        threshold: 1,
        windowMs: 60 * 60_000,
        detail: {
          ip,
          userCount: userIds.size,
          sampleUserIds: [...userIds].slice(0, 8),
        },
      });
    })
    .catch((e) => console.error("[abuseLog] shared-ip signal failed", e));
}

export function recordAbuseEventSoon(entry: AbuseEventInput): void {
  void recordAbuseEvent(entry);
}
