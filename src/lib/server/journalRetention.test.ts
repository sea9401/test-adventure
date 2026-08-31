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

describe("journal retention deployment helper", () => {
  it("journald 제한을 설치하고 재시작·회전·용량 정리를 순서대로 요청한다", () => {
    const root = mkdtempSync(join(tmpdir(), "journal-retention-"));
    temporaryDirectories.push(root);
    const binDir = join(root, "bin");
    const configDir = join(root, "journald.conf.d");
    const commandLog = join(root, "privileged.log");
    mkdirSync(binDir);

    const fakePrivileged = join(binDir, "privileged");
    writeFileSync(
      fakePrivileged,
      `#!/usr/bin/env bash
printf '%s' "$1" >> "$PRIVILEGED_LOG"
shift
printf ' %s' "$@" >> "$PRIVILEGED_LOG"
printf '\n' >> "$PRIVILEGED_LOG"
case "$1" in
  -d|-m) exec install "$@" ;;
esac
exit 0
`,
    );
    chmodSync(fakePrivileged, 0o755);

    const result = spawnSync(
      "bash",
      [join(process.cwd(), "deploy/configure-log-retention.sh")],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          JOURNALD_CONFIG_DIR: configDir,
          PRIVILEGED_COMMAND: fakePrivileged,
          PRIVILEGED_LOG: commandLog,
        },
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(configDir, "adventure-rpg.conf"), "utf8")).toBe(
      [
        "[Journal]",
        "SystemMaxUse=512M",
        "SystemKeepFree=3G",
        "MaxRetentionSec=14day",
        "",
      ].join("\n"),
    );
    expect(readFileSync(commandLog, "utf8").trim().split("\n")).toEqual([
      `install -d -m 0755 ${configDir}`,
      `install -m 0644 deploy/adventure-journald.conf ${configDir}/adventure-rpg.conf`,
      "systemctl restart systemd-journald",
      "journalctl --rotate",
      "journalctl --vacuum-size=512M",
    ]);
  });
});
