#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  lstatSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";

const DEFAULT_PARAMETER = "/adventure-rpg/production/env";
const DEFAULT_REGION = "ap-northeast-2";
const MAX_STANDARD_PARAMETER_BYTES = 4 * 1024;

const targetPath = resolve(
  process.argv[2] ?? "/run/adventure-rpg/production.env",
);
const parameterName =
  process.env.PRODUCTION_ENV_SSM_PARAMETER ?? DEFAULT_PARAMETER;
const region = process.env.AWS_REGION ?? DEFAULT_REGION;

if (!/^\/[A-Za-z0-9_.\/-]+$/.test(parameterName)) {
  console.error("SSM ENV SYNC FAIL: invalid parameter name");
  process.exit(2);
}
if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region)) {
  console.error("SSM ENV SYNC FAIL: invalid AWS region");
  process.exit(2);
}

try {
  const current = lstatSync(targetPath, { throwIfNoEntry: false });
  if (current && (!current.isFile() || current.isSymbolicLink())) {
    throw new Error("target must be a regular file, not a symlink");
  }
  const parent = lstatSync(dirname(targetPath));
  if (!parent.isDirectory() || parent.isSymbolicLink()) {
    throw new Error("target parent must be a real directory");
  }
} catch (error) {
  console.error(
    `SSM ENV SYNC FAIL: ${error instanceof Error ? error.message : "unsafe target"}`,
  );
  process.exit(1);
}

const result = spawnSync(
  "aws",
  [
    "ssm",
    "get-parameter",
    "--region",
    region,
    "--name",
    parameterName,
    "--with-decryption",
    "--query",
    "Parameter.Value",
    "--output",
    "json",
    "--no-cli-pager",
  ],
  {
    encoding: "utf8",
    env: { ...process.env, AWS_PAGER: "" },
    maxBuffer: 32 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

if (result.error || result.status !== 0) {
  const exitDetail = result.error
    ? result.error.code ?? result.error.name
    : `exit ${result.status ?? "unknown"}`;
  console.error(
    `SSM ENV SYNC FAIL: aws ssm get-parameter failed (${exitDetail})`,
  );
  process.exit(1);
}

let contents;
try {
  contents = JSON.parse(result.stdout);
} catch {
  console.error("SSM ENV SYNC FAIL: AWS CLI returned invalid JSON");
  process.exit(1);
}

if (typeof contents !== "string") {
  console.error("SSM ENV SYNC FAIL: parameter value must be a string");
  process.exit(1);
}

const bytes = Buffer.byteLength(contents, "utf8");
if (bytes === 0 || bytes > MAX_STANDARD_PARAMETER_BYTES) {
  console.error(
    `SSM ENV SYNC FAIL: parameter must be 1-${MAX_STANDARD_PARAMETER_BYTES} bytes`,
  );
  process.exit(1);
}
if (contents.includes("\0")) {
  console.error("SSM ENV SYNC FAIL: parameter contains a NUL byte");
  process.exit(1);
}

const keys = new Set();
for (const [index, line] of contents.split(/\r?\n/).entries()) {
  if (line === "" || /^\s*#/.test(line)) continue;
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
  if (!match) {
    console.error(`SSM ENV SYNC FAIL: malformed env line ${index + 1}`);
    process.exit(1);
  }
  if (keys.has(match[1])) {
    console.error(`SSM ENV SYNC FAIL: duplicate key ${match[1]}`);
    process.exit(1);
  }
  keys.add(match[1]);
}

const temporaryPath = resolve(
  dirname(targetPath),
  `.${basename(targetPath)}.ssm-${process.pid}-${Date.now()}`,
);
try {
  const descriptor = openSync(temporaryPath, "wx", 0o600);
  try {
    writeFileSync(descriptor, contents, { encoding: "utf8" });
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporaryPath, targetPath);
} catch (error) {
  try {
    unlinkSync(temporaryPath);
  } catch {
    // Preserve the rename error; the temporary file may already be gone.
  }
  throw error;
}
chmodSync(targetPath, 0o600);

console.log(
  `SSM ENV SYNC OK: ${parameterName} -> ${targetPath} (${keys.size} keys, values redacted)`,
);
