#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const MIB = 1024 * 1024;
const envPath =
  process.env.RESOURCE_MONITOR_ENV_PATH ?? "/run/adventure-rpg/production.env";
const statePath =
  process.env.RDS_MEMORY_MONITOR_STATE_PATH ??
  "/tmp/adventure-rds-memory-monitor.state.json";
const dbInstanceId = process.env.RDS_DB_INSTANCE_ID ?? "adventure-rpg-db";
const region = process.env.AWS_REGION ?? "ap-northeast-2";
const thresholdMiB = positiveNumber(
  process.env.RDS_FREEABLE_MEMORY_MIN_MIB,
  192,
);
const cooldownSeconds = positiveNumber(
  process.env.RDS_MEMORY_ALERT_COOLDOWN_SECONDS,
  1_800,
);
const nowMs = positiveNumber(process.env.RDS_MONITOR_NOW_MS, Date.now());

function positiveNumber(raw, fallback) {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
function readEnvValue(key) {
  try {
    const line = readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find((entry) => entry.startsWith(`${key}=`));
    if (!line) return "";
    return line.slice(key.length + 1).replace(/^"|"$/g, "").trim();
  } catch {
    return "";
  }
}

function readState() {
  try {
    const value = JSON.parse(readFileSync(statePath, "utf8"));
    if (
      (value.status === "ok" || value.status === "alert") &&
      Number.isFinite(value.alertedAtMs)
    ) {
      return value;
    }
  } catch {}
  return { status: "ok", alertedAtMs: 0 };
}

function writeState(state) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
}

function readFreeableMemoryBytes() {
  const injected = process.env.RDS_MONITOR_FREEABLE_MEMORY_BYTES;
  if (injected != null && injected !== "") {
    const value = Number(injected);
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  const end = new Date(nowMs);
  const start = new Date(nowMs - 5 * 60_000);
  const result = spawnSync(
    "aws",
    [
      "cloudwatch",
      "get-metric-statistics",
      "--namespace",
      "AWS/RDS",
      "--metric-name",
      "FreeableMemory",
      "--dimensions",
      `Name=DBInstanceIdentifier,Value=${dbInstanceId}`,
      "--start-time",
      start.toISOString(),
      "--end-time",
      end.toISOString(),
      "--period",
      "60",
      "--statistics",
      "Minimum",
      "--region",
      region,
      "--output",
      "json",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    const detail = (result.stderr || result.error?.message || "unknown error").trim();
    console.error(`RDS MEMORY MONITOR WARN: CloudWatch 조회 실패 (${detail})`);
    return null;
  }

  try {
    const body = JSON.parse(result.stdout);
    const values = Array.isArray(body.Datapoints)
      ? body.Datapoints.map((point) => Number(point.Minimum)).filter(Number.isFinite)
      : [];
    if (values.length === 0) {
      console.error("RDS MEMORY MONITOR WARN: 최근 FreeableMemory 데이터가 없습니다");
      return null;
    }
    return Math.min(...values);
  } catch (error) {
    console.error(
      `RDS MEMORY MONITOR WARN: CloudWatch 응답 해석 실패 (${error instanceof Error ? error.message : String(error)})`,
    );
    return null;
  }
}

async function sendWebhook(message) {
  const webhookUrl =
    process.env.OPS_ALERT_WEBHOOK_URL?.trim() || readEnvValue("OPS_ALERT_WEBHOOK_URL");
  if (!webhookUrl) {
    console.error("RDS MEMORY MONITOR WARN: OPS_ALERT_WEBHOOK_URL 미설정 — journal에만 기록합니다");
    return;
  }
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: message,
        content: message,
        detail: { source: "rds-memory-monitor", dbInstanceId },
        at: new Date(nowMs).toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error(
      `RDS MEMORY MONITOR WARN: 운영 webhook 전송 실패 (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

const freeableBytes = readFreeableMemoryBytes();
if (freeableBytes == null) process.exit(0);

const freeableMiB = freeableBytes / MIB;
const state = readState();
if (freeableMiB < thresholdMiB) {
  const message =
    `🚨 **RDS 메모리 부족 경고**\n` +
    `게임 DB의 사용 가능한 메모리가 경고 기준 아래로 내려갔습니다.\n\n` +
    `- DB: ${dbInstanceId}\n` +
    `- 최근 5분 최저 가용 메모리: ${freeableMiB.toFixed(1)} MiB\n` +
    `- 경고 기준: ${thresholdMiB.toFixed(0)} MiB 미만\n\n` +
    `**확인할 일**\nRDS FreeableMemory와 현재 요청량을 확인하세요. 같은 알림은 문제가 계속되면 30분 뒤 다시 전송됩니다.`;
  console.error(`RDS MEMORY WARN: freeable=${freeableMiB.toFixed(1)}MiB threshold=${thresholdMiB}MiB`);
  const cooldownElapsed =
    state.status !== "alert" ||
    nowMs - state.alertedAtMs >= cooldownSeconds * 1_000;
  if (cooldownElapsed) {
    await sendWebhook(message);
    writeState({ status: "alert", alertedAtMs: nowMs });
  } else {
    console.error("RDS MEMORY ALERT SUPPRESSED: cooldown active");
  }
} else if (state.status === "alert") {
  const message =
    `✅ **RDS 메모리가 정상으로 돌아왔습니다**\n` +
    `게임 DB의 사용 가능한 메모리가 경고 기준 위로 회복됐습니다.\n\n` +
    `- DB: ${dbInstanceId}\n` +
    `- 최근 5분 최저 가용 메모리: ${freeableMiB.toFixed(1)} MiB`;
  console.log(`RDS MEMORY RECOVERED: freeable=${freeableMiB.toFixed(1)}MiB`);
  await sendWebhook(message);
  writeState({ status: "ok", alertedAtMs: 0 });
} else {
  console.log(
    `RDS MEMORY OK: freeable=${freeableMiB.toFixed(1)}MiB threshold=${thresholdMiB}MiB`,
  );
  writeState({ status: "ok", alertedAtMs: 0 });
}
