export type ServiceObjectiveStatus = "healthy" | "breached" | "unknown";

type RuntimeFeatureSample = {
  requests: number;
  errors: number;
  durationMs: { p95: number };
};

export type RuntimeObjectiveSnapshot = {
  enabled: boolean;
  current: {
    features: Record<string, RuntimeFeatureSample | undefined>;
  };
  history: Array<{
    features: Record<string, RuntimeFeatureSample | undefined>;
  }>;
};

type ObjectiveDefinition = {
  key:
    | "public-availability"
    | "api-p95"
    | "api-error-rate"
    | "backup-freshness"
    | "critical-cron-freshness";
  label: string;
  targetLabel: string;
  window: string;
  source: string;
  unit: "%" | "ms" | "hours" | "minutes";
};

export type EvaluatedServiceObjective = ObjectiveDefinition & {
  status: ServiceObjectiveStatus;
  observed: number | null;
};

export const SERVICE_OBJECTIVES: readonly ObjectiveDefinition[] = [
  {
    key: "public-availability",
    label: "공개 서비스 가용성",
    targetLabel: "99.9% 이상",
    window: "최근 30일",
    source: "외부 uptime monitor",
    unit: "%",
  },
  {
    key: "api-p95",
    label: "API 응답 p95",
    targetLabel: "1,000ms 이하",
    window: "최근 런타임 표본",
    source: "runtime profiler",
    unit: "ms",
  },
  {
    key: "api-error-rate",
    label: "API 오류율",
    targetLabel: "1% 미만",
    window: "최근 런타임 표본",
    source: "runtime profiler",
    unit: "%",
  },
  {
    key: "backup-freshness",
    label: "DB 백업 최신성",
    targetLabel: "30시간 이내",
    window: "현재",
    source: "backup heartbeat",
    unit: "hours",
  },
  {
    key: "critical-cron-freshness",
    label: "중요 크론 최신성",
    targetLabel: "15분 이내",
    window: "현재",
    source: "cron heartbeat",
    unit: "minutes",
  },
] as const;

function unknownObjective(definition: ObjectiveDefinition) {
  return {
    ...definition,
    status: "unknown" as const,
    observed: null,
  };
}

function runtimeSamples(snapshot: RuntimeObjectiveSnapshot) {
  return [snapshot.current, ...snapshot.history].flatMap((window) =>
    Object.values(window.features).filter(
      (sample): sample is RuntimeFeatureSample =>
        Boolean(sample) && Number.isFinite(sample?.requests),
    ),
  );
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function evaluateRuntimeObjectives(
  snapshot: RuntimeObjectiveSnapshot | null,
): EvaluatedServiceObjective[] {
  const rows = SERVICE_OBJECTIVES.map(unknownObjective);
  if (!snapshot?.enabled) return rows;

  const samples = runtimeSamples(snapshot);
  const requestSamples = samples.filter((sample) => sample.requests > 0);
  if (requestSamples.length === 0) return rows;

  const requests = requestSamples.reduce(
    (total, sample) => total + Math.max(0, sample.requests),
    0,
  );
  const errors = requestSamples.reduce(
    (total, sample) => total + Math.max(0, sample.errors),
    0,
  );
  const p95 = Math.max(
    ...requestSamples.map((sample) => Math.max(0, sample.durationMs.p95)),
  );
  const errorRate = requests > 0 ? round((errors / requests) * 100) : 0;

  return rows.map((row) => {
    if (row.key === "api-p95") {
      return {
        ...row,
        observed: p95,
        status: p95 <= 1_000 ? "healthy" : "breached",
      };
    }
    if (row.key === "api-error-rate") {
      return {
        ...row,
        observed: errorRate,
        status: errorRate < 1 ? "healthy" : "breached",
      };
    }
    return row;
  });
}
