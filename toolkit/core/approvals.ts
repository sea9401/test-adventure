import type {
  ApprovalRecord,
  ExternalAction,
  ToolkitTaskState,
} from "../schemas/task";

export type ApprovalRequest = ApprovalRecord;

const STAGING_ACTIONS: readonly ExternalAction[] = [
  "push",
  "pr",
  "merge-staging",
  "deploy-test",
];

export function recordApproval(
  state: ToolkitTaskState,
  request: ApprovalRequest,
  now = new Date(),
): ToolkitTaskState {
  if (request.target === "production") {
    throw new Error("production approvals are not supported");
  }
  if (request.reason.trim() === "") {
    throw new Error("approval reason is required");
  }
  const approvedAt = new Date(request.approvedAt);
  if (Number.isNaN(approvedAt.getTime())) {
    throw new Error("approval timestamp is invalid");
  }
  if (approvedAt.getTime() > now.getTime() + 5 * 60 * 1000) {
    throw new Error("approval timestamp is too far in the future");
  }
  if (
    (STAGING_ACTIONS.includes(request.action) && request.target !== "staging") ||
    (request.action === "asset-rights" && request.target !== state.taskId)
  ) {
    throw new Error(
      `approval target ${request.target} is invalid for ${request.action}`,
    );
  }

  const approval: ApprovalRecord = {
    ...request,
    reason: request.reason.trim(),
    approvedAt: approvedAt.toISOString(),
  };
  const approvals = state.approvals.filter(
    (existing) =>
      existing.action !== approval.action || existing.target !== approval.target,
  );
  return {
    ...state,
    updatedAt: approval.approvedAt,
    approvals: [...approvals, approval],
  };
}

function covers(
  approval: ApprovalRecord,
  action: ExternalAction,
  target: string,
): boolean {
  if (approval.target !== target) {
    return false;
  }
  if (approval.action === action) {
    return true;
  }
  if (target !== "staging") {
    return false;
  }
  if (approval.action === "deploy-test") {
    return STAGING_ACTIONS.includes(action);
  }
  return approval.action === "pr" && action === "push";
}

export function requireApproval(
  state: ToolkitTaskState,
  action: ExternalAction,
  target: string,
): ApprovalRecord {
  if (target === "production") {
    throw new Error("approval does not cover production");
  }
  const approval = [...state.approvals]
    .reverse()
    .find((candidate) => covers(candidate, action, target));
  if (approval === undefined) {
    throw new Error(`no approval covers ${action}@${target}`);
  }
  return approval;
}
