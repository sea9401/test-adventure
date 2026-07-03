import {
  clientIpFromRequest,
  recordAbuseEventSoon,
} from "@/lib/server/abuseLog";
import { recordOpsSignal } from "@/lib/server/opsAlert";

type UserRateLimitOptions = {
  userId: string;
  action: string;
  limit: number;
  windowMs: number;
  now?: number;
};

type UserAndIpRateLimitOptions = {
  userId: string;
  action: string;
  userLimit: number;
  ipLimit: number;
  windowMs: number;
  now?: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const lastLimitedLogAt = new Map<string, number>();
let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 60_000;
const LIMITED_LOG_INTERVAL_MS = 60_000;

function keyOf(userId: string, action: string) {
  return `${action}:${userId}`;
}

function cleanup(now: number) {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function checkUserRateLimit({
  userId,
  action,
  limit,
  windowMs,
  now = Date.now(),
}: UserRateLimitOptions):
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; retryAfterSec: number; resetAt: number } {
  cleanup(now);

  const key = keyOf(userId, action);
  const current = buckets.get(key);
  const bucket =
    current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + windowMs };

  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      resetAt: bucket.resetAt,
    };
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  return {
    ok: true,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function userRateLimitResponse(retryAfterSec: number) {
  return Response.json(
    { ok: false, error: "rate_limited", retryAfterSec },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}

function logRateLimitExceeded(
  options: UserRateLimitOptions,
  retryAfterSec: number,
  extra?: {
    ip?: string | null;
    scope?: "user" | "ip";
    keyUserId?: string;
  },
) {
  const now = options.now ?? Date.now();
  const key = keyOf(extra?.keyUserId ?? options.userId, options.action);
  const prev = lastLimitedLogAt.get(key) ?? 0;
  if (prev > 0 && now - prev < LIMITED_LOG_INTERVAL_MS) return;
  lastLimitedLogAt.set(key, now);
  console.warn("[abuse-monitor] rate limit exceeded", {
    userId: options.userId,
    action: options.action,
    limit: options.limit,
    windowMs: options.windowMs,
    retryAfterSec,
    ip: extra?.ip,
    scope: extra?.scope ?? "user",
  });
  recordAbuseEventSoon({
    userId: options.userId,
    ip: extra?.ip ?? null,
    action: options.action,
    reason: "rate_limited",
    detail: {
      scope: extra?.scope ?? "user",
      limit: options.limit,
      windowMs: options.windowMs,
      retryAfterSec,
    },
  });
  recordOpsSignal({
    key: `rate-limit:${options.action}`,
    label: "rate limit exceeded repeatedly",
    threshold: 25,
    windowMs: 5 * 60_000,
    detail: {
      action: options.action,
      scope: extra?.scope ?? "user",
    },
  });
}

export function enforceUserRateLimit(
  options: UserRateLimitOptions,
): Response | null {
  const rateLimit = checkUserRateLimit(options);
  if (rateLimit.ok) return null;
  logRateLimitExceeded(options, rateLimit.retryAfterSec);
  return userRateLimitResponse(rateLimit.retryAfterSec);
}

export function enforceUserAndIpRateLimit(
  req: Request,
  options: UserAndIpRateLimitOptions,
): Response | null {
  const userLimit = checkUserRateLimit({
    userId: options.userId,
    action: options.action,
    limit: options.userLimit,
    windowMs: options.windowMs,
    now: options.now,
  });
  if (!userLimit.ok) {
    logRateLimitExceeded(
      {
        userId: options.userId,
        action: options.action,
        limit: options.userLimit,
        windowMs: options.windowMs,
        now: options.now,
      },
      userLimit.retryAfterSec,
      { scope: "user", ip: clientIpFromRequest(req) },
    );
    return userRateLimitResponse(userLimit.retryAfterSec);
  }

  const ip = clientIpFromRequest(req);
  if (!ip) return null;
  const ipKey = `ip:${ip}`;
  const ipLimit = checkUserRateLimit({
    userId: ipKey,
    action: options.action,
    limit: options.ipLimit,
    windowMs: options.windowMs,
    now: options.now,
  });
  if (!ipLimit.ok) {
    logRateLimitExceeded(
      {
        userId: options.userId,
        action: options.action,
        limit: options.ipLimit,
        windowMs: options.windowMs,
        now: options.now,
      },
      ipLimit.retryAfterSec,
      { scope: "ip", ip, keyUserId: ipKey },
    );
    return userRateLimitResponse(ipLimit.retryAfterSec);
  }
  return null;
}

export function resetUserRateLimitForTests() {
  buckets.clear();
  lastLimitedLogAt.clear();
  lastCleanupAt = 0;
}
