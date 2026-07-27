#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const SENSITIVE_ENV_KEYS = [
  "AUTH_SECRET",
  "AUTH_KAKAO_SECRET",
  "DATABASE_URL",
  "CRON_SECRET",
  "OPS_ALERT_WEBHOOK_URL",
  "OPS_ALERT_ABUSE_WEBHOOK_URL",
  "OPS_ALERT_DEPLOY_WEBHOOK_URL",
  "OPS_ALERT_ECONOMY_WEBHOOK_URL",
  "OPS_ALERT_REWARD_WEBHOOK_URL",
  "R2_SECRET_ACCESS_KEY",
  "TURNSTILE_SECRET_KEY",
  "HCAPTCHA_SECRET_KEY",
  "EC2_SSH_KEY",
  "REVIEW_LOGIN_PASSWORD",
];

const providerRules = [
  {
    name: "private-key",
    pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/g,
  },
  { name: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    name: "github-token",
    pattern:
      /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "stripe-live-secret", pattern: /\bsk_live_[A-Za-z0-9]{16,}\b/g },
  { name: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
];

const discordWebhook =
  /https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9._-]+/gi;
const databaseUrl =
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^:\s/@]+:([^@\s/]+)@([^\s/:?#]+)/gi;
const sensitiveAssignment = new RegExp(
  String.raw`^[ \t]*(?:export[ \t]+)?(${SENSITIVE_ENV_KEYS.join("|")})[ \t]*=[ \t]*([^\r\n]*)$`,
  "gim",
);

function normalizeValue(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('"') && !trimmed.startsWith("'")) {
    return trimmed.replace(/\s+#.*$/, "").trim();
  }
  const quote = trimmed[0];
  const closing = trimmed.indexOf(quote, 1);
  return closing === -1 ? trimmed.slice(1) : trimmed.slice(1, closing);
}

function isPlaceholder(raw) {
  const value = normalizeValue(raw);
  if (!value) return true;
  const lower = value.toLowerCase();
  return (
    value.startsWith("$(") ||
    value.startsWith("${") ||
    value.startsWith("<") ||
    lower.includes("example") ||
    lower.includes("placeholder") ||
    lower.includes("changeme") ||
    lower.includes("change-me") ||
    lower.includes("replace_me") ||
    lower.includes("replace-me") ||
    lower.includes("your_") ||
    lower.includes("your-") ||
    lower.includes("secret-token") ||
    lower.includes("user:pass") ||
    lower.includes("user:password") ||
    lower.includes("localhost") ||
    ["pass", "password", "postgres", "test", "dev"].includes(lower)
  );
}

function lineAt(source, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function scanText(path, source) {
  const findings = [];
  const add = (rule, index) => {
    findings.push({ path, line: lineAt(source, index), rule });
  };

  for (const rule of providerRules) {
    rule.pattern.lastIndex = 0;
    for (const match of source.matchAll(rule.pattern)) add(rule.name, match.index);
  }

  discordWebhook.lastIndex = 0;
  for (const match of source.matchAll(discordWebhook)) {
    if (!isPlaceholder(match[0])) add("discord-webhook", match.index);
  }

  databaseUrl.lastIndex = 0;
  for (const match of source.matchAll(databaseUrl)) {
    const password = match[1];
    const hostname = match[2].toLowerCase();
    const exampleHost =
      ["localhost", "127.0.0.1", "db", "database", "host"].includes(
        hostname,
      ) ||
      hostname.startsWith("your-") ||
      hostname.endsWith(".example") ||
      hostname.endsWith(".example.com");
    if (!isPlaceholder(password) && !exampleHost) {
      add("database-url-with-password", match.index);
    }
  }

  sensitiveAssignment.lastIndex = 0;
  for (const match of source.matchAll(sensitiveAssignment)) {
    if (match[1].toUpperCase() === "DATABASE_URL") continue;
    if (!isPlaceholder(match[2])) {
      add(`literal-${match[1].toLowerCase()}`, match.index);
    }
  }

  return findings;
}

function selfTest() {
  const safe = [
    "AUTH_SECRET=your_auth_secret_here",
    "DATABASE_URL=postgres://user:pass@your-rds-host:5432/dbname",
    "OPS_ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/123/secret-token",
    "CRON_SECRET=${CRON_SECRET_FROM_STORE}",
  ].join("\n");
  const unsafe = [
    "AUTH_" + "SECRET=actual-literal-auth-secret-that-must-not-be-committed",
    "DATABASE_URL=postgres" + "://app:a-real-password@db.internal.invalid/game",
    "https://discord.com/api/" +
      "webhooks/123456789/actualWebhookToken987654321",
  ].join("\n");
  if (scanText("safe.fixture", safe).length !== 0) {
    throw new Error("safe fixture produced a secret finding");
  }
  if (scanText("unsafe.fixture", unsafe).length !== 3) {
    throw new Error("unsafe fixture did not produce all expected findings");
  }
  console.log("SECRET GUARD SELF-TEST PASS");
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "buffer",
  maxBuffer: 64 * 1024 * 1024,
})
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const findings = [];
for (const path of trackedFiles) {
  if ([".pem", ".key", ".p12", ".pfx"].includes(extname(path).toLowerCase())) {
    findings.push({ path, line: 1, rule: "tracked-credential-file" });
    continue;
  }
  const content = readFileSync(path);
  if (content.length > MAX_TEXT_FILE_BYTES || content.includes(0)) continue;
  findings.push(...scanText(path, content.toString("utf8")));
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(
      `SECRET GUARD FAIL: ${finding.path}:${finding.line} (${finding.rule})`,
    );
  }
  console.error(
    `SECRET GUARD FAIL: ${findings.length} potential secret(s); values intentionally redacted`,
  );
  process.exit(1);
}

console.log(`SECRET GUARD PASS: ${trackedFiles.length} tracked files checked`);
