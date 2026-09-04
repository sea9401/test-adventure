import { monitorEventLoopDelay } from "node:perf_hooks";
import type { Pool } from "pg";
import { createProfilerAggregator, type ProfilerAggregator } from "./aggregate";
import { installHttpRequestInstrumentation } from "./httpInstrumentation";
import {
  instrumentPgPool,
  readInstrumentedPoolMetrics,
} from "./pgInstrumentation";
import type {
  DatabasePoolMetrics,
  ProfilerAggregationSnapshot,
  RuntimeIntervalMetrics,
} from "./types";

const DEFAULT_INTERVAL_MS = 60_000;

export type RuntimeProfilerSnapshot = ProfilerAggregationSnapshot & {
  enabled: boolean;
  intervalMs: number;
};

type EventLoopMonitor = {
  readonly mean: number;
  readonly max: number;
  enable(): void;
  reset(): void;
  percentile(percentile: number): number;
};

type MetricsSamplerOptions = {
  nowNs: () => bigint;
  cpuUsage: () => NodeJS.CpuUsage;
  memoryUsage: () => { rss: number; heapUsed: number };
  eventLoopMonitor: EventLoopMonitor;
  readPoolMetrics: () => DatabasePoolMetrics | null;
};

type RuntimeMetricsSampler = {
  sample(): RuntimeIntervalMetrics;
};

type ScheduledTimer = { unref(): unknown };

type RuntimeProfilerServiceOptions = {
  enabled: boolean;
  intervalMs: number;
  aggregator: ProfilerAggregator;
  installHttp: () => unknown;
  sampler: RuntimeMetricsSampler;
  schedule: (callback: () => void, intervalMs: number) => ScheduledTimer;
  log: (line: string) => void;
  logError: (message: string, error: unknown) => void;
  onPoolWaitingAlert?: (detail: {
    consecutiveIntervals: number;
    intervalMs: number;
    total: number;
    idle: number;
    waiting: number;
  }) => void | Promise<void>;
};

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function nanosecondsToMilliseconds(value: number): number {
  return round(value / 1_000_000);
}

export function resolveRuntimeProfilerConfig(
  env: Record<string, string | undefined>,
  nodeEnv: string | undefined,
): { enabled: boolean; intervalMs: number } {
  const enabledSetting = env.RUNTIME_PROFILER_ENABLED?.trim().toLowerCase();
  const enabled =
    enabledSetting === "0" || enabledSetting === "false"
      ? false
      : enabledSetting === "1" || enabledSetting === "true"
        ? true
        : nodeEnv === "production";
  const parsedInterval = Number(env.RUNTIME_PROFILER_INTERVAL_MS);
  const intervalMs =
    Number.isFinite(parsedInterval) && parsedInterval >= 1_000
      ? Math.floor(parsedInterval)
      : DEFAULT_INTERVAL_MS;
  return { enabled, intervalMs };
}

export function createRuntimeMetricsSampler(
  options: MetricsSamplerOptions,
): RuntimeMetricsSampler {
  let previousTimeNs = options.nowNs();
  let previousCpu = options.cpuUsage();
  options.eventLoopMonitor.enable();

  return {
    sample(): RuntimeIntervalMetrics {
      const currentTimeNs = options.nowNs();
      const currentCpu = options.cpuUsage();
      const elapsedMicros = Math.max(
        1,
        Number(currentTimeNs - previousTimeNs) / 1_000,
      );
      const usedMicros = Math.max(
        0,
        currentCpu.user - previousCpu.user +
          (currentCpu.system - previousCpu.system),
      );
      const memory = options.memoryUsage();
      const metrics: RuntimeIntervalMetrics = {
        cpuPercent: round((usedMicros / elapsedMicros) * 100),
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        eventLoopDelayMs: {
          mean: nanosecondsToMilliseconds(options.eventLoopMonitor.mean),
          p95: nanosecondsToMilliseconds(
            options.eventLoopMonitor.percentile(95),
          ),
          max: nanosecondsToMilliseconds(options.eventLoopMonitor.max),
        },
        databasePool: options.readPoolMetrics(),
      };

      previousTimeNs = currentTimeNs;
      previousCpu = currentCpu;
      options.eventLoopMonitor.reset();
      return metrics;
    },
  };
}

