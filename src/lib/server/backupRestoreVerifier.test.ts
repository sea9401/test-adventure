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
  const directory = mkdtempSync(join(tmpdir(), "backup-restore-verifier-"));
  temporaryDirectories.push(directory);
  return directory;
}

function executable(path: string, body: string) {
  writeFileSync(path, `#!/usr/bin/env bash\n${body}`);
  chmodSync(path, 0o755);
}

function runVerifier(validationResult: string, dropStatus = 0) {
  const root = temporaryDirectory();
  const binDirectory = join(root, "bin");
  const commandLog = join(root, "commands.log");
  const backupPath = join(root, "auto_test.sql.gz");
  mkdirSync(binDirectory);
  writeFileSync(backupPath, "fake compressed backup");

  executable(
    join(binDirectory, "createdb"),
    'printf "createdb %s\\n" "$*" >> "$RESTORE_TEST_COMMAND_LOG"\n',
  );
  executable(
    join(binDirectory, "dropdb"),
    `printf "dropdb %s\\n" "$*" >> "$RESTORE_TEST_COMMAND_LOG"
exit ${dropStatus}
`,
  );
  executable(
    join(binDirectory, "gunzip"),
    'if [ "$1" = "-t" ]; then exit 0; fi\nprintf "%s\\n" "-- restored dump"\n',
  );
  executable(
    join(binDirectory, "psql"),
    `printf "psql %s\\n" "$*" >> "$RESTORE_TEST_COMMAND_LOG"
case " $* " in
  *" --command "*) printf '%s\\n' '${validationResult}' ;;
  *) cat >/dev/null ;;
esac
`,
  );

  const result = spawnSync(
    "bash",
    [join(process.cwd(), "deploy/verify-backup-restore.sh")],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH}`,
        RESTORE_TEST_DATABASE_URL:
          "postgresql://restore_user:password@db.example.invalid:5432/adventure",
        RESTORE_TEST_BACKUP_PATH: backupPath,
        RESTORE_TEST_DATABASE_NAME: "restore_verify_test",
        RESTORE_TEST_COMMAND_LOG: commandLog,
      },
    },
  );

  return {
    result,
    commands: existsSync(commandLog) ? readFileSync(commandLog, "utf8") : "",
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("database backup restore verifier", () => {
  it("임시 DB에 백업을 복원하고 핵심 스키마 검증 뒤 임시 DB를 제거한다", () => {
    const { result, commands } = runVerifier("12|1|1");

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("RESTORE VERIFY OK");
    expect(commands).toContain("createdb");
    expect(commands).toContain("psql postgresql://restore_user:password@db.example.invalid:5432/restore_verify_test");
    expect(commands).toContain("dropdb");
  });

  it("복원된 스키마 검증이 실패해도 임시 DB를 반드시 제거한다", () => {
    const { result, commands } = runVerifier("0|0|0");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("RESTORE VERIFY FAIL");
    expect(commands).toContain("createdb");
    expect(commands).toContain("dropdb");
  });

  it("임시 DB 제거가 실패하면 복원 검증 성공으로 보고하지 않는다", () => {
    const { result } = runVerifier("12|1|1", 17);

    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("RESTORE VERIFY OK");
    expect(result.stderr).toContain("임시 DB 자동 제거 실패");
  });
});
