import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SYNC_SCRIPT = join(ROOT, "scripts/sync-production-env-from-ssm.mjs");
const temporaryDirectories: string[] = [];

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "production-ssm-env-"));
  temporaryDirectories.push(directory);
  const binDirectory = join(directory, "bin");
  mkdirSync(binDirectory);
  const fakeAws = join(binDirectory, "aws");
  writeFileSync(
    fakeAws,
    `#!/usr/bin/env node
if (process.env.FAKE_AWS_MODE === "fail") {
  process.stderr.write("simulated access denial\\n");
  process.exit(23);
}
process.stdout.write(JSON.stringify(process.env.FAKE_PARAMETER_VALUE));
`,
  );
  chmodSync(fakeAws, 0o700);
  return {
    directory,
    target: join(directory, "production.env"),
    path: `${binDirectory}:${process.env.PATH ?? ""}`,
  };
}

function runSync(
  target: string,
  path: string,
  value: string,
  mode = "success",
) {
  return spawnSync(process.execPath, [SYNC_SCRIPT, target], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: path,
      FAKE_AWS_MODE: mode,
      FAKE_PARAMETER_VALUE: value,
      PRODUCTION_ENV_SSM_PARAMETER: "/test/production/env",
      AWS_REGION: "ap-northeast-2",
    },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("production env SSM sync", () => {
  it("SecureString 내용을 값 출력 없이 600 파일로 원자 반영한다", () => {
    const { target, path } = fixture();
    const contents = [
      "AUTH_SECRET=SAFE_AUTH_PLACEHOLDER",
      "CRON_SECRET=SAFE_CRON_PLACEHOLDER",
      "",
    ].join("\n");

    const result = runSync(target, path, contents);

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(target, "utf8")).toBe(contents);
    expect(statSync(target).mode & 0o777).toBe(0o600);
    expect(`${result.stdout}${result.stderr}`).not.toContain(
      "SAFE_AUTH_PLACEHOLDER",
    );
    expect(result.stdout).toContain("values redacted");
  });

  it("AWS 조회 실패 시 기존 런타임 캐시를 변경하지 않는다", () => {
    const { target, path } = fixture();
    writeFileSync(target, "KEEP=SAFE_EXISTING_PLACEHOLDER\n", { mode: 0o600 });

    const result = runSync(target, path, "IGNORED=SAFE_PLACEHOLDER\n", "fail");

    expect(result.status).toBe(1);
    expect(readFileSync(target, "utf8")).toBe(
      "KEEP=SAFE_EXISTING_PLACEHOLDER\n",
    );
    expect(result.stderr).not.toContain("simulated access denial");
  });

  it("중복 키가 있는 파라미터를 거부하고 기존 파일을 보존한다", () => {
    const { target, path } = fixture();
    writeFileSync(target, "KEEP=SAFE_EXISTING_PLACEHOLDER\n", { mode: 0o600 });

    const result = runSync(
      target,
      path,
      "AUTH_SECRET=SAFE_ONE\nAUTH_SECRET=SAFE_TWO\n",
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("duplicate key AUTH_SECRET");
    expect(readFileSync(target, "utf8")).toBe(
      "KEEP=SAFE_EXISTING_PLACEHOLDER\n",
    );
  });

  it("운영 배포와 systemd가 단일 SSM 파라미터와 /run 캐시만 사용한다", () => {
    const workflow = readFileSync(
      join(ROOT, ".github/workflows/deploy.yml"),
      "utf8",
    );
    const service = readFileSync(
      join(ROOT, "deploy/adventure-rpg.service"),
      "utf8",
    );
    const readerPolicy = JSON.parse(
      readFileSync(
        join(ROOT, "deploy/aws/production-env-reader-policy.json"),
        "utf8",
      ),
    );

    for (const contents of [workflow, service]) {
      expect(contents).toContain("sync-production-env-from-ssm.mjs");
      expect(contents).toContain("/run/adventure-rpg/production.env");
      expect(contents).not.toContain(".env.production.local");
    }
    for (const duplicateSecret of [
      "secrets.TURNSTILE_SECRET_KEY",
      "secrets.HCAPTCHA_SECRET_KEY",
      "secrets.R2_SECRET_ACCESS_KEY",
      "secrets.REVIEW_LOGIN_PASSWORD",
    ]) {
      expect(workflow).not.toContain(duplicateSecret);
    }
    expect(readerPolicy.Statement).toEqual([
      {
        Sid: "ReadAdventureRpgProductionEnv",
        Effect: "Allow",
        Action: "ssm:GetParameter",
        Resource:
          "arn:aws:ssm:ap-northeast-2:983903215138:parameter/adventure-rpg/production/env",
      },
    ]);
  });
});
