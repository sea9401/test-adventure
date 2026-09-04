#!/usr/bin/env node

import { appendFileSync, lstatSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const allowedStatuses = new Set([
  "not-applicable",
  "technical-only",
  "recorded",
  "reported",
]);

const contentChangeRecordRoot = resolve("docs/content-modification-records");
const contentChangeRecordError =
  "content change record must reference an existing Markdown file under docs/content-modification-records/";

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

function validateContentChangeRecord(reference) {
  if (!reference || isAbsolute(reference) || !reference.endsWith(".md")) {
    fail(contentChangeRecordError);
  }

  const resolved = resolve(reference);
  const pathWithinRecordRoot = relative(contentChangeRecordRoot, resolved);
  if (
    !pathWithinRecordRoot ||
    pathWithinRecordRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathWithinRecordRoot)
  ) {
    fail(contentChangeRecordError);
  }

  try {
    if (!lstatSync(resolved).isFile()) fail(contentChangeRecordError);
  } catch {
    fail(contentChangeRecordError);
  }
}

const status = singleLine(process.env.CONTENT_MODIFICATION_STATUS ?? "");
const summary = singleLine(process.env.CONTENT_MODIFICATION_SUMMARY ?? "");
const recordReference = singleLine(
  process.env.CONTENT_MODIFICATION_RECORD_REFERENCE ?? "",
);
const reportReference = singleLine(
  process.env.CONTENT_MODIFICATION_REPORT_REFERENCE ?? "",
);
const deploySha = singleLine(process.env.DEPLOY_SHA ?? "");

if (!allowedStatuses.has(status)) {
  fail(
    "invalid content modification status; choose not-applicable, technical-only, recorded, or reported",
  );
}
if (!summary) {
  fail("review summary is required");
}
if (status === "recorded") {
  validateContentChangeRecord(recordReference);
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
      `| 내부 변경 기록 | ${recordReference || "해당 없음"} |`,
      `| 공식 신고 접수번호·기록 | ${reportReference || "해당 없음"} |`,
      "",
    ].join("\n"),
    "utf8",
  );
}

console.log(`content modification review: ${status}`);
