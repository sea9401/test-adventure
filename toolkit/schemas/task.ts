import type { ArtifactOperation, ArtifactScope } from "../core/artifacts";

export type ExternalAction =
  | "asset-rights"
  | "push"
  | "pr"
  | "merge-staging"
  | "deploy-test";

export type ToolkitPhase =
  | "scaffold"
  | "images"
  | "verify"
  | "checkpoint"
  | "release";

export type StepStatus = "pending" | "running" | "passed" | "failed";

export type StepState = {
  status: StepStatus;
  inputHash: string;
  outputHash?: string;
  dependsOn: readonly string[];
  attempts: number;
  startedAt?: string;
  finishedAt?: string;
  logPath?: string;
  errorSummary?: string;
};

export type ArtifactRecord = {
  scope: ArtifactScope;
  path: string;
  operation: ArtifactOperation;
  ownershipKey?: string;
  outputHash: string;
  byteLength: number;
};

export type ApprovalRecord = {
  action: ExternalAction;
  target: string;
  reason: string;
  approvedAt: string;
};

export type ToolkitTaskState = {
  schemaVersion: 1;
  taskId: string;
  adapterId: string;
  adapterSpecVersion: number;
  specPath: string;
  baseSha: string;
  phase: ToolkitPhase;
  createdAt: string;
  updatedAt: string;
  steps: Readonly<Record<string, StepState>>;
  artifacts: readonly ArtifactRecord[];
  approvals: readonly ApprovalRecord[];
  manualPaths: readonly string[];
};
