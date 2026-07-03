type UserRateLimitOptions = {
  userId: string;
  action: string;
  limit: number;
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
) {
  const now = options.now ?? Date.now();
  const key = keyOf(options.userId, options.action);
  const prev = lastLimitedLogAt.get(key) ?? 0;
  if (prev > 0 && now - prev < LIMITED_LOG_INTERVAL_MS) return;
  lastLimitedLogAt.set(key, now);
  console.warn("[abuse-monitor] rate limit exceeded", {
    userId: options.userId,
    action: options.action,
    limit: options.limit,
    windowMs: options.windowMs,
    retryAfterSec,
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

export function resetUserRateLimitForTests() {
  buckets.clear();
  lastLimitedLogAt.clear();
  lastCleanupAt = 0;
}
