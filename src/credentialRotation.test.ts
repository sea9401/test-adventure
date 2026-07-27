import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts/rotate-internal-secrets.mjs");
const createdDirectories: string[] = [];

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "credential-rotation-"));
  createdDirectories.push(directory);
  const envPath = join(directory, ".env.production.local");
  const original = [
    "AUTH_" + "SECRET=" + "a".repeat(64),
    "CRON_" + "SECRET=" + "b".repeat(64),
    "KEEP_ME=unchanged",
    "",
  ].join("\n");
  writeFileSync(envPath, original, { encoding: "utf8", mode: 0o644 });
  return { directory, envPath, original };
}

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("internal production secret rotation", () => {
  it("dry-run은 파일을 변경하지 않는다", () => {
    const { envPath, original } = fixture();
    const output = execFileSync(process.execPath, [SCRIPT, envPath], {
      encoding: "utf8",
    });

    expect(output).toContain("ROTATION READY");
    expect(readFileSync(envPath, "utf8")).toBe(original);
  });

  it("전체 세션 만료 확인 없이는 교체를 거부한다", () => {
    const { envPath, original } = fixture();

    expect(() =>
      execFileSync(process.execPath, [SCRIPT, envPath, "--apply"], {
        encoding: "utf8",
        stdio: "pipe",
      }),
    ).toThrow();
    expect(readFileSync(envPath, "utf8")).toBe(original);
  });

  it("두 내부 비밀을 원자적으로 교체하고 600 백업을 남긴다", () => {
    const { directory, envPath, original } = fixture();
    const output = execFileSync(
      process.execPath,
      [SCRIPT, envPath, "--apply", "--confirm-session-invalidation"],
      { encoding: "utf8" },
    );
    const updated = readFileSync(envPath, "utf8");
    const backups = readdirSync(directory).filter((name) =>
      name.includes(".rotation-backup-"),
    );

    expect(output).toContain("ROTATION APPLIED");
    expect(updated).not.toBe(original);
    expect(updated).toMatch(/^AUTH_SECRET=[A-Za-z0-9_-]{64}$/m);
    expect(updated).toMatch(/^CRON_SECRET=[A-Za-z0-9_-]{64}$/m);
    expect(updated).toContain("KEEP_ME=unchanged");
    expect(statSync(envPath).mode & 0o777).toBe(0o600);
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(directory, backups[0]), "utf8")).toBe(original);
    expect(statSync(join(directory, backups[0])).mode & 0o777).toBe(0o600);
  });
});
