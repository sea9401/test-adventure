#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  closeSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const ROTATED_KEYS = ["AUTH_SECRET", "CRON_SECRET"];
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmed = args.includes("--confirm-session-invalidation");
const positional = args.filter((argument) => !argument.startsWith("--"));

if (positional.length > 1) {
  console.error(
    "usage: node scripts/rotate-internal-secrets.mjs [env-file] [--apply --confirm-session-invalidation]",
  );
  process.exit(2);
}

const envPath = resolve(positional[0] ?? ".env.production.local");
const stats = lstatSync(envPath);
if (!stats.isFile() || stats.isSymbolicLink()) {
  console.error("ROTATION FAIL: env file must be a regular file, not a symlink");
  process.exit(1);
}

const original = readFileSync(envPath, "utf8");
for (const key of ROTATED_KEYS) {
  const definitions = original.match(new RegExp(`^${key}=.*$`, "gm")) ?? [];
  if (definitions.length !== 1) {
    console.error(
      `ROTATION FAIL: ${key} must have exactly one definition (found ${definitions.length})`,
    );
    process.exit(1);
  }
}

if (!apply) {
  console.log(
    `ROTATION READY: ${basename(envPath)} contains one definition for ${ROTATED_KEYS.join(", ")}`,
  );
  console.log(
    "DRY RUN: no values changed; apply requires --apply --confirm-session-invalidation",
  );
  process.exit(0);
}

if (!confirmed) {
  console.error(
    "ROTATION FAIL: --confirm-session-invalidation is required because AUTH_SECRET rotation signs out every session",
  );
  process.exit(2);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${envPath}.rotation-backup-${timestamp}`;
copyFileSync(envPath, backupPath, 0);
chmodSync(backupPath, 0o600);

let updated = original;
for (const key of ROTATED_KEYS) {
  const nextValue = randomBytes(48).toString("base64url");
  updated = updated.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${nextValue}`);
}

const temporaryPath = join(
  dirname(envPath),
  `.${basename(envPath)}.rotation-${process.pid}-${Date.now()}`,
);
const descriptor = openSync(temporaryPath, "wx", 0o600);
try {
  writeFileSync(descriptor, updated, { encoding: "utf8" });
} finally {
  closeSync(descriptor);
}
try {
  renameSync(temporaryPath, envPath);
} catch (error) {
  try {
    unlinkSync(temporaryPath);
  } catch {
    // The original error is more useful; the temporary file may already be gone.
  }
  throw error;
}
chmodSync(envPath, 0o600);

const verified = readFileSync(envPath, "utf8");
for (const key of ROTATED_KEYS) {
  const match = verified.match(new RegExp(`^${key}=([^\r\n]+)$`, "m"));
  if (!match || match[1].length < 64) {
    console.error(`ROTATION FAIL: post-write verification failed for ${key}`);
    process.exit(1);
  }
}

console.log(
  `ROTATION APPLIED: ${ROTATED_KEYS.join(", ")} replaced without printing values`,
);
console.log(`ROLLBACK BACKUP: ${backupPath}`);
