import { describe, expect, it, vi } from "vitest";
import { createProfilerAggregator } from "./aggregate";
import {
  createRuntimeMetricsSampler,
  createRuntimeProfilerService,
  resolveRuntimeProfilerConfig,
} from "./runtime";

describe("resolveRuntimeProfilerConfig", () => {
  it("production에서 기본 활성화하고 test에서는 기본 비활성화한다", () => {
    expect(resolveRuntimeProfilerConfig({}, "production")).toEqual({
      enabled: true,
      intervalMs: 60_000,
    });
    expect(resolveRuntimeProfilerConfig({}, "test")).toEqual({
      enabled: false,
      intervalMs: 60_000,
    });
  });

  it("명시적 활성화 값과 1초 이상의 구간만 허용한다", () => {
    expect(
      resolveRuntimeProfilerConfig(
        { RUNTIME_PROFILER_ENABLED: "1", RUNTIME_PROFILER_INTERVAL_MS: "5000" },
        "development",
      ),
    ).toEqual({ enabled: true, intervalMs: 5_000 });
    expect(
      resolveRuntimeProfilerConfig(
        { RUNTIME_PROFILER_ENABLED: "0", RUNTIME_PROFILER_INTERVAL_MS: "999" },
        "production",
      ),
    ).toEqual({ enabled: false, intervalMs: 60_000 });
  });
});

describe("createRuntimeMetricsSampler", () => {
  it("CPU·메모리·이벤트 루프·DB 풀 수치를 구간 단위로 계산한다", () => {
    const monitor = {
      mean: 2_000_000,
      max: 9_000_000,
      enable: vi.fn(),
      reset: vi.fn(),
      percentile: vi.fn(() => 5_000_000),
    };
    const nowValues = [BigInt(0), BigInt(1_000_000_000)];
    const cpuUsage = vi
      .fn()
      .mockReturnValueOnce({ user: 0, system: 0 })
      .mockReturnValueOnce({ user: 500_000, system: 250_000 });
    const sampler = createRuntimeMetricsSampler({
      nowNs: () => nowValues.shift() ?? BigInt(1_000_000_000),
      cpuUsage,
      memoryUsage: () => ({ rss: 120, heapUsed: 70 }),
      eventLoopMonitor: monitor,
      readPoolMetrics: () => ({ total: 10, idle: 3, waiting: 2 }),
    });

    expect(sampler.sample()).toEqual({
      cpuPercent: 75,
      rssBytes: 120,
      heapUsedBytes: 70,
      eventLoopDelayMs: { mean: 2, p95: 5, max: 9 },
      databasePool: { total: 10, idle: 3, waiting: 2 },
    });
    expect(monitor.enable).toHaveBeenCalledOnce();
    expect(monitor.reset).toHaveBeenCalledOnce();
    expect(monitor.percentile).toHaveBeenCalledWith(95);
  });
});

