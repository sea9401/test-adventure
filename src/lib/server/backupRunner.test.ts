import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "backup-runner-"));
  temporaryDirectories.push(directory);
  return directory;
}

function executable(path: string, body: string) {
  writeFileSync(path, `#!/usr/bin/env bash\n${body}`);
  chmodSync(path, 0o755);
}

function runWrapper(
  root: string,
  backupBody: string,
  options: { webhookUrl?: string; withFakeCurl?: boolean } = {},
) {
  const binDir = join(root, "bin");
  const backupScript = join(root, "backup.sh");
  const backupLog = join(root, "backup.log");
  const curlPayload = join(root, "curl-payload.json");
  const curlCalled = join(root, "curl-called");
  const heartbeatDirectory = join(root, "heartbeats");
  mkdirSync(binDir);
  executable(backupScript, backupBody);

  if (options.withFakeCurl) {
    executable(
      join(binDir, "curl"),
      `touch "$CURL_CALLED"
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--data" ]; then
    shift
    printf '%s' "$1" > "$CURL_PAYLOAD"
    exit 0
  fi
  shift
done
exit 91
`,
    );
  }

  const result = spawnSync(
    "bash",
    [join(process.cwd(), "deploy/run-backup.sh")],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        BACKUP_SCRIPT_PATH: backupScript,
        BACKUP_LOG_PATH: backupLog,
        PRODUCTION_ENV_PATH: join(root, "missing-production.env"),
        OPS_ALERT_WEBHOOK_URL: options.webhookUrl ?? "",
        CURL_PAYLOAD: curlPayload,
        CURL_CALLED: curlCalled,
        OPS_HEARTBEAT_DIR: heartbeatDirectory,
        OPS_HEARTBEAT_NOW_MS: "1786590000000",
      },
    },
  );

  return { result, backupLog, curlPayload, curlCalled, heartbeatDirectory };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("database backup runner", () => {
  it("성공한 백업은 로그만 남기고 운영 웹훅을 호출하지 않는다", () => {
    const root = temporaryDirectory();
    const { result, backupLog, curlCalled, heartbeatDirectory } = runWrapper(
      root,
      'echo "backup completed"\nexit 0\n',
      { webhookUrl: "https://ops.example.invalid/hook", withFakeCurl: true },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(backupLog, "utf8")).toContain("backup completed");
    expect(existsSync(curlCalled)).toBe(false);
    expect(
      JSON.parse(
        readFileSync(join(heartbeatDirectory, "backup_database.json"), "utf8"),
      ),
    ).toEqual({ key: "backup:database", succeededAtMs: 1_786_590_000_000 });
  });

  it("실패한 백업은 원래 종료 코드를 보존하고 운영 알림을 한 번 보낸다", () => {
    const root = temporaryDirectory();
    const { result, backupLog, curlPayload, curlCalled, heartbeatDirectory } = runWrapper(
      root,
      'echo "pg_dump failed" >&2\nexit 23\n',
      { webhookUrl: "https://ops.example.invalid/hook", withFakeCurl: true },
    );

    expect(result.status).toBe(23);
    expect(readFileSync(backupLog, "utf8")).toContain("pg_dump failed");
    expect(existsSync(curlCalled)).toBe(true);
    const payload = JSON.parse(readFileSync(curlPayload, "utf8"));
    expect(payload.content).toContain("데이터베이스 백업 실패");
    expect(payload.detail).toEqual({ source: "db-backup", exitStatus: 23 });
    expect(existsSync(join(heartbeatDirectory, "backup_database.json"))).toBe(false);
  });

  it("웹훅이 없어도 백업 실패를 로그에 남기고 원래 종료 코드를 반환한다", () => {
    const root = temporaryDirectory();
    const { result, backupLog } = runWrapper(
      root,
      'echo "backup verification failed" >&2\nexit 41\n',
    );

    expect(result.status).toBe(41);
    const log = readFileSync(backupLog, "utf8");
    expect(log).toContain("backup verification failed");
    expect(log).toContain("OPS_ALERT_WEBHOOK_URL 미설정");
  });
});
