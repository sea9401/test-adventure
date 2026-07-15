import {
  chmodSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";

const envPath = process.argv[2] ?? ".env.production.local";
const required = {
  TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY?.trim(),
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY?.trim(),
  TURNSTILE_EXPECTED_HOSTNAMES:
    process.env.TURNSTILE_EXPECTED_HOSTNAMES?.trim(),
};

for (const [key, value] of Object.entries(required)) {
  if (!value) {
    console.error(`✗ deployment secret missing: ${key}`);
    process.exit(1);
  }
  if (/[\r\n\0]/.test(value)) {
    console.error(`✗ deployment secret contains invalid characters: ${key}`);
    process.exit(1);
  }
}

const original = readFileSync(envPath, "utf8");
let lines = original.split(/\r?\n/);

for (const [key, value] of Object.entries(required)) {
  let replaced = false;
  const rendered = `${key}=${JSON.stringify(value)}`;
  lines = lines.flatMap((line) => {
    if (!line.startsWith(`${key}=`)) return [line];
    if (replaced) return [];
    replaced = true;
    return [rendered];
  });
  if (!replaced) {
    const insertAt = lines.at(-1) === "" ? lines.length - 1 : lines.length;
    lines.splice(insertAt, 0, rendered);
  }
}

const next = `${lines.join("\n").replace(/\n*$/, "")}\n`;
const mode = statSync(envPath).mode & 0o777;
const temporaryPath = `${envPath}.turnstile.tmp`;
writeFileSync(temporaryPath, next, { encoding: "utf8", mode });
chmodSync(temporaryPath, mode);
renameSync(temporaryPath, envPath);

console.log("✓ production Turnstile environment synchronized");
