import {
  chmodSync,
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

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryRoot(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(root);
  return root;
}

describe("resource monitor installation", () => {
  it("EC2 감시는 2분, RDS 감시는 별도 5분 타이머로 설치한다", () => {
    const root = temporaryRoot("resource-monitor-install-");
    const binDir = join(root, "bin");
    const unitDir = join(root, "systemd");
    const commandLog = join(root, "privileged.log");
    mkdirSync(binDir);
    mkdirSync(unitDir);

    const fakePrivileged = join(binDir, "privileged");
    writeFileSync(
      fakePrivileged,
      `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PRIVILEGED_LOG"
if [ "$1" = install ]; then
  exec "$@"
fi
exit 0
`,
    );
    chmodSync(fakePrivileged, 0o755);

    const result = spawnSync(
      "bash",
      [join(process.cwd(), "deploy/install-resource-monitors.sh")],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PRIVILEGED_COMMAND: fakePrivileged,
          PRIVILEGED_LOG: commandLog,
          SYSTEMD_UNIT_DIR: unitDir,
        },
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(
      readFileSync(join(unitDir, "adventure-resource-monitor.timer"), "utf8"),
    ).toContain("OnUnitActiveSec=2min");
    expect(
      readFileSync(join(unitDir, "adventure-rds-memory-monitor.timer"), "utf8"),
    ).toContain("OnUnitActiveSec=5min");
    expect(
      readFileSync(join(unitDir, "adventure-rds-memory-monitor.service"), "utf8"),
    ).toContain("ExecStart=/usr/bin/node scripts/check-rds-memory.mjs");
    expect(readFileSync(commandLog, "utf8").trim().split("\n")).toEqual([
      `install -m 0644 deploy/adventure-resource-monitor.service ${unitDir}/adventure-resource-monitor.service`,
      `install -m 0644 deploy/adventure-resource-monitor.timer ${unitDir}/adventure-resource-monitor.timer`,
      `install -m 0644 deploy/adventure-rds-memory-monitor.service ${unitDir}/adventure-rds-memory-monitor.service`,
      `install -m 0644 deploy/adventure-rds-memory-monitor.timer ${unitDir}/adventure-rds-memory-monitor.timer`,
      "systemctl daemon-reload",
      "systemctl enable --now adventure-resource-monitor.timer",
      "systemctl enable --now adventure-rds-memory-monitor.timer",
    ]);
  });
});

describe("EC2 resource monitor execution", () => {
  it("공유 2분 실행에서는 RDS CloudWatch 조회를 호출하지 않는다", () => {
    const root = temporaryRoot("resource-monitor-run-");
    const binDir = join(root, "bin");
    const nodeLog = join(root, "node.log");
    mkdirSync(binDir);

    const fakeNode = join(binDir, "node");
    writeFileSync(
      fakeNode,
      `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$NODE_LOG"
exit 0
`,
    );
    chmodSync(fakeNode, 0o755);

    const result = spawnSync("bash", ["deploy/check-resources.sh"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
        NODE_LOG: nodeLog,
        RESOURCE_MONITOR_CPU_COUNT: "2",
        RESOURCE_MONITOR_LOAD_5: "0.1",
        RESOURCE_MONITOR_MEM_AVAILABLE_PCT: "80",
        RESOURCE_MONITOR_DISK_USED_PCT: "20",
        RESOURCE_MONITOR_STATE_PATH: join(root, "resource-state"),
      },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(nodeLog, "utf8").trim().split("\n")).toEqual([
      "scripts/ops-heartbeat.mjs check",
    ]);
  });
});
