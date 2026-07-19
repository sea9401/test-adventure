import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

const MAX_LOGIN_ID_LENGTH = 128;
const MAX_PASSWORD_LENGTH = 256;
const DEFAULT_MAX_FAILURES = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_CLIENTS = 1_024;

export type ReviewLoginConfig = {
  loginId: string;
  password: string;
  userEmail: string;
};

type ReviewLoginEnv = {
  [key: string]: string | undefined;
  REVIEW_LOGIN_ID?: string;
  REVIEW_LOGIN_PASSWORD?: string;
  REVIEW_LOGIN_USER_EMAIL?: string;
};

type FailureBucket = {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
};

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function secureEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(digest(actual), digest(expected));
}

export function readReviewLoginConfig(
  env: ReviewLoginEnv = process.env,
): ReviewLoginConfig | null {
  const loginId = env.REVIEW_LOGIN_ID?.trim() ?? "";
  const password = env.REVIEW_LOGIN_PASSWORD ?? "";
  const userEmail = env.REVIEW_LOGIN_USER_EMAIL?.trim() ?? "";

  if (
    loginId.length < 3 ||
    loginId.length > MAX_LOGIN_ID_LENGTH ||
    password.length < 12 ||
    password.length > MAX_PASSWORD_LENGTH ||
    userEmail.length > 320 ||
    !userEmail.includes("@")
  ) {
    return null;
  }

  return { loginId, password, userEmail };
}

export function matchesReviewLoginCredentials(
  credentials: { loginId: unknown; password: unknown },
  config: ReviewLoginConfig,
): boolean {
  if (
    typeof credentials.loginId !== "string" ||
    typeof credentials.password !== "string"
  ) {
    return false;
  }

  const loginId = credentials.loginId.trim();
  const password = credentials.password;
  if (
    loginId.length === 0 ||
    loginId.length > MAX_LOGIN_ID_LENGTH ||
    password.length === 0 ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return false;
  }

  return (
    secureEqual(loginId, config.loginId) &&
    secureEqual(password, config.password)
  );
}

export function createReviewLoginThrottle({
  maxFailures = DEFAULT_MAX_FAILURES,
  windowMs = DEFAULT_WINDOW_MS,
}: {
  maxFailures?: number;
  windowMs?: number;
} = {}) {
  const buckets = new Map<string, FailureBucket>();

  function normalizedKey(key: string): string {
    return key.trim().slice(0, 128) || "unknown";
  }

  function prune(now: number): void {
    if (buckets.size < MAX_TRACKED_CLIENTS) return;
    for (const [key, bucket] of buckets) {
      if (
        bucket.blockedUntil <= now &&
        now - bucket.windowStartedAt >= windowMs
      ) {
        buckets.delete(key);
      }
    }
    if (buckets.size >= MAX_TRACKED_CLIENTS) buckets.clear();
  }

  return {
    canAttempt(key: string, now = Date.now()): boolean {
      const normalized = normalizedKey(key);
      const bucket = buckets.get(normalized);
      if (!bucket) return true;
      if (bucket.blockedUntil > now) return false;
      if (now - bucket.windowStartedAt >= windowMs) {
        buckets.delete(normalized);
      }
      return true;
    },

    recordFailure(key: string, now = Date.now()): void {
      prune(now);
      const normalized = normalizedKey(key);
      const previous = buckets.get(normalized);
      const bucket =
        !previous || now - previous.windowStartedAt >= windowMs
          ? { failures: 0, windowStartedAt: now, blockedUntil: 0 }
          : previous;
      bucket.failures += 1;
      if (bucket.failures >= maxFailures) {
        bucket.blockedUntil = now + windowMs;
      }
      buckets.set(normalized, bucket);
    },

    clear(key: string): void {
      buckets.delete(normalizedKey(key));
    },
  };
}

export const reviewLoginThrottle = createReviewLoginThrottle();
