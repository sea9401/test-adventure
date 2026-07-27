import { describe, expect, it } from "vitest";
import { isProductionTarget, parseOkStatuses, percentile, summarizeRun } from "../../../scripts/load-test-lib.mjs";

describe("load test helpers", () => {
  it("calculates nearest-rank percentiles", () => {
    expect(percentile([50, 10, 40, 20, 30], 0.5)).toBe(30);
    expect(percentile([50, 10, 40, 20, 30], 0.95)).toBe(50);
    expect(percentile([], 0.95)).toBeNull();
  });

  it("accepts configured status codes and ranges", () => {
    const isOk = parseOkStatuses("200-299,429");
    expect(isOk(204)).toBe(true);
    expect(isOk(429)).toBe(true);
    expect(isOk(500)).toBe(false);
    expect(() => parseOkStatuses("299-200")).toThrow();
  });

  it("recognizes the production hosts", () => {
    expect(isProductionTarget("https://msmsge.com/api/health")).toBe(true);
    expect(isProductionTarget("https://www.msmsge.com/")).toBe(true);
    expect(isProductionTarget("http://127.0.0.1:3000/")).toBe(false);
    expect(isProductionTarget("https://staging.msmsge.com/")).toBe(false);
  });

  it("summarizes latency and failures", () => {
    const summary = summarizeRun({
      latencies: [10, 20, 30],
      statusCounts: new Map([[200, 2], [500, 1]]),
      networkErrors: 1,
      elapsedMs: 2_000,
      isOkStatus: parseOkStatuses("200-299"),
    });
    expect(summary).toMatchObject({ attempts: 4, failures: 2, errorRate: 0.5, requestsPerSecond: 2 });
    expect(summary.p95).toBe(30);
  });
});
