import { describe, expect, it } from "vitest";
import { createProfilerAggregator } from "./aggregate";
import type {
  DatabaseRequestMetrics,
  RuntimeIntervalMetrics,
} from "./types";

const emptyDb = (): DatabaseRequestMetrics => ({
  queryCount: 0,
  errorCount: 0,
  totalDurationMs: 0,
  maxDurationMs: 0,
  durationBucketCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

const runtime = (cpuPercent: number): RuntimeIntervalMetrics => ({
  cpuPercent,
  rssBytes: 100,
  heapUsedBytes: 50,
  eventLoopDelayMs: { mean: 2, p95: 5, max: 9 },
  databasePool: { total: 4, idle: 2, waiting: 1 },
});

describe("createProfilerAggregator", () => {
  it("separates server failures and client aborts without double-counting legacy errors", () => {
    const aggregator = createProfilerAggregator();
    for (const [statusCode, aborted] of [[200, false], [500, false], [200, true], [500, true]] as const) {
      aggregator.recordRequest({ feature: "save", operation: "GET /api/v2/me/state", method: "GET", statusCode, aborted, durationMs: 10, responseBytes: 0, database: emptyDb() });
    }
    expect(aggregator.snapshot().current.features.save).toMatchObject({
      requests: 4, errors: 3, serverErrors: 2, abortedRequests: 2,
    });
    expect(aggregator.snapshot().current.operations["GET /api/v2/me/state"]).toMatchObject({
      errors: 3, serverErrors: 2, abortedRequests: 2,
    });
  });
  it("기능별 요청·오류·바이트와 요청/DB 지연 분포를 집계한다", () => {
    let now = 1_000;
    const aggregator = createProfilerAggregator({ now: () => now });

    aggregator.recordRequest({
      feature: "chat",
      operation: "GET chat",
      method: "GET",
      statusCode: 200,
      durationMs: 50,
      responseBytes: 100,
      database: {
        queryCount: 2,
        errorCount: 0,
        totalDurationMs: 25,
        maxDurationMs: 20,
        durationBucketCounts: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    });
    aggregator.recordRequest({
      feature: "chat",
      operation: "GET chat",
      method: "GET",
      statusCode: 503,
      durationMs: 200,
      responseBytes: 50,
      database: {
        queryCount: 1,
        errorCount: 1,
        totalDurationMs: 200,
        maxDurationMs: 200,
        durationBucketCounts: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      },
    });

    now = 61_000;
    const completed = aggregator.rotate(runtime(12.5));

    expect(completed.startedAt).toBe("1970-01-01T00:00:01.000Z");
    expect(completed.endedAt).toBe("1970-01-01T00:01:01.000Z");
    expect(completed.runtime.cpuPercent).toBe(12.5);
    expect(completed.features.chat).toEqual({
      requests: 2,
      errors: 1,
      serverErrors: 1,
      abortedRequests: 0,
      responseBytes: 150,
      durationMs: { average: 125, max: 200, p50: 50, p95: 250, p99: 250 },
      database: {
        queries: 3,
        errors: 1,
        durationMs: {
          average: 75,
          max: 200,
          p50: 25,
          p95: 250,
          p99: 250,
        },
      },
    });
    expect(completed.operations["GET chat"]).toEqual(
      completed.features.chat,
    );
  });

  it("가장 느린 비식별 요청만 제한 수만큼 보존한다", () => {
    let now = 0;
    const aggregator = createProfilerAggregator({
      now: () => now,
      slowRequestThresholdMs: 1_000,
      slowRequestLimit: 2,
    });

    for (const durationMs of [1_100, 3_000, 2_000]) {
      aggregator.recordRequest({
        feature: "combat",
        operation: "POST /api/v2/dungeon/hunt",
        method: "POST",
        statusCode: 200,
        durationMs,
        responseBytes: durationMs,
        database: emptyDb(),
      });
    }

    now = 60_000;
    const completed = aggregator.rotate(runtime(5));

    expect(completed.slowRequests).toEqual([
      {
        feature: "combat",
        operation: "POST /api/v2/dungeon/hunt",
        method: "POST",
        statusCode: 200,
        durationMs: 3_000,
        responseBytes: 3_000,
        dbQueries: 0,
        dbDurationMs: 0,
      },
      {
        feature: "combat",
        operation: "POST /api/v2/dungeon/hunt",
        method: "POST",
        statusCode: 200,
        durationMs: 2_000,
        responseBytes: 2_000,
        dbQueries: 0,
        dbDurationMs: 0,
      },
    ]);
    expect(completed.slowRequests[0]).not.toHaveProperty("path");
    expect(completed.slowRequests[0]).not.toHaveProperty("url");
    expect(completed.slowRequests[0]).not.toHaveProperty("userId");
  });

  it("완료 구간 보존 한도를 지키고 현재 구간 스냅샷을 복사해 반환한다", () => {
    let now = 0;
    const aggregator = createProfilerAggregator({
      now: () => now,
      historyLimit: 2,
    });

    for (const minute of [1, 2, 3]) {
      aggregator.recordRequest({
        feature: "health",
        operation: "GET health",
        method: "GET",
        statusCode: 200,
        durationMs: minute * 10,
        responseBytes: 1,
        database: emptyDb(),
      });
      now = minute * 60_000;
      aggregator.rotate(runtime(minute));
    }

    const firstSnapshot = aggregator.snapshot();
    expect(firstSnapshot.history.map((window) => window.runtime.cpuPercent)).toEqual([
      2,
      3,
    ]);
    expect(firstSnapshot.current.features).toEqual({});
    expect(firstSnapshot.current.operations).toEqual({});

    firstSnapshot.history.pop();
    expect(aggregator.snapshot().history).toHaveLength(2);
  });
});
