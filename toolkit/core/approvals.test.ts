import { describe, expect, it } from "vitest";

import { recordApproval, requireApproval } from "./approvals";
import type { ToolkitTaskState } from "../schemas/task";

function state(taskId = "boss-red"): ToolkitTaskState {
  return {
    schemaVersion: 1,
    taskId,
    adapterId: "unexplored-boss",
    adapterSpecVersion: 1,
    specPath: "specs/boss-red.yaml",
    baseSha: "a".repeat(40),
    phase: "release",
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    steps: {},
    artifacts: [],
    approvals: [],
    manualPaths: [],
  };
}

describe("toolkit approvals", () => {
  it("lets a staging deploy approval cover only its required staging actions", () => {
    const approved = recordApproval(
      state(),
      {
        action: "deploy-test",
        target: "staging",
        reason: "사용자가 테스트 서버 배포를 명시적으로 요청함",
        approvedAt: "2026-09-02T00:00:00.000Z",
      },
      new Date("2026-09-02T00:01:00.000Z"),
    );

    expect(requireApproval(approved, "push", "staging")).toBeDefined();
    expect(requireApproval(approved, "pr", "staging")).toBeDefined();
    expect(requireApproval(approved, "merge-staging", "staging")).toBeDefined();
    expect(requireApproval(approved, "deploy-test", "staging")).toBeDefined();
    expect(() => requireApproval(approved, "deploy-test", "production")).toThrow(
      "approval does not cover production",
    );
  });

  it("does not let a PR approval imply merge or deployment", () => {
    const approved = recordApproval(
      state(),
      {
        action: "pr",
        target: "staging",
        reason: "스테이징 PR 요청",
        approvedAt: "2026-09-02T00:00:00.000Z",
      },
      new Date("2026-09-02T00:01:00.000Z"),
    );

    expect(requireApproval(approved, "push", "staging")).toBeDefined();
    expect(requireApproval(approved, "pr", "staging")).toBeDefined();
    expect(() => requireApproval(approved, "merge-staging", "staging")).toThrow(
      "no approval covers merge-staging@staging",
    );
  });

  it("keeps asset-rights approval inside the same task", () => {
    const approved = recordApproval(
      state(),
      {
        action: "asset-rights",
        target: "boss-red",
        reason: "이 작업 이미지 출처 기록 승인",
        approvedAt: "2026-09-02T00:00:00.000Z",
      },
      new Date("2026-09-02T00:01:00.000Z"),
    );

    expect(requireApproval(approved, "asset-rights", "boss-red")).toBeDefined();
    expect(() => requireApproval(approved, "asset-rights", "boss-blue")).toThrow(
      "no approval covers asset-rights@boss-blue",
    );
  });

  it("rejects production targets, empty reasons, and future timestamps", () => {
    const base = {
      action: "deploy-test" as const,
      target: "staging",
      reason: "테스트 배포",
      approvedAt: "2026-09-02T00:00:00.000Z",
    };
    const now = new Date("2026-09-02T00:00:00.000Z");

    expect(() =>
      recordApproval(state(), { ...base, target: "production" }, now),
    ).toThrow("production approvals are not supported");
    expect(() => recordApproval(state(), { ...base, reason: "  " }, now)).toThrow(
      "approval reason is required",
    );
    expect(() =>
      recordApproval(
        state(),
        { ...base, approvedAt: "2026-09-02T00:05:01.000Z" },
        now,
      ),
    ).toThrow("approval timestamp is too far in the future");
  });
});
