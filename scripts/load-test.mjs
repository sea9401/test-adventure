#!/usr/bin/env node
import { isProductionTarget, parseOkStatuses, summarizeRun } from "./load-test-lib.mjs";

const HELP = `안전 부하 테스트

사용:
  npm run load-test -- [옵션]

옵션:
  --url URL                 기준 URL (기본: http://127.0.0.1:3000)
  --path PATH               요청 경로 (기본: /api/health)
  --method METHOD           HTTP 메서드 (기본: GET)
  --duration SECONDS        실행 시간 1~300초 (기본: 10)
  --concurrency COUNT       동시 요청 1~200개 (기본: 5)
  --rate RPS                전체 초당 요청 1~1000회 (기본: 10)
  --timeout MS              요청 타임아웃 (기본: 5000)
  --ok-status LIST          정상 상태 코드/범위 (기본: 200-399)
  --max-error-rate RATIO    허용 실패 비율 0~1 (기본: 0.01)
  --max-p95 MS              허용 p95 지연 (기본: 1000)
  --allow-production        msmsge.com 대상 보호 해제(운영 부하 테스트에는 사용 금지)

환경변수:
  LOAD_TEST_COOKIE          인증 쿠키
  LOAD_TEST_BODY            POST 등에 보낼 JSON 본문
`;

function numberOption(name, value, { min, max, integer = false }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    throw new Error(`${name} 값은 ${min}~${max}${integer ? " 정수" : ""}여야 합니다`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    url: "http://127.0.0.1:3000",
    path: "/api/health",
    method: "GET",
    duration: 10,
    concurrency: 5,
    rate: 10,
    timeout: 5_000,
    okStatus: "200-399",
    maxErrorRate: 0.01,
    maxP95: 1_000,
    allowProduction: false,
  };
  const take = (index, name) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} 값이 없습니다`);
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--allow-production") {
      options.allowProduction = true;
      continue;
    }
    const value = take(index, arg);
    index += 1;
    switch (arg) {
      case "--url": options.url = value; break;
      case "--path": options.path = value; break;
      case "--method": options.method = value.toUpperCase(); break;
      case "--duration": options.duration = numberOption(arg, value, { min: 1, max: 300 }); break;
      case "--concurrency": options.concurrency = numberOption(arg, value, { min: 1, max: 200, integer: true }); break;
      case "--rate": options.rate = numberOption(arg, value, { min: 1, max: 1_000 }); break;
      case "--timeout": options.timeout = numberOption(arg, value, { min: 100, max: 120_000, integer: true }); break;
      case "--ok-status": options.okStatus = value; break;
      case "--max-error-rate": options.maxErrorRate = numberOption(arg, value, { min: 0, max: 1 }); break;
      case "--max-p95": options.maxP95 = numberOption(arg, value, { min: 1, max: 120_000 }); break;
      default: throw new Error(`알 수 없는 옵션: ${arg}`);
    }
  }
  if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(options.method)) throw new Error("지원하지 않는 HTTP 메서드입니다");
  return options;
}

function wait(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const target = new URL(options.path, options.url).toString();
  if (isProductionTarget(target) && !options.allowProduction) {
    throw new Error("운영 도메인은 기본 차단됩니다. 로컬 또는 스테이징 URL을 사용하세요");
  }
  const isOkStatus = parseOkStatuses(options.okStatus);
  const cookie = process.env.LOAD_TEST_COOKIE ?? "";
  const body = process.env.LOAD_TEST_BODY;
  if (body && /^(GET|HEAD)$/.test(options.method)) throw new Error("GET 요청에는 LOAD_TEST_BODY를 사용할 수 없습니다");
  if (cookie.includes("\r") || cookie.includes("\n")) throw new Error("LOAD_TEST_COOKIE에 줄바꿈을 사용할 수 없습니다");

  const headers = { accept: "application/json" };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";

  console.log(`target=${target}`);
  console.log(`method=${options.method} duration=${options.duration}s concurrency=${options.concurrency} rate=${options.rate}r/s timeout=${options.timeout}ms`);
  console.log(`ok-status=${options.okStatus} max-error-rate=${options.maxErrorRate} max-p95=${options.maxP95}ms`);

  const startedAt = performance.now();
  const deadline = startedAt + options.duration * 1_000;
  const interval = 1_000 / options.rate;
  let nextSequence = 0;
  let networkErrors = 0;
  const latencies = [];
  const statusCounts = new Map();

  async function worker() {
    while (true) {
      const scheduledAt = startedAt + nextSequence * interval;
      nextSequence += 1;
      if (scheduledAt >= deadline) return;
      await wait(scheduledAt - performance.now());
      if (performance.now() >= deadline) return;

      const requestStartedAt = performance.now();
      try {
        const response = await fetch(target, {
          method: options.method,
          headers,
          body,
          cache: "no-store",
          redirect: "manual",
          signal: AbortSignal.timeout(options.timeout),
        });
        await response.arrayBuffer();
        const latency = performance.now() - requestStartedAt;
        latencies.push(latency);
        statusCounts.set(response.status, (statusCounts.get(response.status) ?? 0) + 1);
      } catch {
        networkErrors += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => worker()));
  const elapsedMs = performance.now() - startedAt;
  const summary = summarizeRun({ latencies, statusCounts, networkErrors, elapsedMs, isOkStatus });
  const statusText = [...statusCounts.entries()].sort(([a], [b]) => a - b).map(([status, count]) => `${status}:${count}`).join(", ") || "none";

  console.log(`attempts=${summary.attempts} throughput=${summary.requestsPerSecond.toFixed(1)}r/s statuses=${statusText} network-errors=${networkErrors}`);
  console.log(`latency-ms p50=${summary.p50?.toFixed(1) ?? "n/a"} p95=${summary.p95?.toFixed(1) ?? "n/a"} p99=${summary.p99?.toFixed(1) ?? "n/a"}`);
  console.log(`failures=${summary.failures} error-rate=${(summary.errorRate * 100).toFixed(2)}%`);

  if (summary.errorRate > options.maxErrorRate) throw new Error("허용 실패 비율을 초과했습니다");
  if (summary.p95 === null || summary.p95 > options.maxP95) throw new Error("p95 지연 기준을 초과했습니다");
}

main().catch((error) => {
  console.error(`LOAD TEST FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
