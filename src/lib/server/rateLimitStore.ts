export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; retryAfterSec: number; resetAt: number };

export type RateLimitStore = {
  check(key: string, limit: number, windowMs: number, now: number): RateLimitResult;
  reset?(): void;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const CLEANUP_INTERVAL_MS = 60_000;

class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, Bucket>();
  private lastCleanupAt = 0;

  check(key: string, limit: number, windowMs: number, now: number): RateLimitResult {
    this.cleanup(now);

    const current = this.buckets.get(key);
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
    this.buckets.set(key, bucket);
    return {
      ok: true,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  reset() {
    this.buckets.clear();
    this.lastCleanupAt = 0;
  }

  private cleanup(now: number) {
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    this.lastCleanupAt = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

const memoryStore = new MemoryRateLimitStore();

// Redis 이전 준비 지점. 여러 서버 인스턴스가 생기면 이 함수만 Redis 구현으로 교체한다.
// 현재 프로덕션은 단일 EC2 프로세스라 in-memory store 가 실제 동작과 가장 단순하게 맞는다.
export function getRateLimitStore(): RateLimitStore {
  return memoryStore;
}

export function resetRateLimitStoreForTests() {
  memoryStore.reset();
}
