import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MIB = 1024 * 1024;
let testDir = "";
let statePath = "";

function runMonitor(freeableMemoryBytes: number, nowMs: number) {
  return spawnSync(process.execPath, ["scripts/check-rds-memory.mjs"], {
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
});
