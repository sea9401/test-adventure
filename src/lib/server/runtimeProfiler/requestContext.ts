import { AsyncLocalStorage } from "node:async_hooks";
import {
  DURATION_BUCKETS_MS,
  type DatabaseRequestMetrics,
  type RuntimeFeature,
} from "./types";

export type RequestProfileContext = {
  feature: RuntimeFeature;
  operation: string;
  method: string;
  startedAtNs: bigint;
  socketBytesAtStart: number;
  database: DatabaseRequestMetrics;
};

declare global {
  var __adventureProfilerRequestStorage:
    | AsyncLocalStorage<RequestProfileContext>
    | undefined;
}

function requestStorage(): AsyncLocalStorage<RequestProfileContext> {
  globalThis.__adventureProfilerRequestStorage ??= new AsyncLocalStorage();
  return globalThis.__adventureProfilerRequestStorage;
}

export function createRequestProfile(input: {
  feature: RuntimeFeature;
  operation?: string;
  method: string;
  startedAtNs: bigint;
  socketBytesAtStart: number;
}): RequestProfileContext {
  return {
    ...input,
    operation:
      input.operation ?? `${input.method.toUpperCase()} ${input.feature}`,
    database: {
      queryCount: 0,
      errorCount: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      durationBucketCounts: DURATION_BUCKETS_MS.map(() => 0),
    },
  };
}

export function runWithRequestProfile<T>(
  profile: RequestProfileContext,
  callback: () => T,
): T {
  return requestStorage().run(profile, callback);
}

export function runOutsideRequestProfile<T>(callback: () => T): T {
  return requestStorage().exit(callback);
}

export function currentRequestProfile(): RequestProfileContext | undefined {
  return requestStorage().getStore();
}

export function recordDatabaseQuery(
  profile: RequestProfileContext,
  durationMs: number,
  failed: boolean,
): void {
  const safeDuration = Math.max(0, durationMs);
  profile.database.queryCount += 1;
  profile.database.errorCount += failed ? 1 : 0;
  profile.database.totalDurationMs += safeDuration;
  profile.database.maxDurationMs = Math.max(
    profile.database.maxDurationMs,
    safeDuration,
  );
  const bucketIndex = DURATION_BUCKETS_MS.findIndex(
    (upperBound) => safeDuration <= upperBound,
  );
  const index =
    bucketIndex < 0
      ? profile.database.durationBucketCounts.length - 1
      : bucketIndex;
  profile.database.durationBucketCounts[index] += 1;
}