describe("createRuntimeProfilerService", () => {
  it("한 번만 시작하고 매 구간 구조화 로그와 완료 스냅샷을 만든다", () => {
    let now = 0;
    const aggregator = createProfilerAggregator({ now: () => now });
    const installHttp = vi.fn();
    const unref = vi.fn();
    let scheduled: (() => void) | undefined;
    const log = vi.fn();
    const service = createRuntimeProfilerService({
      enabled: true,
      intervalMs: 60_000,
      aggregator,
      installHttp,
      sampler: {
        sample: () => ({
          cpuPercent: 10,
          rssBytes: 100,
          heapUsedBytes: 50,
          eventLoopDelayMs: { mean: 1, p95: 2, max: 3 },
          databasePool: null,
        }),
      },
      schedule: (callback) => {
        scheduled = callback;
        return { unref };
      },
      log,
      logError: vi.fn(),
    });

    service.start();
    service.start();
    now = 60_000;
    scheduled?.();

    expect(installHttp).toHaveBeenCalledOnce();
    expect(unref).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledOnce();
    const line = log.mock.calls[0]?.[0] as string;
    expect(line.startsWith("[runtime-profiler] ")).toBe(true);
    expect(JSON.parse(line.slice("[runtime-profiler] ".length))).toMatchObject({
      type: "interval",
      runtime: { cpuPercent: 10 },
    });
    expect(service.snapshot()).toMatchObject({
      enabled: true,
      intervalMs: 60_000,
      history: [{ runtime: { cpuPercent: 10 } }],
    });
  });

  it("비활성화 상태에서는 HTTP나 타이머를 시작하지 않는다", () => {
    const aggregator = createProfilerAggregator({ now: () => 0 });
    const installHttp = vi.fn();
    const schedule = vi.fn();
    const service = createRuntimeProfilerService({
      enabled: false,
      intervalMs: 60_000,
      aggregator,
      installHttp,
      sampler: { sample: vi.fn() },
      schedule,
      log: vi.fn(),
      logError: vi.fn(),
    });

    service.start();

    expect(installHttp).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(service.snapshot()).toMatchObject({
      enabled: false,
      history: [],
    });
  });

  it("계측 구간 오류를 요청 경로로 전파하지 않는다", () => {
    const aggregator = createProfilerAggregator({ now: () => 0 });
    const logError = vi.fn();
    let scheduled: (() => void) | undefined;
    const service = createRuntimeProfilerService({
      enabled: true,
      intervalMs: 60_000,
      aggregator,
      installHttp: () => {
        throw new Error("hook failure");
      },
      sampler: {
        sample: () => {
          throw new Error("sample failure");
        },
      },
      schedule: (callback) => {
        scheduled = callback;
        return { unref: vi.fn() };
      },
      log: vi.fn(),
      logError,
    });

    expect(() => service.start()).not.toThrow();
    expect(() => scheduled?.()).not.toThrow();
    expect(logError).toHaveBeenCalledTimes(2);
  });

  it("타이머 설치 실패를 서버 시작 경로로 전파하지 않는다", () => {
    const aggregator = createProfilerAggregator({ now: () => 0 });
    const logError = vi.fn();
    const service = createRuntimeProfilerService({
      enabled: true,
      intervalMs: 60_000,
      aggregator,
      installHttp: vi.fn(),
      sampler: { sample: vi.fn() },
      schedule: () => {
        throw new Error("timer failure");
      },
      log: vi.fn(),
      logError,
    });

    expect(() => service.start()).not.toThrow();
    expect(logError).toHaveBeenCalledOnce();
  });

  it("DB 풀 대기가 3개 구간 연속 발생하면 한 번 알리고 정상 구간 후 다시 감시한다", () => {
    const aggregator = createProfilerAggregator({ now: () => 0 });
    let waiting = 1;
    let scheduled: (() => void) | undefined;
    const onPoolWaitingAlert = vi.fn();
    const service = createRuntimeProfilerService({
      enabled: true,
      intervalMs: 60_000,
      aggregator,
      installHttp: vi.fn(),
      sampler: {
        sample: () => ({
          cpuPercent: 1,
          rssBytes: 1,
          heapUsedBytes: 1,
          eventLoopDelayMs: { mean: 0, p95: 0, max: 0 },
          databasePool: { total: 10, idle: 0, waiting },
        }),
      },
      schedule: (callback) => {
        scheduled = callback;
        return { unref: vi.fn() };
      },
      log: vi.fn(),
      logError: vi.fn(),
      onPoolWaitingAlert,
    });

    service.start();
    scheduled?.();
    scheduled?.();
    expect(onPoolWaitingAlert).not.toHaveBeenCalled();
    scheduled?.();
    scheduled?.();
    expect(onPoolWaitingAlert).toHaveBeenCalledTimes(1);
    expect(onPoolWaitingAlert).toHaveBeenCalledWith({
      consecutiveIntervals: 3,
      intervalMs: 60_000,
      total: 10,
      idle: 0,
      waiting: 1,
    });

    waiting = 0;
    scheduled?.();
    waiting = 2;
    scheduled?.();
    scheduled?.();
    scheduled?.();
    expect(onPoolWaitingAlert).toHaveBeenCalledTimes(2);
  });
});
