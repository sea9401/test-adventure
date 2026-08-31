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
  const directory = mkdtempSync(join(tmpdir(), "cron-runner-"));
  temporaryDirectories.push(directory);
  return directory;
}

function executable(path: string, body: string) {
  writeFileSync(path, `#!/usr/bin/env bash\n${body}`);
  chmodSync(path, 0o755);
}

function runCron(httpStatus: number) {
  const root = temporaryDirectory();
  const binDirectory = join(root, "bin");
  const heartbeatDirectory = join(root, "heartbeats");
  mkdirSync(binDirectory);
  executable(
    join(binDirectory, "curl"),
    `response_file=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then shift; response_file="$1"; fi
  shift
done
[ -z "$response_file" ] || printf '{}' > "$response_file"
printf '${httpStatus}'
exit 0
`,
  );

  const result = spawnSync(
    "bash",
    [
      join(process.cwd(), "deploy/run-cron.sh"),
      "POST",
      "/api/v2/cron/marketplace-expire",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH}`,
        CRON_SECRET: "test-secret",
        OPS_ALERT_WEBHOOK_URL: "",
        OPS_HEARTBEAT_DIR: heartbeatDirectory,
        OPS_HEARTBEAT_NOW_MS: "1786590000000",
      },
    },
  );

  return {
    result,
    heartbeatPath: join(
      heartbeatDirectory,
      "cron_marketplace-expire.json",
    ),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("cron runner heartbeat", () => {
  it("성공한 정기 작업만 해당 작업의 heartbeat를 기록한다", () => {
    const { result, heartbeatPath } = runCron(204);

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(heartbeatPath, "utf8"))).toEqual({
      key: "cron:marketplace-expire",
      succeededAtMs: 1_786_590_000_000,
    });
  });

  it("실패한 정기 작업은 heartbeat를 갱신하지 않는다", () => {
    const { result, heartbeatPath } = runCron(500);

    expect(result.status).toBe(1);
    expect(existsSync(heartbeatPath)).toBe(false);
  });
});
