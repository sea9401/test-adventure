import { and, eq, gte } from "drizzle-orm";
import { isIP } from "node:net";
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
  // 운영 Nginx가 외부 입력을 덮어써서 보내는 X-Real-IP를 최우선 신뢰한다.
  // X-Forwarded-For의 첫 값은 클라이언트가 임의로 넣을 수 있으므로 사용하지 않는다.
  const trustedSingleHeaders = ["x-real-ip", "cf-connecting-ip"];
  for (const name of trustedSingleHeaders) {
    const value = req.headers.get(name)?.trim();
    if (value && isIP(value)) return cleanIp(value);
  }

  // 직접 실행/테스트처럼 X-Real-IP가 없는 경우에는 가장 가까운 프록시가 추가한
  // 오른쪽 끝 주소만 fallback으로 사용한다. 유효한 IP가 아니면 rate-limit key로 쓰지 않는다.
  const forwarded = req.headers.get("x-forwarded-for");
  const nearest = forwarded?.split(",").at(-1)?.trim();
  return nearest && isIP(nearest) ? cleanIp(nearest) : null;
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
      alertType: "abuse.rate_limit_spike",
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
        alertType: "abuse.shared_ip_candidate",
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
