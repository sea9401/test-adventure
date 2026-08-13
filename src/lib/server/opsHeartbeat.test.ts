import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  decideHeartbeatAlert,
  evaluateHeartbeats,
  readHeartbeatRecords,
  recordHeartbeat,
} from "../../../scripts/ops-heartbeat.mjs";

const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "ops-heartbeat-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("operations heartbeat", () => {
  const rules = [
    {
      key: "cron:marketplace-expire",
      label: "만료 매물 정리",
      maxAgeSeconds: 900,
    },
    {
      key: "backup:database",
      label: "운영 DB 백업",
      maxAgeSeconds: 30 * 60 * 60,
      missingGraceSeconds: 30 * 60 * 60,
    },
  ];

  it("초기 유예가 끝난 뒤 기록이 없는 중요 작업을 누락으로 판단한다", () => {
    const nowMs = 2_000_000;

    expect(
      evaluateHeartbeats(rules, {}, nowMs, nowMs - 20 * 60_000, 10 * 60),
    ).toEqual([
      expect.objectContaining({
        key: "cron:marketplace-expire",
        reason: "missing",
      }),
    ]);
  });

  it("초기 유예 중인 누락과 허용 시간 안의 기록은 정상으로 둔다", () => {
    const nowMs = 2_000_000;

    expect(
      evaluateHeartbeats(
        rules,
        { "cron:marketplace-expire": nowMs - 14 * 60_000 },
        nowMs,
        nowMs - 5 * 60_000,
        10 * 60,
      ),
    ).toEqual([]);
  });

  it("허용 시간을 넘긴 성공 기록을 정체로 판단한다", () => {
    const nowMs = 40 * 60 * 60_000;

    expect(
      evaluateHeartbeats(
        rules,
        {
          "cron:marketplace-expire": nowMs - 16 * 60_000,
          "backup:database": nowMs - 31 * 60 * 60_000,
        },
        nowMs,
        0,
        0,
      ),
    ).toEqual([
      expect.objectContaining({
        key: "cron:marketplace-expire",
        reason: "stale",
        ageSeconds: 960,
      }),
      expect.objectContaining({
        key: "backup:database",
        reason: "stale",
        ageSeconds: 31 * 60 * 60,
      }),
    ]);
  });

  it("성공 heartbeat를 원자적으로 기록하고 다시 읽는다", () => {
    const directory = temporaryDirectory();
    const atMs = Date.UTC(2026, 7, 13, 4, 5, 6);

    recordHeartbeat("cron:ops-daily-report", atMs, directory);

    expect(readHeartbeatRecords(directory)).toEqual({
      "cron:ops-daily-report": atMs,
    });
    expect(
      JSON.parse(readFileSync(join(directory, "cron_ops-daily-report.json"), "utf8")),
    ).toEqual({ key: "cron:ops-daily-report", succeededAtMs: atMs });
  });

  it("문제 구성이 바뀌거나 재알림 시간이 지나야 다시 알린다", () => {
    const issue = {
      key: "backup:database",
      label: "운영 DB 백업",
      reason: "stale" as const,
      ageSeconds: 200_000,
      maxAgeSeconds: 108_000,
    };
    const first = decideHeartbeatAlert([issue], null, 1_000_000, 1_800_000);
    const suppressed = decideHeartbeatAlert(
      [issue],
      first.nextState,
      1_100_000,
      1_800_000,
    );
    const reminder = decideHeartbeatAlert(
      [issue],
      first.nextState,
      3_000_001,
      1_800_000,
    );

    expect(first.notify).toBe(true);
    expect(suppressed.notify).toBe(false);
    expect(reminder.notify).toBe(true);
    expect(
      decideHeartbeatAlert([], first.nextState, 1_100_000, 1_800_000),
    ).toMatchObject({ notifyRecovery: true, nextState: { key: "" } });
  });
});
