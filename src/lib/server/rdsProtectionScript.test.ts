import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function runWithFakeAws({ pending = false }: { pending?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "rds-protection-"));
  temporaryDirectories.push(root);
  const binDir = join(root, "bin");
  const modifyLog = join(root, "modify.log");
  mkdirSync(binDir);

  const fakeAws = join(binDir, "aws");
  writeFileSync(
    fakeAws,
    `#!/usr/bin/env bash
if [[ "$*" == *"PendingModifiedValues"* ]]; then
  printf '%s\n' "${pending ? '{\"DBInstanceClass\":\"db.t4g.small\"}' : '{}'}"
  exit 0
fi
if [[ "$*" == *"describe-db-instances"* ]]; then
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    available False False 1 True False False 0 100 'sun:18:00-sun:18:30' '2026-08-13T00:00:00+00:00'
  exit 0
fi
if [[ "$*" == *"modify-db-instance"* ]]; then
  printf '%s\n' "$*" > "$MODIFY_LOG"
  exit 0
fi
exit 70
`,
  );
  chmodSync(fakeAws, 0o755);

  const result = spawnSync(
    "bash",
    [join(process.cwd(), "infra/operations/harden-rds.sh"), "apply-safe"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        MODIFY_LOG: modifyLog,
      },
    },
  );

  return { result, modifyLog };
}

describe("RDS protection hardening script", () => {
  it("enables only deletion protection and a seven-day backup floor", () => {
    const { result, modifyLog } = runWithFakeAws();

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(modifyLog, "utf8")).toContain(
      "rds modify-db-instance --region ap-northeast-2 --db-instance-identifier adventure-rpg-db --no-apply-immediately --deletion-protection --backup-retention-period 7",
    );
  });

  it("refuses to mix protection changes with existing pending modifications", () => {
    const { result, modifyLog } = runWithFakeAws({ pending: true });

    expect(result.status).toBe(4);
    expect(result.stderr).toContain("pending modifications");
    expect(() => readFileSync(modifyLog, "utf8")).toThrow();
  });
});
