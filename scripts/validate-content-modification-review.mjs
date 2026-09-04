#!/usr/bin/env node

import { appendFileSync } from "node:fs";

const allowedStatuses = new Set([
  "not-applicable",
  "technical-only",
  "reported",
]);

function singleLine(value) {
  return value
    .trim()
    .replace(/\r?\n/g, " ")
    .replaceAll("|", "/")
    .replaceAll("`", "'")
    .replace(/\s+/g, " ");
}

function fail(message) {
  console.error(`CONTENT MODIFICATION REVIEW ERROR: ${message}`);
  process.exit(1);
}

const status = singleLine(process.env.CONTENT_MODIFICATION_STATUS ?? "");
const summary = singleLine(process.env.CONTENT_MODIFICATION_SUMMARY ?? "");
const reportReference = singleLine(
  process.env.CONTENT_MODIFICATION_REPORT_REFERENCE ?? "",
);
const deploySha = singleLine(process.env.DEPLOY_SHA ?? "");

if (!allowedStatuses.has(status)) {
  fail(
    "invalid content modification status; choose not-applicable, technical-only, or reported",
  );
}
if (!summary) {
  fail("review summary is required");
}
if (status === "reported" && !reportReference) {
  fail("report reference is required when status is reported");
}

const githubStepSummary = process.env.GITHUB_STEP_SUMMARY?.trim();
if (githubStepSummary) {
  appendFileSync(
    githubStepSummary,
    [
      "",
      "## 게임물 내용수정 검토",
      "",
      "| 항목 | 기록 |",
      "| --- | --- |",
      `| 배포 SHA | \`${deploySha || "미기록"}\` |`,
      `| 검토 상태 | \`${status}\` |`,
      `| 변경 요약·판단 근거 | ${summary} |`,
      `| 신고 접수번호·기록 | ${reportReference || "해당 없음"} |`,
      "",
    ].join("\n"),
    "utf8",
  );
}

console.log(`content modification review: ${status}`);
