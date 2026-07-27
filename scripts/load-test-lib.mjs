export function percentile(values, percentileValue) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function parseOkStatuses(value) {
  const matchers = value.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
    const range = part.match(/^(\d{3})-(\d{3})$/);
    if (range) {
      const min = Number(range[1]);
      const max = Number(range[2]);
      if (min > max) throw new Error(`잘못된 상태 코드 범위: ${part}`);
      return (status) => status >= min && status <= max;
    }
    if (/^\d{3}$/.test(part)) {
      const expected = Number(part);
      return (status) => status === expected;
    }
    throw new Error(`잘못된 상태 코드: ${part}`);
  });
  if (matchers.length === 0) throw new Error("--ok-status 값이 비어 있습니다");
  return (status) => matchers.some((matcher) => matcher(status));
}

export function isProductionTarget(target) {
  const hostname = new URL(target).hostname.toLowerCase();
  return hostname === "msmsge.com" || hostname === "www.msmsge.com";
}

export function summarizeRun({ latencies, statusCounts, networkErrors, elapsedMs, isOkStatus }) {
  const responseCount = [...statusCounts.values()].reduce((sum, count) => sum + count, 0);
  const badResponses = [...statusCounts.entries()]
    .filter(([status]) => !isOkStatus(status))
    .reduce((sum, [, count]) => sum + count, 0);
  const attempts = responseCount + networkErrors;
  const failures = badResponses + networkErrors;
  return {
    attempts,
    failures,
    errorRate: attempts === 0 ? 1 : failures / attempts,
    requestsPerSecond: elapsedMs <= 0 ? 0 : attempts / (elapsedMs / 1_000),
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
  };
}
