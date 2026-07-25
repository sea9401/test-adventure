import {
  clientIpFromRequest,
  recordAbuseEventSoon,
} from "@/lib/server/abuseLog";
import { recordOpsSignal } from "@/lib/server/opsAlert";
import {
  getRateLimitStore,
  resetRateLimitStoreForTests,
  type RateLimitResult,
} from "@/lib/server/rateLimitStore";

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

const lastLimitedLogAt = new Map<string, number>();
const LIMITED_LOG_INTERVAL_MS = 60_000;
const LIFE_IP_FANOUT_WINDOW_MS = 10 * 60_000;
const LIFE_IP_FANOUT_ACCOUNT_LIMIT = 3;

type LifeIpFanoutBucket = {
  users: Set<string>;
  resetAt: number;
  alerted: boolean;
};

const lifeIpFanout = new Map<string, LifeIpFanoutBucket>();

function keyOf(userId: string, action: string) {
  return `${action}:${userId}`;
}

export function checkUserRateLimit({
  userId,
  action,
  limit,
  windowMs,
  now = Date.now(),
}: UserRateLimitOptions): RateLimitResult {
  const key = keyOf(userId, action);
  return getRateLimitStore().check(key, limit, windowMs, now);
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
    key: `rate-limit:${rateLimitAlertGroup(options.action)}`,
    label: `rate limit exceeded repeatedly: ${rateLimitAlertGroup(options.action)}`,
    threshold: rateLimitAlertThreshold(options.action),
    windowMs: 5 * 60_000,
    detail: {
      action: options.action,
      group: rateLimitAlertGroup(options.action),
      scope: extra?.scope ?? "user",
    },
  });
}

function rateLimitAlertGroup(action: string): string {
  if (action.includes(":marketplace:")) return "marketplace";
  if (action.includes(":shop:")) return "shop";
  if (action.includes(":fishing:")) return "fishing";
  if (action.includes(":woodcutting:")) return "woodcutting";
  if (action.includes(":mining:")) return "mining";
  if (action.includes(":farming:") || action.includes(":farm:")) return "farming";
  if (
    action.includes(":dungeon:") ||
    action.includes(":coop:") ||
    action.includes(":arena:") ||
    action.includes(":grid-dungeon:") ||
    action.includes(":training:") ||
    action.includes(":outpost:")
  ) {
    return "battle";
  }
  if (action.includes(":me:state")) return "state";
  return "general";
}

function rateLimitAlertThreshold(action: string): number {
  const group = rateLimitAlertGroup(action);
  if (group === "marketplace" || group === "shop") return 12;
  if (group === "state") return 40;
  if (group === "battle") return 30;
  return 20;
}

function lifeIpFanoutResponse(args: {
  userId: string;
  action: string;
  ip: string;
  now: number;
}): Response | null {
  const group = rateLimitAlertGroup(args.action);
  if (!["fishing", "woodcutting", "mining", "farming"].includes(group)) {
    return null;
  }
  const current = lifeIpFanout.get(args.ip);
  const bucket =
    current && current.resetAt > args.now
      ? current
      : {
          users: new Set<string>(),
          resetAt: args.now + LIFE_IP_FANOUT_WINDOW_MS,
          alerted: false,
        };
  bucket.users.add(args.userId);
  lifeIpFanout.set(args.ip, bucket);
  if (bucket.users.size <= LIFE_IP_FANOUT_ACCOUNT_LIMIT) return null;

  if (!bucket.alerted) {
    bucket.alerted = true;
    console.warn("[abuse-monitor] life activity multi-account IP fanout", {
      userId: args.userId,
      action: args.action,
      ip: args.ip,
      accountCount: bucket.users.size,
      windowMs: LIFE_IP_FANOUT_WINDOW_MS,
    });
    recordAbuseEventSoon({
      userId: args.userId,
      ip: args.ip,
      action: args.action,
      reason: "multi_account_ip_fanout",
      detail: {
        accountCount: bucket.users.size,
        windowMs: LIFE_IP_FANOUT_WINDOW_MS,
      },
    });
    recordOpsSignal({
      key: `abuse:life-ip-fanout:${args.ip}`,
      label: "life activity multi-account IP fanout",
      threshold: 1,
      windowMs: LIFE_IP_FANOUT_WINDOW_MS,
      detail: {
        channel: "abuse",
        ip: args.ip,
        accountCount: bucket.users.size,
      },
    });
  }
  return userRateLimitResponse(
    Math.max(1, Math.ceil((bucket.resetAt - args.now) / 1000)),
  );
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
  const fanout = lifeIpFanoutResponse({
    userId: options.userId,
    action: options.action,
    ip,
    now: options.now ?? Date.now(),
  });
  if (fanout) return fanout;
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
  resetRateLimitStoreForTests();
  lastLimitedLogAt.clear();
  lifeIpFanout.clear();
}
