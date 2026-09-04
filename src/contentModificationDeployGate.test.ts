import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "scripts/validate-content-modification-review.mjs");
const temporaryDirectories: string[] = [];

type ReviewInput = {
  status?: string;
  summary?: string;
  reference?: string;
  recordReference?: string;
  deploySha?: string;
  withJobSummary?: boolean;
};

function runReview(input: ReviewInput) {
  const directory = mkdtempSync(join(tmpdir(), "content-modification-review-"));
  temporaryDirectories.push(directory);
  const jobSummary = join(directory, "job-summary.md");
  writeFileSync(jobSummary, "# Existing summary\n", "utf8");

  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      CONTENT_MODIFICATION_STATUS: input.status ?? "",
      CONTENT_MODIFICATION_SUMMARY: input.summary ?? "",
      CONTENT_MODIFICATION_REPORT_REFERENCE: input.reference ?? "",
      CONTENT_MODIFICATION_RECORD_REFERENCE: input.recordReference ?? "",
      DEPLOY_SHA: input.deploySha ?? "a".repeat(40),
      GITHUB_STEP_SUMMARY: input.withJobSummary ? jobSummary : "",
    },
  });

  return {
    ...result,
    jobSummary: readFileSync(jobSummary, "utf8"),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("content modification deployment review", () => {
  it.each(["not-applicable", "technical-only"])(
    "accepts %s without a report reference",
    (status) => {
      const result = runReview({ status, summary: "인증 오류만 수정" });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`content modification review: ${status}`);
      expect(result.stderr).toBe("");
    },
  );

  it("accepts a filed report and records a sanitized Actions summary", () => {
    const result = runReview({
      status: "reported",
      summary: "신규 전투 연출\n폭력성 검토 | 완료",
      reference: "GCRB-20260904-1 | 접수",
      deploySha: "b".repeat(40),
      withJobSummary: true,
    });

    expect(result.status).toBe(0);
    expect(result.jobSummary).toContain("# Existing summary");
    expect(result.jobSummary).toContain("## 게임물 내용수정 검토");
    expect(result.jobSummary).toContain("`reported`");
    expect(result.jobSummary).toContain("`bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`");
    expect(result.jobSummary).toContain("신규 전투 연출 폭력성 검토 / 완료");
    expect(result.jobSummary).toContain("GCRB-20260904-1 / 접수");
  });

  it("accepts an existing repository content-change record", () => {
    const result = runReview({
      status: "recorded",
      summary: "미개척지 콘텐츠 운영 반영",
      recordReference:
        "docs/content-modification-records/2026-09-05-unexplored-production.md",
      deploySha: "c".repeat(40),
      withJobSummary: true,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("content modification review: recorded");
    expect(result.stderr).toBe("");
    expect(result.jobSummary).toContain("`recorded`");
    expect(result.jobSummary).toContain("내부 변경 기록");
    expect(result.jobSummary).toContain(
      "docs/content-modification-records/2026-09-05-unexplored-production.md",
    );
    expect(result.jobSummary).toContain("공식 신고 접수번호·기록");
    expect(result.jobSummary).toContain("해당 없음");
  });

  it.each([
    "",
    "docs/content-modification-records/missing.md",
    "../outside.md",
    "/tmp/outside.md",
    "docs/ops-runbook.md",
    "docs/content-modification-records/not-markdown.txt",
  ])("rejects an invalid recorded reference: %s", (recordReference) => {
    const result = runReview({
      status: "recorded",
      summary: "미개척지 콘텐츠 운영 반영",
      recordReference,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("content change record");
  });

  it("rejects a filed-report status without its report reference", () => {
    const result = runReview({
      status: "reported",
      summary: "신규 전투 연출 추가",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("report reference is required");
  });

  it("rejects a blank review summary", () => {
    const result = runReview({
      status: "technical-only",
      summary: "   \n  ",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("review summary is required");
  });

  it("rejects an unknown review status", () => {
    const result = runReview({
      status: "report-later",
      summary: "나중에 신고",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid content modification status");
  });
});
