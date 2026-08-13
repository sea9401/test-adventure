#!/usr/bin/env node

import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_STATE_DIRECTORY =
  "/var/lib/adventure-resource-monitor/heartbeats";
const DEFAULT_RULES_PATH = "deploy/ops-heartbeats.json";
const DEFAULT_ALERT_STATE_PATH =
  "/var/lib/adventure-resource-monitor/heartbeat-alert-state.json";
const DEFAULT_ENV_PATH = "/run/adventure-rpg/production.env";
const DEFAULT_COOLDOWN_MS = 30 * 60_000;
const DEFAULT_MISSING_GRACE_SECONDS = 30 * 60;

function assertHeartbeatKey(key) {
  if (
    typeof key !== "string" ||
    key.length < 1 ||
    key.length > 160 ||
    !/^[a-z0-9][a-z0-9:._/-]*$/i.test(key)
  ) {
    throw new Error("heartbeat key must use letters, numbers, ':', '.', '_', '/', or '-'");
  }
}

function heartbeatFileName(key) {
  assertHeartbeatKey(key);
  return `${key.replace(/[^a-z0-9._-]/gi, "_")}.json`;
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, path);
}

function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

export function recordHeartbeat(key, succeededAtMs = Date.now(), stateDirectory = DEFAULT_STATE_DIRECTORY) {
  assertHeartbeatKey(key);
  if (!Number.isSafeInteger(succeededAtMs) || succeededAtMs < 0) {
    throw new Error("heartbeat timestamp must be a non-negative safe integer");
  }
  const path = join(stateDirectory, heartbeatFileName(key));
  writeJsonAtomic(path, { key, succeededAtMs });
  return path;
}

export function readHeartbeatRecords(stateDirectory = DEFAULT_STATE_DIRECTORY) {
  let fileNames = [];
  try {
    fileNames = readdirSync(stateDirectory);
  } catch {
    return {};
  }

  const records = {};
  for (const fileName of fileNames) {
    if (!fileName.endsWith(".json") || fileName.startsWith(".")) continue;
    const record = readJson(join(stateDirectory, fileName));
    if (
      record &&
      typeof record.key === "string" &&
      Number.isSafeInteger(record.succeededAtMs) &&
      record.succeededAtMs >= 0
    ) {
      records[record.key] = Math.max(records[record.key] ?? 0, record.succeededAtMs);
    }
  }
  return records;
}

function validateRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new Error("heartbeat rules must be a non-empty array");
  }
  const seen = new Set();
  return rules.map((rule) => {
    assertHeartbeatKey(rule?.key);
    if (seen.has(rule.key)) throw new Error(`duplicate heartbeat rule: ${rule.key}`);
    seen.add(rule.key);
    if (typeof rule.label !== "string" || rule.label.trim() === "") {
      throw new Error(`heartbeat label is required: ${rule.key}`);
    }
    if (!Number.isFinite(rule.maxAgeSeconds) || rule.maxAgeSeconds <= 0) {
      throw new Error(`maxAgeSeconds must be positive: ${rule.key}`);
    }
    if (
      rule.missingGraceSeconds != null &&
      (!Number.isFinite(rule.missingGraceSeconds) || rule.missingGraceSeconds < 0)
    ) {
      throw new Error(`missingGraceSeconds must be non-negative: ${rule.key}`);
    }
    return {
      key: rule.key,
      label: rule.label.trim(),
      maxAgeSeconds: Math.floor(rule.maxAgeSeconds),
      ...(rule.missingGraceSeconds == null
        ? {}
        : { missingGraceSeconds: Math.floor(rule.missingGraceSeconds) }),
    };
  });
}

export function evaluateHeartbeats(
  rules,
  records,
  nowMs = Date.now(),
  initializedAtMs = nowMs,
  defaultMissingGraceSeconds = DEFAULT_MISSING_GRACE_SECONDS,
) {
  const validRules = validateRules(rules);
  const initializedAgeSeconds = Math.max(0, Math.floor((nowMs - initializedAtMs) / 1_000));
  const issues = [];

  for (const rule of validRules) {
    const succeededAtMs = records[rule.key];
    if (!Number.isSafeInteger(succeededAtMs)) {
      const graceSeconds = rule.missingGraceSeconds ?? defaultMissingGraceSeconds;
      if (initializedAgeSeconds >= graceSeconds) {
        issues.push({
          key: rule.key,
          label: rule.label,
          reason: "missing",
          ageSeconds: null,
          maxAgeSeconds: rule.maxAgeSeconds,
        });
      }
      continue;
    }

    const ageSeconds = Math.max(0, Math.floor((nowMs - succeededAtMs) / 1_000));
    if (ageSeconds > rule.maxAgeSeconds) {
      issues.push({
        key: rule.key,
        label: rule.label,
        reason: "stale",
        ageSeconds,
        maxAgeSeconds: rule.maxAgeSeconds,
      });
    }
  }

  return issues;
}

function issueKey(issues) {
  return issues
    .map((issue) => `${issue.key}:${issue.reason}`)
    .sort()
    .join(",");
}

export function decideHeartbeatAlert(
  issues,
  previousState,
  nowMs = Date.now(),
  cooldownMs = DEFAULT_COOLDOWN_MS,
) {
  const key = issueKey(issues);
  const previousKey = typeof previousState?.key === "string" ? previousState.key : "";
  const previousAtMs = Number.isFinite(previousState?.alertedAtMs)
    ? previousState.alertedAtMs
    : 0;

  if (key === "") {
    return {
      notify: false,
      notifyRecovery: previousKey !== "",
      nextState: { key: "", alertedAtMs: 0 },
    };
  }

  const notify = key !== previousKey || nowMs - previousAtMs >= cooldownMs;
  return {
    notify,
    notifyRecovery: false,
    nextState: {
      key,
      alertedAtMs: notify ? nowMs : previousAtMs,
    },
  };
}

