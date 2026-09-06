import {
  DURATION_BUCKETS_MS,
  type CurrentProfilerWindow,
  type DatabaseRequestMetrics,
  type DurationSummary,
  type FeatureProfile,
  type ProfilerAggregationSnapshot,
  type ProfilerWindow,
  type RequestProfileRecord,
  type RuntimeFeature,
  type RuntimeIntervalMetrics,
  type SlowRequestProfile,
  type RequestPhases,
  type RequestPhase,
} from "./types";

type MutableFeatureProfile = {
  requests: number;
  errors: number;
  serverErrors: number;
  abortedRequests: number;
  phases: RequestPhases;
  responseBytes: number;
  durationTotalMs: number;
  durationMaxMs: number;
  durationBucketCounts: number[];
  database: DatabaseRequestMetrics;
};

type MutableWindow = {
  startedAtMs: number;
  features: Partial<Record<RuntimeFeature, MutableFeatureProfile>>;
  operations: Record<string, MutableFeatureProfile>;
  slowRequests: SlowRequestProfile[];
};

type AggregatorOptions = {
  now?: () => number;
  historyLimit?: number;
  slowRequestThresholdMs?: number;
  slowRequestLimit?: number;
};

const round = (value: number): number => Math.round(value * 100) / 100;

function emptyBuckets(): number[] {
  return DURATION_BUCKETS_MS.map(() => 0);
}

function emptyDatabaseMetrics(): DatabaseRequestMetrics {
  return {
    queryCount: 0,
    errorCount: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    durationBucketCounts: emptyBuckets(),
  };
}

function emptyFeatureProfile(): MutableFeatureProfile {
  return {
    requests: 0,
    errors: 0,
    serverErrors: 0,
    abortedRequests: 0,
    phases: {},
    responseBytes: 0,
    durationTotalMs: 0,
    durationMaxMs: 0,
    durationBucketCounts: emptyBuckets(),
    database: emptyDatabaseMetrics(),
  };
}

function addDuration(bucketCounts: number[], durationMs: number): void {
  const safeDuration = Math.max(0, durationMs);
  const index = DURATION_BUCKETS_MS.findIndex(
    (upperBound) => safeDuration <= upperBound,
  );
  bucketCounts[index < 0 ? bucketCounts.length - 1 : index] += 1;
}

function mergeBuckets(target: number[], source: readonly number[]): void {
  for (let index = 0; index < target.length; index += 1) {
    target[index] += Math.max(0, source[index] ?? 0);
  }
}

function percentile(
  bucketCounts: readonly number[],
  quantile: number,
  max: number,
): number {
  const count = bucketCounts.reduce((total, value) => total + value, 0);
  if (count === 0) return 0;
  const rank = Math.ceil(count * quantile);
  let cumulative = 0;
  for (let index = 0; index < bucketCounts.length; index += 1) {
    cumulative += bucketCounts[index] ?? 0;
    if (cumulative >= rank) {
      const upperBound = DURATION_BUCKETS_MS[index];
      return Number.isFinite(upperBound) ? upperBound : round(max);
    }
  }
  return round(max);
}

function durationSummary(
  count: number,
  total: number,
  max: number,
  buckets: readonly number[],
): DurationSummary {
  return {
    average: count > 0 ? round(total / count) : 0,
    max: round(max),
    p50: percentile(buckets, 0.5, max),
    p95: percentile(buckets, 0.95, max),
    p99: percentile(buckets, 0.99, max),
  };
}

function serializeFeature(profile: MutableFeatureProfile): FeatureProfile {
  return {
    requests: profile.requests,
    errors: profile.errors,
    serverErrors: profile.serverErrors,
    abortedRequests: profile.abortedRequests,
    ...(Object.keys(profile.phases).length > 0
      ? { phases: structuredClone(profile.phases) }
      : {}),
    responseBytes: profile.responseBytes,
    durationMs: durationSummary(
      profile.requests,
      profile.durationTotalMs,
      profile.durationMaxMs,
      profile.durationBucketCounts,
    ),
    database: {
      queries: profile.database.queryCount,
      errors: profile.database.errorCount,
      durationMs: durationSummary(
        profile.database.queryCount,
        profile.database.totalDurationMs,
        profile.database.maxDurationMs,
        profile.database.durationBucketCounts,
      ),
    },
  };
}

function serializeFeatures(
  features: MutableWindow["features"],
): Partial<Record<RuntimeFeature, FeatureProfile>> {
  return Object.fromEntries(
    Object.entries(features).map(([feature, profile]) => [
      feature,
      serializeFeature(profile),
    ]),
  );
}

