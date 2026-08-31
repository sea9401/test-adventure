import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decideRdsMonitorAction } from "../../../scripts/rds-memory-monitor-lib.mjs";

const MIB = 1024 * 1024;
let testDir = "";
let statePath = "";

function runMonitor(freeableMemoryBytes: number | string, nowMs: number) {
  return spawnSync("bash", ["-c", 'node "$1"', "rds-monitor-test", "scripts/check-rds-memory.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      RDS_MONITOR_FREEABLE_MEMORY_BYTES: String(freeableMemoryBytes),
      RDS_MONITOR_NOW_MS: String(nowMs),
      RDS_MEMORY_MONITOR_STATE_PATH: statePath,
      RDS_FREEABLE_MEMORY_MIN_MIB: "192",
      RDS_MEMORY_ALERT_COOLDOWN_SECONDS: "1800",
      OPS_ALERT_WEBHOOK_URL: "",
      RESOURCE_MONITOR_ENV_PATH: join(testDir, "missing.env"),
    },
  });
}

describe("RDS freeable memory monitor", () => {
  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "rds-memory-monitor-"));
    statePath = join(testDir, "state.json");
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("192 MiB 아래로 내려가면 최초 경고 상태를 기록한다", () => {
    const result = runMonitor(128 * MIB, 10_000);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("RDS MEMORY WARN");
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({
      status: "alert",
      alertedAtMs: 10_000,
    });
  });

  it("같은 경고가 30분 안에 반복되면 알림 시각을 갱신하지 않는다", () => {
    runMonitor(128 * MIB, 10_000);
    const result = runMonitor(120 * MIB, 70_000);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("RDS MEMORY ALERT SUPPRESSED");
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({
      status: "alert",
      alertedAtMs: 10_000,
    });
  });

  it("경고 뒤 메모리가 회복되면 정상 상태와 회복 메시지를 남긴다", () => {
    runMonitor(128 * MIB, 10_000);
    const result = runMonitor(320 * MIB, 80_000);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("RDS MEMORY RECOVERED");
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({
      status: "ok",
      alertedAtMs: 0,
    });
  });

  it("잘못된 지표 입력은 정상으로 숨기지 않고 감시 장애 상태를 기록한다", () => {
    const result = runMonitor("invalid", 90_000);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("RDS MEMORY MONITOR WARN");
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({
      status: "monitor_error",
      alertedAtMs: 90_000,
    });
  });
});

describe("RDS memory monitor decisions", () => {
  const mib = 1024 * 1024;

  it("CloudWatch 조회 실패를 감시 장애 상태로 전환하고 즉시 알린다", () => {
    expect(
      decideRdsMonitorAction({
        reading: { kind: "error", detail: "AccessDenied" },
        previous: { status: "ok", alertedAtMs: 0 },
        thresholdBytes: 192 * mib,
        nowMs: 10_000,
        cooldownMs: 1_000,
      }),
    ).toEqual({
      kind: "monitor_error",
      notify: true,
      notifyRecovery: false,
      detail: "AccessDenied",
      nextState: { status: "monitor_error", alertedAtMs: 10_000 },
    });
  });

  it("같은 감시 장애는 cooldown 동안 억제하고 시간이 지나면 재알린다", () => {
    const input = {
      reading: { kind: "error" as const, detail: "No datapoints" },
      previous: { status: "monitor_error", alertedAtMs: 10_000 },
      thresholdBytes: 192 * mib,
      cooldownMs: 30_000,
    };

    expect(decideRdsMonitorAction({ ...input, nowMs: 20_000 }).notify).toBe(false);
    expect(decideRdsMonitorAction({ ...input, nowMs: 40_001 }).notify).toBe(true);
  });

  it("감시 장애 뒤 정상 지표를 다시 읽으면 감시 복구를 알린다", () => {
    expect(
      decideRdsMonitorAction({
        reading: { kind: "value", bytes: 512 * mib },
        previous: { status: "monitor_error", alertedAtMs: 10_000 },
        thresholdBytes: 192 * mib,
        nowMs: 20_000,
        cooldownMs: 30_000,
      }),
    ).toEqual({
      kind: "ok",
      notify: false,
      notifyRecovery: true,
      freeableBytes: 512 * mib,
      nextState: { status: "ok", alertedAtMs: 0 },
    });
  });

  it("임계치 미만 지표는 기존 메모리 부족 경고 상태를 유지한다", () => {
    expect(
      decideRdsMonitorAction({
        reading: { kind: "value", bytes: 128 * mib },
        previous: { status: "ok", alertedAtMs: 0 },
        thresholdBytes: 192 * mib,
        nowMs: 20_000,
        cooldownMs: 30_000,
      }),
    ).toEqual({
      kind: "low_memory",
      notify: true,
      notifyRecovery: false,
      freeableBytes: 128 * mib,
      nextState: { status: "alert", alertedAtMs: 20_000 },
    });
  });
});