function readEnvValue(envPath, key) {
  try {
    const line = readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find((entry) => entry.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).replace(/^"|"$/g, "").trim() : "";
  } catch {
    return "";
  }
}

async function sendWebhook(webhookUrl, message, detail) {
  if (!webhookUrl) {
    console.error("HEARTBEAT WARN: OPS_ALERT_WEBHOOK_URL 미설정 — journal에만 기록합니다");
    return false;
  }
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: message,
        content: message,
        detail: { source: "ops-heartbeat", ...detail },
        at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return true;
  } catch (error) {
    console.error(
      `HEARTBEAT WARN: 운영 webhook 전송 실패 (${error instanceof Error ? error.message : String(error)})`,
    );
    return false;
  }
}

function readOrInitializeStart(stateDirectory, nowMs) {
  const path = join(stateDirectory, ".initialized.json");
  const previous = readJson(path);
  if (Number.isSafeInteger(previous?.initializedAtMs)) return previous.initializedAtMs;
  writeJsonAtomic(path, { initializedAtMs: nowMs });
  return nowMs;
}

function formatDuration(seconds) {
  if (seconds == null) return "성공 기록 없음";
  if (seconds >= 3_600) return `${(seconds / 3_600).toFixed(1)}시간`;
  return `${Math.ceil(seconds / 60)}분`;
}

async function checkHeartbeats() {
  const nowMs = Number(process.env.OPS_HEARTBEAT_NOW_MS ?? Date.now());
  const stateDirectory = process.env.OPS_HEARTBEAT_DIR ?? DEFAULT_STATE_DIRECTORY;
  const rulesPath = process.env.OPS_HEARTBEAT_RULES_PATH ?? DEFAULT_RULES_PATH;
  const alertStatePath =
    process.env.OPS_HEARTBEAT_ALERT_STATE_PATH ?? DEFAULT_ALERT_STATE_PATH;
  const envPath = process.env.RESOURCE_MONITOR_ENV_PATH ?? DEFAULT_ENV_PATH;
  const missingGraceSeconds = Number(
    process.env.OPS_HEARTBEAT_MISSING_GRACE_SECONDS ??
      DEFAULT_MISSING_GRACE_SECONDS,
  );
  const cooldownMs =
    Number(process.env.OPS_HEARTBEAT_ALERT_COOLDOWN_SECONDS ?? 1_800) * 1_000;
  const body = readJson(resolve(rulesPath));
  const rules = validateRules(body?.rules);
  const initializedAtMs = readOrInitializeStart(stateDirectory, nowMs);
  const records = readHeartbeatRecords(stateDirectory);
  const issues = evaluateHeartbeats(
    rules,
    records,
    nowMs,
    initializedAtMs,
    missingGraceSeconds,
  );
  const previousState = readJson(alertStatePath);
  const decision = decideHeartbeatAlert(issues, previousState, nowMs, cooldownMs);
  const webhookUrl =
    process.env.OPS_ALERT_WEBHOOK_URL?.trim() ||
    readEnvValue(envPath, "OPS_ALERT_WEBHOOK_URL");

  if (issues.length > 0) {
    const details = issues
      .map(
        (issue) =>
          `- ${issue.label}: ${formatDuration(issue.ageSeconds)} (허용 ${formatDuration(issue.maxAgeSeconds)})`,
      )
      .join("\n");
    const message =
      `🚨 **정기 운영 작업이 제시간에 완료되지 않았습니다**\n` +
      `크론 또는 백업 성공 기록이 누락되었거나 오래되었습니다.\n\n${details}\n\n` +
      `**확인할 일**\ncrond 상태, 백업 로그와 각 작업의 journal을 확인하세요.`;
    console.error(`HEARTBEAT ALERT: ${decision.nextState.key}`);
    if (decision.notify) {
      await sendWebhook(webhookUrl, message, {
        issues: issues.map(({ key, reason, ageSeconds, maxAgeSeconds }) => ({
          key,
          reason,
          ageSeconds,
          maxAgeSeconds,
        })),
      });
    }
  } else if (decision.notifyRecovery) {
    const message =
      "✅ **정기 운영 작업 heartbeat가 정상으로 돌아왔습니다**\n" +
      "지연되었던 크론·백업 성공 기록이 모두 허용 시간 안으로 회복됐습니다.";
    console.log("HEARTBEAT RECOVERED");
    await sendWebhook(webhookUrl, message, { recovered: true });
  } else {
    console.log(`HEARTBEAT OK: ${rules.length} critical jobs`);
  }

  writeJsonAtomic(alertStatePath, decision.nextState);
  return issues.length === 0 ? 0 : 1;
}

async function main() {
  const command = process.argv[2];
  if (command === "record") {
    const key = process.argv[3] ?? "";
    const stateDirectory = process.env.OPS_HEARTBEAT_DIR ?? DEFAULT_STATE_DIRECTORY;
    const nowMs = Number(process.env.OPS_HEARTBEAT_NOW_MS ?? Date.now());
    recordHeartbeat(key, nowMs, stateDirectory);
    console.log(`HEARTBEAT RECORDED: ${key}`);
    return;
  }
  if (command === "check") {
    await checkHeartbeats();
    return;
  }
  console.error("usage: node scripts/ops-heartbeat.mjs record <key> | check");
  process.exitCode = 2;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