function serializeOperations(
  operations: MutableWindow["operations"],
): Record<string, FeatureProfile> {
  return Object.fromEntries(
    Object.entries(operations).map(([operation, profile]) => [
      operation,
      serializeFeature(profile),
    ]),
  );
}

function addRequestToProfile(
  profile: MutableFeatureProfile,
  record: RequestProfileRecord,
): number {
  const durationMs = Math.max(0, record.durationMs);
  profile.requests += 1;
  profile.errors +=
    record.aborted === true || record.statusCode >= 500 ? 1 : 0;
  profile.serverErrors += record.statusCode >= 500 ? 1 : 0;
  profile.abortedRequests += record.aborted === true ? 1 : 0;
  for (const phase of Object.keys(record.phases ?? {}) as RequestPhase[]) {
    const value = record.phases?.[phase];
    if (!value) continue;
    const total = profile.phases[phase] ??= {
      count: 0, failed: 0, totalMs: 0, maxMs: 0, dbQueries: 0, dbMs: 0,
    };
    total.count += value.count;
    total.failed += value.failed;
    total.totalMs += value.totalMs;
    total.maxMs = Math.max(total.maxMs, value.maxMs);
    total.dbQueries += value.dbQueries;
    total.dbMs += value.dbMs;
  }
  profile.responseBytes += Math.max(0, Math.round(record.responseBytes));
  profile.durationTotalMs += durationMs;
  profile.durationMaxMs = Math.max(profile.durationMaxMs, durationMs);
  addDuration(profile.durationBucketCounts, durationMs);
  profile.database.queryCount += Math.max(0, record.database.queryCount);
  profile.database.errorCount += Math.max(0, record.database.errorCount);
  profile.database.totalDurationMs += Math.max(
    0,
    record.database.totalDurationMs,
  );
  profile.database.maxDurationMs = Math.max(
    profile.database.maxDurationMs,
    record.database.maxDurationMs,
  );
  mergeBuckets(
    profile.database.durationBucketCounts,
    record.database.durationBucketCounts,
  );
  return durationMs;
}

export function createProfilerAggregator(options: AggregatorOptions = {}) {
  const now = options.now ?? Date.now;
  const historyLimit = Math.max(1, options.historyLimit ?? 60);
  const slowRequestThresholdMs = Math.max(
    0,
    options.slowRequestThresholdMs ?? 1_000,
  );
  const slowRequestLimit = Math.max(0, options.slowRequestLimit ?? 10);
  let current: MutableWindow = {
    startedAtMs: now(),
    features: {},
    operations: {},
    slowRequests: [],
  };
  const history: ProfilerWindow[] = [];

  const recordRequest = (record: RequestProfileRecord): void => {
    const featureProfile = (current.features[record.feature] ??=
      emptyFeatureProfile());
    const durationMs = addRequestToProfile(featureProfile, record);
    const operationProfile = (current.operations[record.operation] ??=
      emptyFeatureProfile());
    addRequestToProfile(operationProfile, record);

    if (durationMs >= slowRequestThresholdMs && slowRequestLimit > 0) {
      current.slowRequests.push({
        feature: record.feature,
        operation: record.operation,
        method: record.method,
        statusCode: record.statusCode,
        durationMs: round(durationMs),
        responseBytes: Math.max(0, Math.round(record.responseBytes)),
        dbQueries: Math.max(0, record.database.queryCount),
        dbDurationMs: round(Math.max(0, record.database.totalDurationMs)),
      });
      current.slowRequests.sort((left, right) =>
        right.durationMs - left.durationMs,
      );
      current.slowRequests.length = Math.min(
        current.slowRequests.length,
        slowRequestLimit,
      );
    }
  };

  const serializeCurrent = (endedAtMs: number): CurrentProfilerWindow => ({
    startedAt: new Date(current.startedAtMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    features: serializeFeatures(current.features),
    operations: serializeOperations(current.operations),
    slowRequests: current.slowRequests.map((request) => ({ ...request })),
  });

  const rotate = (runtime: RuntimeIntervalMetrics): ProfilerWindow => {
    const endedAtMs = now();
    const completed: ProfilerWindow = {
      ...serializeCurrent(endedAtMs),
      runtime: structuredClone(runtime),
    };
    history.push(completed);
    if (history.length > historyLimit) history.shift();
    current = {
      startedAtMs: endedAtMs,
      features: {},
      operations: {},
      slowRequests: [],
    };
    return structuredClone(completed);
  };

  const snapshot = (): ProfilerAggregationSnapshot =>
    structuredClone({
      current: serializeCurrent(now()),
      history,
    });

  return { recordRequest, rotate, snapshot };
}

export type ProfilerAggregator = ReturnType<typeof createProfilerAggregator>;
