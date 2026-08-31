export const RUNTIME_FEATURES = [
  "admin",
  "auth",
  "chat",
  "presence",
  "social",
  "marketplace",
  "combat",
  "progression",
  "life",
  "save",
  "cron",
  "health",
  "render",
  "static",
  "other",
] as const;

export type RuntimeFeature = (typeof RUNTIME_FEATURES)[number];

export const DURATION_BUCKETS_MS = [
  10,
  25,
  50,
  100,
  250,
  500,
  1_000,
  2_500,
  5_000,
  10_000,
  30_000,
  Number.POSITIVE_INFINITY,
] as const;

export type DatabaseRequestMetrics = {
  queryCount: number;
  errorCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  durationBucketCounts: number[];
};

export type RequestProfileRecord = {
  feature: RuntimeFeature;
  operation: string;
  method: string;
  statusCode: number;
  durationMs: number;
  responseBytes: number;
  database: DatabaseRequestMetrics;
  aborted?: boolean;
};

export type DurationSummary = {
  average: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
};

export type FeatureProfile = {
  requests: number;
  errors: number;
  responseBytes: number;
  durationMs: DurationSummary;
  database: {
    queries: number;
    errors: number;
    durationMs: DurationSummary;
  };
};

export type SlowRequestProfile = {
  feature: RuntimeFeature;
  operation: string;
  method: string;
  statusCode: number;
  durationMs: number;
  responseBytes: number;
  dbQueries: number;
  dbDurationMs: number;
};

export type DatabasePoolMetrics = {
  total: number;
  idle: number;
  waiting: number;
};

export type RuntimeIntervalMetrics = {
  cpuPercent: number;
  rssBytes: number;
  heapUsedBytes: number;
  eventLoopDelayMs: {
    mean: number;
    p95: number;
    max: number;
  };
  databasePool: DatabasePoolMetrics | null;
};

export type ProfilerWindow = {
  startedAt: string;
  endedAt: string;
  features: Partial<Record<RuntimeFeature, FeatureProfile>>;
  operations: Record<string, FeatureProfile>;
  slowRequests: SlowRequestProfile[];
  runtime: RuntimeIntervalMetrics;
};

export type CurrentProfilerWindow = Omit<ProfilerWindow, "runtime">;

export type ProfilerAggregationSnapshot = {
  current: CurrentProfilerWindow;
  history: ProfilerWindow[];
};