export function createRuntimeProfilerService(
  options: RuntimeProfilerServiceOptions,
) {
  let started = false;
  let consecutivePoolWaitingIntervals = 0;

  const start = (): void => {
    if (started || !options.enabled) return;
    started = true;
    try {
      options.installHttp();
    } catch (error) {
      options.logError("HTTP instrumentation failed", error);
    }

    try {
      const timer = options.schedule(() => {
        try {
          const completed = options.aggregator.rotate(options.sampler.sample());
          options.log(
            `[runtime-profiler] ${JSON.stringify({ type: "interval", ...completed })}`,
          );
          const pool = completed.runtime.databasePool;
          consecutivePoolWaitingIntervals =
            pool && pool.waiting > 0
              ? consecutivePoolWaitingIntervals + 1
              : 0;
          if (
            pool &&
            consecutivePoolWaitingIntervals === 3 &&
            options.onPoolWaitingAlert
          ) {
            try {
              void Promise.resolve(
                options.onPoolWaitingAlert({
                  consecutiveIntervals: consecutivePoolWaitingIntervals,
                  intervalMs: options.intervalMs,
                  ...pool,
                }),
              ).catch((error) =>
                options.logError("pool waiting alert failed", error),
              );
            } catch (error) {
              options.logError("pool waiting alert failed", error);
            }
          }
        } catch (error) {
          options.logError("interval collection failed", error);
        }
      }, options.intervalMs);
      timer.unref();
    } catch (error) {
      options.logError("interval timer setup failed", error);
    }
  };

  const snapshot = (): RuntimeProfilerSnapshot => ({
    enabled: options.enabled,
    intervalMs: options.intervalMs,
    ...options.aggregator.snapshot(),
  });

  return { enabled: options.enabled, start, snapshot };
}

type RuntimeProfilerService = ReturnType<typeof createRuntimeProfilerService>;

declare global {
  var __adventureRuntimeProfilerService: RuntimeProfilerService | undefined;
}

function logProfilerError(message: string, error: unknown): void {
  console.error(`[runtime-profiler] ${message}`, error);
}

function createProductionService(): RuntimeProfilerService {
  const config = resolveRuntimeProfilerConfig(process.env, process.env.NODE_ENV);
  const aggregator = createProfilerAggregator();
  const sampler = config.enabled
    ? createRuntimeMetricsSampler({
        nowNs: process.hrtime.bigint,
        cpuUsage: process.cpuUsage,
        memoryUsage: process.memoryUsage,
        eventLoopMonitor: monitorEventLoopDelay({ resolution: 20 }),
        readPoolMetrics: readInstrumentedPoolMetrics,
      })
    : {
        sample: (): RuntimeIntervalMetrics => {
          throw new Error("runtime profiler is disabled");
        },
      };

  return createRuntimeProfilerService({
    ...config,
    aggregator,
    installHttp: () =>
      installHttpRequestInstrumentation(aggregator, {
        onError: (error) => logProfilerError("request collection failed", error),
      }),
    sampler,
    schedule: (callback, intervalMs) => setInterval(callback, intervalMs),
    log: console.info,
    logError: logProfilerError,
    onPoolWaitingAlert: async (detail) => {
      const { sendOpsAlert } = await import("@/lib/server/opsAlert");
      await sendOpsAlert("[ops] DB 커넥션 풀 대기 지속", {
        alertType: "database.pool_waiting",
        channel: "default",
        ...detail,
      });
    },
  });
}

export function startRuntimeProfiler(): void {
  globalThis.__adventureRuntimeProfilerService ??= createProductionService();
  globalThis.__adventureRuntimeProfilerService.start();
}

export function getRuntimeProfilerSnapshot(): RuntimeProfilerSnapshot {
  const service = globalThis.__adventureRuntimeProfilerService;
  if (service) return service.snapshot();

  const aggregator = createProfilerAggregator();
  return {
    enabled: false,
    intervalMs: DEFAULT_INTERVAL_MS,
    ...aggregator.snapshot(),
  };
}

export function instrumentRuntimeDatabasePool(pool: Pool): boolean {
  if (!globalThis.__adventureRuntimeProfilerService?.enabled) return false;
  return instrumentPgPool(
    pool as unknown as Parameters<typeof instrumentPgPool>[0],
    { onError: (error) => logProfilerError("database collection failed", error) },
  );
}
