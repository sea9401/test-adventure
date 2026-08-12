import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

function temporaryDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("offsite backup pruning", () => {
  it("S3 객체가 확인된 자동 백업만 로컬에서 제거한다", () => {
    const root = temporaryDirectory("backup-prune-");
    const backupDir = join(root, "backups");
    const binDir = join(root, "bin");
    const awsLog = join(root, "aws.log");
    mkdirSync(backupDir);
    mkdirSync(binDir);

    const confirmed = join(backupDir, "auto_2026-08-11_170002.sql.gz");
    const unconfirmed = join(backupDir, "auto_2026-08-12_170002.sql.gz");
    const manual = join(backupDir, "prebeta_2026-08-01.sql.gz");
    writeFileSync(confirmed, "confirmed");
    writeFileSync(unconfirmed, "unconfirmed");
    writeFileSync(manual, "manual");

    const fakeAws = join(binDir, "aws");
    writeFileSync(
      fakeAws,
      `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$AWS_LOG"
case "$*" in
  *auto_2026-08-11_170002.sql.gz*) exit 0 ;;
  *) exit 1 ;;
esac
`,
    );
    chmodSync(fakeAws, 0o755);

    const result = spawnSync(
      "bash",
      [join(process.cwd(), "deploy/prune-offsite-backups.sh")],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          AWS_LOG: awsLog,
          BACKUP_DIR: backupDir,
          BACKUP_S3_URI: "s3://test-bucket/prod/adventure-rpg",
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(existsSync(confirmed)).toBe(false);
    expect(existsSync(unconfirmed)).toBe(true);
    expect(existsSync(manual)).toBe(true);
  });

  it("잘못된 S3 URI에서는 어떤 백업도 삭제하지 않는다", () => {
    const root = temporaryDirectory("backup-prune-invalid-");
    const backupDir = join(root, "backups");
    mkdirSync(backupDir);
    const backup = join(backupDir, "auto_2026-08-11_170002.sql.gz");
    writeFileSync(backup, "keep");

    const result = spawnSync(
      "bash",
      [join(process.cwd(), "deploy/prune-offsite-backups.sh")],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          BACKUP_DIR: backupDir,
          BACKUP_S3_URI: "https://not-s3.example/backups",
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(existsSync(backup)).toBe(true);
  });

  it("DB 덤프를 시작하기 전에 S3로 복제된 이전 자동 백업을 정리한다", () => {
    const root = temporaryDirectory("backup-preflight-");
    const backupDir = join(root, "backups");
    const binDir = join(root, "bin");
    const envPath = join(root, "production.env");
    const caPath = join(root, "rds-ca.pem");
    const previous = join(backupDir, "auto_2026-08-12_170002.sql.gz");
    mkdirSync(backupDir);
    mkdirSync(binDir);
    writeFileSync(previous, "previous");
    writeFileSync(caPath, "test-ca");
    writeFileSync(
      envPath,
      [
        'DATABASE_URL="postgres://example.invalid/test"',
        `DATABASE_CA_CERT_PATH="${caPath}"`,
        'BACKUP_S3_URI="s3://test-bucket/prod/adventure-rpg"',
      ].join("\n"),
    );

    const fakePgDump = join(binDir, "pg_dump");
    writeFileSync(
      fakePgDump,
      `#!/usr/bin/env bash
if [ -e "$EXPECTED_PRUNED" ]; then
  echo "previous backup still exists" >&2
  exit 44
fi
printf '%s\\n' '-- PostgreSQL database dump complete'
`,
    );
    chmodSync(fakePgDump, 0o755);
    const fakeAws = join(binDir, "aws");
    writeFileSync(fakeAws, "#!/usr/bin/env bash\nexit 0\n");
    chmodSync(fakeAws, 0o755);

    const result = spawnSync("bash", [join(process.cwd(), "deploy/backup-db.sh")], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        PRODUCTION_ENV_PATH: envPath,
        BACKUP_DIR: backupDir,
        EXPECTED_PRUNED: previous,
      },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(previous)).toBe(false);
    expect(
      readdirSync(backupDir).filter((name) => name.startsWith("auto_")),
    ).toHaveLength(1);
  });
});
